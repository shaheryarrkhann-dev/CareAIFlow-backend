/**
 * WAC/RCW Compliance Service
 * Handles Washington Administrative Code and Revised Code of Washington compliance
 * for Adult Family Home (AFH) form schema generation
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { OpenAIEmbeddings } = require('@langchain/openai');
const prisma = new PrismaClient();

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
  model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} Embedding vector
 */
async function getEmbedding(text) {
  const vectors = await embeddings.embedDocuments([text]);
  return vectors[0];
}

// WA LawDoc API base URL
const WA_LAWDOC_API = 'https://lawfilesext.leg.wa.gov/law';
const WAC_BASE_URL = 'https://apps.leg.wa.gov/wac';
const RCW_BASE_URL = 'https://apps.leg.wa.gov/rcw';

// Table prefix for regulations
const REGULATION_TABLE = 'wac_rcw_regulations';

// Key WAC/RCW sections for Adult Family Homes
const AFH_REGULATIONS = {
  wac: [
    '388-76-10010', // General requirements
    '388-76-10600', // Resident rights
    '388-76-10620', // Resident agreements
    '388-76-10630', // Resident funds
    '388-76-10640', // Resident property
    '388-76-10650', // Resident records
    '388-76-10700', // Medication management
    '388-76-10710', // Medication administration
    '388-76-10720', // Medication storage
    '388-76-10800', // Emergency preparedness
    '388-76-10810', // Fire safety
    '388-76-10900', // Staff training
    '388-76-10910', // Background checks
    '388-76-11000', // Infection control
  ],
  rcw: [
    '70.128.010', // AFH definitions
    '70.128.060', // License requirements
    '70.128.120', // Resident rights
    '70.129.030', // Medication consent
    '70.129.040', // Healthcare decisions
    '70.129.050', // Notification requirements
    '70.129.090', // Resident agreements
    '70.129.110', // Funds management
  ]
};

/**
 * Fetch WAC regulation from WA LawDoc API
 * @param {string} citeCode - WAC cite code (e.g., "388-76-10600")
 * @returns {Promise<Object>} Regulation data
 */
async function fetchWACRegulation(citeCode) {
  try {
    console.log(`[WAC-RCW] Fetching WAC ${citeCode}...`);
    
    // Try WA LawDoc API first
    try {
      const response = await axios.get(`${WA_LAWDOC_API}/wac/${citeCode}`, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.data) {
        console.log(`[WAC-RCW] ✅ Fetched WAC ${citeCode} from API`);
        return {
          type: 'wac',
          citeCode,
          title: response.data.title || '',
          content: response.data.content || response.data.text || '',
          effectiveDate: response.data.effectiveDate || new Date().toISOString(),
          version: response.data.version || '1.0',
          source: 'api',
          lastFetched: new Date().toISOString()
        };
      }
    } catch (apiError) {
      console.warn(`[WAC-RCW] API failed for WAC ${citeCode}, falling back to web scraping`);
    }
    
    // Fallback to web scraping
    const url = `${WAC_BASE_URL}/default.aspx?cite=${citeCode}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    // Basic HTML parsing (in production, use cheerio or similar)
    const html = response.data;
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const contentMatch = html.match(/<div class="Section"[^>]*>([\s\S]*?)<\/div>/i);
    
    return {
      type: 'wac',
      citeCode,
      title: titleMatch ? titleMatch[1].trim() : `WAC ${citeCode}`,
      content: contentMatch ? contentMatch[1].replace(/<[^>]*>/g, '').trim() : '',
      effectiveDate: new Date().toISOString(),
      version: '1.0',
      source: 'web',
      lastFetched: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[WAC-RCW] ❌ Failed to fetch WAC ${citeCode}:`, error.message);
    throw new Error(`Failed to fetch WAC ${citeCode}: ${error.message}`);
  }
}

/**
 * Fetch RCW regulation from WA LawDoc API
 * @param {string} citeCode - RCW cite code (e.g., "70.129.030")
 * @returns {Promise<Object>} Regulation data
 */
async function fetchRCWRegulation(citeCode) {
  try {
    console.log(`[WAC-RCW] Fetching RCW ${citeCode}...`);
    
    // Try WA LawDoc API first
    try {
      const response = await axios.get(`${WA_LAWDOC_API}/rcw/${citeCode}`, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.data) {
        console.log(`[WAC-RCW] ✅ Fetched RCW ${citeCode} from API`);
        return {
          type: 'rcw',
          citeCode,
          title: response.data.title || '',
          content: response.data.content || response.data.text || '',
          effectiveDate: response.data.effectiveDate || new Date().toISOString(),
          version: response.data.version || '1.0',
          source: 'api',
          lastFetched: new Date().toISOString()
        };
      }
    } catch (apiError) {
      console.warn(`[WAC-RCW] API failed for RCW ${citeCode}, falling back to web scraping`);
    }
    
    // Fallback to web scraping
    const url = `${RCW_BASE_URL}/default.aspx?cite=${citeCode}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    // Basic HTML parsing
    const html = response.data;
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const contentMatch = html.match(/<div class="Section"[^>]*>([\s\S]*?)<\/div>/i);
    
    return {
      type: 'rcw',
      citeCode,
      title: titleMatch ? titleMatch[1].trim() : `RCW ${citeCode}`,
      content: contentMatch ? contentMatch[1].replace(/<[^>]*>/g, '').trim() : '',
      effectiveDate: new Date().toISOString(),
      version: '1.0',
      source: 'web',
      lastFetched: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[WAC-RCW] ❌ Failed to fetch RCW ${citeCode}:`, error.message);
    throw new Error(`Failed to fetch RCW ${citeCode}: ${error.message}`);
  }
}

/**
 * Chunk regulation content into smaller pieces (500-1000 tokens)
 * @param {string} content - Full regulation content
 * @param {number} chunkSize - Target chunk size in tokens (default: 750)
 * @returns {Array<string>} Array of content chunks
 */
function chunkRegulationContent(content, chunkSize = 750) {
  // Simple token estimation: ~4 characters per token
  const targetChars = chunkSize * 4;
  
  // Split by paragraphs first
  const paragraphs = content.split(/\n\n+/);
  const chunks = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;
    
    // If adding this paragraph exceeds chunk size, start new chunk
    if (currentChunk.length + trimmedParagraph.length > targetChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmedParagraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [content]; // Return original if no chunks
}

/**
 * Store regulation in PostgreSQL vector database with chunking
 * @param {Object} regulation - Regulation data
 * @returns {Promise<number>} Number of chunks stored
 */
async function storeRegulationInVectorDB(regulation) {
  try {
    // Chunk the regulation content (500-1000 tokens per chunk)
    const chunks = chunkRegulationContent(regulation.content, 750);
    
    console.log(`[WAC-RCW] Chunking ${regulation.type.toUpperCase()} ${regulation.citeCode} into ${chunks.length} pieces`);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Create embedding for this chunk
      const embeddingText = `${regulation.type.toUpperCase()} ${regulation.citeCode}: ${regulation.title}\n\nSection ${i + 1} of ${chunks.length}:\n${chunk}`;
      const embedding = await getEmbedding(embeddingText);
      
      // Store in PostgreSQL
      const id = `${regulation.type}-${regulation.citeCode.replace(/\./g, '-')}-chunk-${i}`;
      const vectorString = `[${embedding.join(',')}]`;
      
      // Upsert (delete if exists, then insert)
      await prisma.$executeRaw`
        DELETE FROM "wac_rcw_regulations" WHERE "id" = ${id}
      `;
      
      await prisma.$executeRaw`
        INSERT INTO "wac_rcw_regulations" 
        ("id", "type", "citeCode", "section", "title", "text", "effectiveDate", "version", "source", "lastFetched", "chunkIndex", "totalChunks", "embedding")
        VALUES (
          ${id},
          ${regulation.type},
          ${regulation.citeCode},
          ${regulation.citeCode},
          ${regulation.title},
          ${chunk},
          ${regulation.effectiveDate},
          ${regulation.version},
          ${regulation.source},
          ${new Date()},
          ${i},
          ${chunks.length},
          ${vectorString}::vector
        )
      `;
      
      // Rate limiting between embeddings
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[WAC-RCW] ✅ Stored ${chunks.length} chunks of ${regulation.type.toUpperCase()} ${regulation.citeCode} in PostgreSQL`);
    
    return chunks.length;
  } catch (error) {
    console.error(`[WAC-RCW] ❌ Failed to store regulation in vector DB:`, error.message);
    throw error;
  }
}

/**
 * Initialize WAC/RCW regulations database
 * Fetches and stores all AFH-related regulations
 * @returns {Promise<Object>} Summary of initialization
 */
async function initializeRegulations() {
  try {
    console.log('[WAC-RCW] 🚀 Initializing WAC/RCW regulations database...');
    
    const results = {
      wac: { success: 0, failed: 0 },
      rcw: { success: 0, failed: 0 },
      errors: []
    };
    
    // Fetch and store WAC regulations
    for (const citeCode of AFH_REGULATIONS.wac) {
      try {
        const regulation = await fetchWACRegulation(citeCode);
        await storeRegulationInVectorDB(regulation);
        results.wac.success++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.wac.failed++;
        results.errors.push({ type: 'wac', citeCode, error: error.message });
      }
    }
    
    // Fetch and store RCW regulations
    for (const citeCode of AFH_REGULATIONS.rcw) {
      try {
        const regulation = await fetchRCWRegulation(citeCode);
        await storeRegulationInVectorDB(regulation);
        results.rcw.success++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.rcw.failed++;
        results.errors.push({ type: 'rcw', citeCode, error: error.message });
      }
    }
    
    console.log('[WAC-RCW] ✅ Initialization complete:');
    console.log(`  WAC: ${results.wac.success} success, ${results.wac.failed} failed`);
    console.log(`  RCW: ${results.rcw.success} success, ${results.rcw.failed} failed`);
    
    return results;
  } catch (error) {
    console.error('[WAC-RCW] ❌ Failed to initialize regulations:', error);
    throw error;
  }
}

/**
 * Find relevant WAC/RCW regulations for a field
 * Uses semantic search in vector database
 * @param {string} fieldName - Field name
 * @param {string} fieldLabel - Field label
 * @param {string} fieldType - Field type
 * @param {string} context - Additional context from form
 * @returns {Promise<Array>} Relevant regulations with citations
 */
async function findRelevantRegulations(fieldName, fieldLabel, fieldType, context = '') {
  try {
    // Create query text
    const queryText = `Adult Family Home form field: ${fieldLabel || fieldName}. Type: ${fieldType}. Context: ${context}`;
    
    // Get embedding for query
    const queryEmbedding = await getEmbedding(queryText);
    const vectorString = `[${queryEmbedding.join(',')}]`;
    
    // Search in PostgreSQL using cosine similarity
    // Returns top 5 most similar regulations
    const results = await prisma.$queryRaw`
      SELECT 
        "id",
        "type",
        "citeCode",
        "section",
        "title",
        "text",
        "effectiveDate",
        "version",
        "chunkIndex",
        "totalChunks",
        1 - (embedding <=> ${vectorString}::vector) as similarity
      FROM "wac_rcw_regulations"
      WHERE 1 - (embedding <=> ${vectorString}::vector) > 0.7
      ORDER BY embedding <=> ${vectorString}::vector
      LIMIT 5
    `;
    
    console.log(
      `[WAC-RCW] 🔎 Similarity search for "${fieldLabel || fieldName}" returned ${results.length} rows`
    );

    // Map results to expected format
    const relevantRegulations = results.map(row => ({
      type: row.type,
      citeCode: row.citeCode,
      title: row.title,
      content: row.text,
      relevanceScore: row.similarity,
      citation: `${row.type.toUpperCase()} ${row.citeCode}`
    }));
    
    console.log(`[WAC-RCW] Found ${relevantRegulations.length} relevant regulations for "${fieldLabel || fieldName}"`);
    if (relevantRegulations.length > 0) {
      const top = relevantRegulations[0];
      console.log(
        `[WAC-RCW] 🏅 Top match -> ${top.citation} (${(top.relevanceScore * 100).toFixed(1)}% similarity)`
      );
    }
    
    return relevantRegulations;
  } catch (error) {
    console.error('[WAC-RCW] ❌ Failed to find relevant regulations:', error.message);
    return []; // Return empty array on error, don't block schema generation
  }
}

/**
 * Update all regulations (monthly job)
 * @returns {Promise<Object>} Update summary
 */
async function updateAllRegulations() {
  try {
    console.log('[WAC-RCW] 🔄 Starting monthly regulation update...');
    
    const results = await initializeRegulations();
    
    console.log('[WAC-RCW] ✅ Monthly update complete');
    return results;
  } catch (error) {
    console.error('[WAC-RCW] ❌ Failed to update regulations:', error);
    throw error;
  }
}

/**
 * Get regulation by cite code
 * @param {string} type - 'wac' or 'rcw'
 * @param {string} citeCode - Cite code
 * @returns {Promise<Object>} Regulation data
 */
async function getRegulation(type, citeCode) {
  try {
    const id = `${type}-${citeCode.replace(/\./g, '-')}-chunk-0`; // Get first chunk
    
    const regulation = await prisma.wacRcwRegulation.findUnique({
      where: { id }
    });
    
    if (regulation) {
      console.log(
        `[WAC-RCW] 📦 Loaded ${type.toUpperCase()} ${citeCode} from vector store (version: ${
          regulation.version || 'unknown'
        }, fetched: ${regulation.lastFetched || 'n/a'})`
      );
      return {
        type: regulation.type,
        citeCode: regulation.citeCode,
        title: regulation.title,
        content: regulation.text,
        effectiveDate: regulation.effectiveDate,
        version: regulation.version,
        source: regulation.source
      };
    }
    
    // If not in DB, fetch and store
    const fetchedRegulation = type === 'wac' 
      ? await fetchWACRegulation(citeCode)
      : await fetchRCWRegulation(citeCode);
    
    await storeRegulationInVectorDB(fetchedRegulation);
    
    return fetchedRegulation;
  } catch (error) {
    console.error(`[WAC-RCW] ❌ Failed to get ${type.toUpperCase()} ${citeCode}:`, error.message);
    throw error;
  }
}

/**
 * Check if regulations need updating (version check)
 * @returns {Promise<Object>} Update status
 */
async function checkForRegulationUpdates() {
  try {
    console.log('[WAC-RCW] 🔍 Checking for regulation updates...');
    
    const regulationCount = await prisma.wacRcwRegulation.count();
    
    if (regulationCount === 0) {
      console.log('[WAC-RCW] ⚠️ No regulations found, initialization required');
      return {
        needsUpdate: true,
        reason: 'not_initialized',
        currentCount: 0
      };
    }
    
    // Check age of regulations (get sample)
    const sampleId = 'wac-388-76-10600-chunk-0';
    const regulation = await prisma.wacRcwRegulation.findUnique({
      where: { id: sampleId }
    });
    
    if (regulation) {
      const lastFetched = new Date(regulation.lastFetched);
      const daysSinceUpdate = (Date.now() - lastFetched.getTime()) / (1000 * 60 * 60 * 24);
      
      console.log(`[WAC-RCW] Last regulation update: ${daysSinceUpdate.toFixed(1)} days ago`);
      
      // Update if > 30 days old
      if (daysSinceUpdate > 30) {
        return {
          needsUpdate: true,
          reason: 'outdated',
          daysSinceUpdate: Math.floor(daysSinceUpdate),
          currentCount: regulationCount
        };
      }
      
      return {
        needsUpdate: false,
        reason: 'up_to_date',
        daysSinceUpdate: Math.floor(daysSinceUpdate),
        currentCount: regulationCount
      };
    }
    
    return {
      needsUpdate: true,
      reason: 'cannot_verify',
      currentCount: regulationCount
    };
  } catch (error) {
    console.error('[WAC-RCW] ❌ Failed to check for updates:', error.message);
    return {
      needsUpdate: false,
      reason: 'check_failed',
      error: error.message
    };
  }
}

/**
 * Validate field against WAC/RCW regulations and add citations
 * Used during PDF upload to enrich detected fields
 * @param {Object} field - Detected field from PDF
 * @param {string} formContext - Context about the form
 * @returns {Promise<Object>} Field with citations added
 */
async function validateAndEnrichField(field, formContext = '') {
  try {
    // Find relevant regulations for this field
    const regulations = await findRelevantRegulations(
      field.fieldName,
      field.label,
      field.type,
      formContext
    );
    
    if (regulations.length === 0) {
      // No regulations found, return field as-is
      return field;
    }
    
    // Add most relevant regulation (highest score)
    const topRegulation = regulations[0];
    
    const enrichedField = {
      ...field,
      wacCitation: topRegulation.type === 'wac' ? topRegulation.citation : (field.wacCitation || null),
      rcwCitation: topRegulation.type === 'rcw' ? topRegulation.citation : (field.rcwCitation || null),
      complianceNote: `Required by ${topRegulation.citation}: ${topRegulation.title}`,
      complianceScore: topRegulation.relevanceScore,
      regulationText: topRegulation.content.substring(0, 500) // First 500 chars
    };
    
    console.log(`[WAC-RCW] ✅ Enriched field "${field.fieldName}" with ${topRegulation.citation} (score: ${(topRegulation.relevanceScore * 100).toFixed(1)}%)`);
    
    return enrichedField;
  } catch (error) {
    console.error(`[WAC-RCW] ❌ Failed to validate field "${field.fieldName}":`, error.message);
    // Return original field on error (don't block upload)
    return field;
  }
}

/**
 * Batch validate and enrich multiple fields
 * @param {Array} fields - Array of detected fields
 * @param {string} formContext - Context about the form
 * @returns {Promise<Array>} Enriched fields with citations
 */
async function validateAndEnrichFields(fields, formContext = '') {
  try {
    console.log(`[WAC-RCW] 🔍 Validating ${fields.length} fields against WAC/RCW regulations...`);
    
    // Process fields in parallel (with concurrency limit)
    const enrichedFields = [];
    const batchSize = 5; // Process 5 at a time
    
    for (let i = 0; i < fields.length; i += batchSize) {
      const batch = fields.slice(i, i + batchSize);
      const enrichedBatch = await Promise.all(
        batch.map(field => validateAndEnrichField(field, formContext))
      );
      enrichedFields.push(...enrichedBatch);
    }
    
    // Count fields with citations
    const fieldsWithCitations = enrichedFields.filter(f => f.wacCitation || f.rcwCitation).length;
    const compliancePercentage = ((fieldsWithCitations / fields.length) * 100).toFixed(1);
    
    console.log(`[WAC-RCW] ✅ Validation complete: ${fieldsWithCitations}/${fields.length} fields (${compliancePercentage}%) have citations`);
    
    return enrichedFields;
  } catch (error) {
    console.error('[WAC-RCW] ❌ Failed to validate fields:', error.message);
    // Return original fields on error (don't block upload)
    return fields;
  }
}

module.exports = {
  fetchWACRegulation,
  fetchRCWRegulation,
  storeRegulationInVectorDB,
  chunkRegulationContent,
  initializeRegulations,
  findRelevantRegulations,
  updateAllRegulations,
  getRegulation,
  checkForRegulationUpdates,
  validateAndEnrichField,
  validateAndEnrichFields,
  AFH_REGULATIONS
};

