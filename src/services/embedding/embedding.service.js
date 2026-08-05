const prisma = require("../../lib/prisma");
const pdfParse = require("pdf-parse");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { nanoid } = require("nanoid");
const crypto = require("crypto");
const { generateFormSchema } = require("../ai/ai.service");
const { uploadPdfToS3 } = require("../../utils/s3.util");
const { storePdfTemplate } = require("../pdf/pdf.service");
const {
  generateFieldMappingWithAI,
} = require("../ai/aiFieldDetection.service");
const {
  generateFieldMappingWithCoordinateAI,
} = require("../ai/aiFieldDetectionCoordinate.service");

async function extractTextFromPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text || "";
}

async function splitIntoChunks(text) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2000, // Increased to capture more context per chunk
    chunkOverlap: 400, // Increased overlap to avoid missing fields between chunks
  });
  const docs = await splitter.createDocuments([text]);
  return docs.map((d) => d.pageContent).filter(Boolean);
}

const EXPECTED_DIM = 1536; // matches text-embedding-3-small

async function embedChunks(chunks) {
  const embeddings = new OpenAIEmbeddings({
    model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
  });
  const vectors = await embeddings.embedDocuments(chunks);
  if (!vectors.length || vectors[0].length !== EXPECTED_DIM) {
    throw new Error(
      `Embedding dimension ${
        vectors[0]?.length || 0
      } does not match table dimension ${EXPECTED_DIM}. Set OPENAI_EMBEDDING_MODEL to a ${EXPECTED_DIM}-dimensional model or update the table schema.`
    );
  }
  return vectors;
}

async function storeEmbeddings(tenantId, fileName, chunks, vectors) {
  // Store embeddings one by one to avoid transaction issues
  for (let i = 0; i < chunks.length; i++) {
    const id = nanoid();
    const content = chunks[i];
    const vectorArray = vectors[i];

    try {
      // Format vector as proper array literal for pgvector
      const vectorString = `[${vectorArray.join(",")}]`;
      await prisma.$executeRaw`INSERT INTO "pdf_embeddings" ("id", "tenantId", "fileName", "content", "embedding") VALUES (${id}, ${tenantId}, ${fileName}, ${content}, ${vectorString}::vector)`;
      console.log(`✅ Stored chunk ${i + 1} with vector`);
    } catch (error) {
      // If vector fails, we need to convert the table to TEXT first
      console.log(`⚠️ Vector insert failed for chunk ${i + 1}:`, error.message);
      console.log(`🔄 Converting table to TEXT and retrying...`);

      try {
        // Convert table to TEXT type
        await prisma.$executeRaw`ALTER TABLE "pdf_embeddings" ALTER COLUMN "embedding" TYPE TEXT`;
        console.log(`✅ Converted embedding column to TEXT`);

        // Now store as JSON
        const vectorJson = JSON.stringify(vectorArray);
        await prisma.$executeRaw`INSERT INTO "pdf_embeddings" ("id", "tenantId", "fileName", "content", "embedding") VALUES (${id}, ${tenantId}, ${fileName}, ${content}, ${vectorJson})`;
        console.log(`✅ Stored chunk ${i + 1} as JSON`);
      } catch (conversionError) {
        console.error(
          `❌ Failed to convert table and store chunk ${i + 1}:`,
          conversionError.message
        );
        throw conversionError;
      }
    }
  }
  return chunks.length;
}

/**
 * Calculate SHA256 hash of PDF buffer for duplicate detection
 * @param {Buffer} buffer - PDF file buffer
 * @returns {string} SHA256 hash in hexadecimal format
 */
function calculatePdfHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Check if a PDF with the same hash already exists for the tenant
 * @param {string} tenantId - Tenant ID
 * @param {string} fileHash - SHA256 hash of the PDF
 * @returns {Promise<Object|null>} Existing template if found, null otherwise
 */
async function checkDuplicatePdf(tenantId, fileHash) {
  try {
    const existingTemplate = await prisma.pdfTemplate.findFirst({
      where: {
        tenantId,
        fileHash,
        isActive: true,
      },
      select: {
        id: true,
        fileName: true,
        displayName: true,
        createdAt: true,
      },
    });
    return existingTemplate;
  } catch (error) {
    console.error("[DUPLICATE-CHECK] Error checking for duplicates:", error);
    // Don't fail upload if duplicate check fails - log and continue
    return null;
  }
}

async function processPdfAndStore({
  tenantId,
  fileName,
  buffer,
  userId = null,
  fieldMapping = null,
  displayName = null,
  description = null,
  enableAIDetection = true, // Enable AI-powered field detection by default
  useCoordinateDetection = false, // Use coordinate-accurate detection (deprecated, use hybrid)
  useHybridDetection = true, // DEFAULT: Use hybrid detection (combines text + vision for best results)
}) {
  // Step 0: Calculate PDF hash and check for duplicates BEFORE processing
  console.log(
    `[DUPLICATE-CHECK] Calculating PDF hash for duplicate detection...`
  );
  const fileHash = calculatePdfHash(buffer);
  console.log(`[DUPLICATE-CHECK] PDF hash: ${fileHash.substring(0, 16)}...`);

  const existingTemplate = await checkDuplicatePdf(tenantId, fileHash);
  if (existingTemplate) {
    const existingFileName =
      existingTemplate.displayName || existingTemplate.fileName;
    const errorMessage = `Duplicate PDF detected: "${existingFileName}"`;
    console.error(
      `[DUPLICATE-CHECK] ❌ Duplicate detected: ${existingFileName} (uploaded on ${
        existingTemplate.createdAt.toISOString().split("T")[0]
      })`
    );
    throw new Error(errorMessage);
  }
  console.log(
    `[DUPLICATE-CHECK] ✅ No duplicate found - proceeding with upload`
  );

  // Step 1: Upload PDF to S3 BEFORE processing
  console.log(`[S3] Uploading PDF to S3 for tenant ${tenantId}...`);
  let s3Result;
  try {
    s3Result = await uploadPdfToS3({ tenantId, fileName, buffer });
    console.log(`[S3] Upload successful - Key: ${s3Result.s3Key}`);
  } catch (error) {
    console.error("[S3] Upload failed:", error.message);
    throw new Error(`Failed to upload PDF to S3: ${error.message}`);
  }

  // Step 2: Extract text and process embeddings
  const text = await extractTextFromPdf(buffer);
  if (!text || !text.trim()) {
    return {
      chunks: 0,
      s3Url: s3Result.s3Url,
      s3Key: s3Result.s3Key,
    };
  }
  const chunks = await splitIntoChunks(text);
  if (chunks.length === 0) {
    return {
      chunks: 0,
      s3Url: s3Result.s3Url,
      s3Key: s3Result.s3Key,
    };
  }
  const vectors = await embedChunks(chunks);
  const count = await storeEmbeddings(tenantId, fileName, chunks, vectors);

  // Step 3: Queue background schema generation (non-blocking)
  const { backgroundJobQueue } = require("../background-jobs/background-jobs");

  // Initialize schemaResult for return value
  const schemaResult = null; // Will be updated by background job

  // Step 4: Extract interactive form fields from PDF (if available)
  let interactiveFormFields = [];
  try {
    const { PDFDocument } = require("pdf-lib");
    const pdfDoc = await PDFDocument.load(buffer);
    const form = pdfDoc.getForm();
    const formFields = form.getFields();

    if (formFields.length > 0) {
      console.log(
        `[FORM-FIELDS] 📋 Found ${formFields.length} interactive form fields in PDF`
      );

      interactiveFormFields = formFields.map((formField) => {
        const fieldType = formField.constructor.name;
        const fieldData = {
          fieldName: formField.getName(),
          type: fieldType.replace("PDF", "").toLowerCase(),
          required: false, // Default, can be updated based on field properties
        };

        // Add type-specific properties
        if (fieldType === "PDFTextField") {
          fieldData.defaultValue = "";
        } else if (fieldType === "PDFCheckBox") {
          fieldData.defaultValue = false;
        } else if (
          fieldType === "PDFDropdown" ||
          fieldType === "PDFRadioGroup"
        ) {
          fieldData.options = [];
        }

        return fieldData;
      });

      console.log(
        `[FORM-FIELDS] ✅ Extracted ${interactiveFormFields.length} interactive fields`
      );
      console.log(
        `[FORM-FIELDS] Field names: ${interactiveFormFields
          .map((f) => f.fieldName)
          .join(", ")}`
      );
    } else {
      console.log("[FORM-FIELDS] No interactive form fields found in PDF");
    }
  } catch (error) {
    console.error("[FORM-FIELDS] Error extracting form fields:", error.message);
    // Don't fail upload if form field extraction fails
  }

  // Step 5: AI-Powered Field Detection (if no manual mapping provided and no interactive fields)
  let detectedFieldMapping = fieldMapping;

  // If we have interactive fields, use them first (most reliable)
  if (interactiveFormFields.length > 0 && !detectedFieldMapping) {
    console.log(
      "[FORM-FIELDS] Creating field mapping from interactive form fields"
    );
    detectedFieldMapping = interactiveFormFields.map((field) => ({
      fieldName: field.fieldName, // PDF field name (AcroForm)
      label: field.fieldName.split(/(?=[A-Z])/).join(" "), // human label
      type: field.type,
      interactiveField: true, // mark as interactive
    }));
    console.log(
      `[FORM-FIELDS] ✅ Created mapping with ${detectedFieldMapping.length} interactive fields`
    );
  }

  // Track detection method and statistics
  let detectionMethod = null;
  let detectionStats = {
    textBasedFields: 0,
    visionBasedFields: 0,
    highConfidenceFields: 0,
  };

  // Use AI detection as fallback (if no manual mapping provided and no interactive fields)
  if (!detectedFieldMapping && enableAIDetection) {
    try {
      if (useHybridDetection) {
        // NEW: Hybrid detection (combines text-based + vision-based)
        console.log(
          `[AI-HYBRID] 🎯 Starting hybrid field detection for ${fileName}...`
        );
        const {
          generateFieldMappingWithHybridAI,
        } = require("../ai/aiFieldDetectionHybrid.service");
        detectedFieldMapping = await generateFieldMappingWithHybridAI({
          pdfBuffer: buffer,
          fileName,
          tenantId,
          formSchema: schemaResult?.schemaJson || null,
        });
        detectionMethod = "hybrid";

        // Count fields by detection method (if available)
        if (detectedFieldMapping) {
          detectionStats.textBasedFields = detectedFieldMapping.filter(
            (f) => f.detectionMethod === "text"
          ).length;
          detectionStats.visionBasedFields = detectedFieldMapping.filter(
            (f) => f.detectionMethod === "vision"
          ).length;
          detectionStats.highConfidenceFields = detectedFieldMapping.filter(
            (f) => f.confidence === "high"
          ).length;
        }

        console.log(
          `[AI-HYBRID] ✨ Hybrid AI detected ${detectedFieldMapping.length} fields with optimal method selection!`
        );
        console.log(
          `[AI-HYBRID] 📊 Text: ${detectionStats.textBasedFields}, Vision: ${detectionStats.visionBasedFields}, High confidence: ${detectionStats.highConfidenceFields}`
        );
      } else if (useCoordinateDetection) {
        console.log(
          `[AI-COORDINATE] 🎯 Starting coordinate-accurate field detection for ${fileName}...`
        );
        detectedFieldMapping = await generateFieldMappingWithCoordinateAI({
          pdfBuffer: buffer,
          fileName,
          tenantId,
          formSchema: schemaResult?.schemaJson || null,
        });
        detectionMethod = "coordinate";
        console.log(
          `[AI-COORDINATE] ✨ Coordinate AI detected ${detectedFieldMapping.length} fields with precise positioning!`
        );
      } else {
        console.log(
          `[AI-DETECTION] 🤖 Starting vision-based field detection for ${fileName}...`
        );
        detectedFieldMapping = await generateFieldMappingWithAI({
          pdfBuffer: buffer,
          fileName,
          tenantId,
          formSchema: schemaResult?.schemaJson || null,
        });
        detectionMethod = "vision";
        console.log(
          `[AI-DETECTION] ✨ Vision AI detected ${detectedFieldMapping.length} fields automatically!`
        );
      }
    } catch (error) {
      console.error("[AI-DETECTION] AI field detection failed:", error.message);

      // If hybrid or coordinate detection fails, try fallback to vision method
      if (
        (useHybridDetection || useCoordinateDetection) &&
        !detectedFieldMapping
      ) {
        try {
          console.log(
            "[AI-DETECTION] 🔄 Falling back to vision-based detection..."
          );
          detectedFieldMapping = await generateFieldMappingWithAI({
            pdfBuffer: buffer,
            fileName,
            tenantId,
            formSchema: schemaResult?.schemaJson || null,
          });
          detectionMethod = "vision-fallback";
          console.log(
            `[AI-DETECTION] ✨ Fallback vision AI detected ${detectedFieldMapping.length} fields!`
          );
        } catch (fallbackError) {
          console.error(
            "[AI-DETECTION] Fallback detection also failed:",
            fallbackError.message
          );
          console.log("[AI-DETECTION] Continuing without field mapping...");
          detectedFieldMapping = null;
        }
      } else {
        console.log("[AI-DETECTION] Continuing without field mapping...");
        detectedFieldMapping = null;
      }
    }
  }

  // Map fieldMapping entries to current schema field keys (schemaKey) for reliable value lookup
  // Using improved matching algorithm for better accuracy
  try {
    // Load most recent active schema for tenant to derive field keys
    const prisma = require("../../lib/prisma");
    const latestSchema = await prisma.formSchema.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!latestSchema?.schemaJson?.fields) {
      console.log(
        "[MAPPING] No active schema found - fields will be mapped after schema generation"
      );
    } else {
      // Create schema fields with multiple normalization strategies
      const schemaFields = latestSchema.schemaJson.fields.map((f) => {
        const name = (f.name || f.label || "").toString();
        const label = (f.label || f.name || "").toString();
        return {
          key: name,
          label: label,
          norm: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
          normLabel: label.toLowerCase().replace(/[^a-z0-9]/g, ""),
          patterns: [
            name.toLowerCase().replace(/[^a-z0-9]/g, ""),
            label.toLowerCase().replace(/[^a-z0-9]/g, ""),
            name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
            label.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          ],
        };
      });

      // Use semantic normalization for consistent matching
      const {
        normalizeFieldNameSemantic,
      } = require("../../utils/fieldNormalization.util");
      const normalize = (s) =>
        (s || "")
          .toString()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      if (
        Array.isArray(detectedFieldMapping) &&
        detectedFieldMapping.length > 0 &&
        schemaFields.length > 0
      ) {
        detectedFieldMapping = detectedFieldMapping.map((m) => {
          const fieldName = (m.fieldName || m.label || "").toString();
          // Use semantic normalization for better matching (handles word order variations)
          const pdfNormSemantic =
            normalizeFieldNameSemantic(fieldName) || fieldName.toLowerCase();
          const pdfNorm = normalize(pdfNormSemantic);

          let best = null;
          let bestScore = 0;

          // Strategy 1: Exact match (using semantic normalization)
          for (const sf of schemaFields) {
            // Normalize schema field name semantically for comparison
            const schemaNormSemantic =
              normalizeFieldNameSemantic(sf.key) || sf.key.toLowerCase();
            const schemaNorm = normalize(schemaNormSemantic);

            if (
              pdfNorm === schemaNorm ||
              sf.norm === pdfNorm ||
              sf.normLabel === pdfNorm
            ) {
              best = sf;
              bestScore = 100;
              break;
            }
          }

          // Strategy 2: Substring matching with scoring
          if (!best) {
            for (const sf of schemaFields) {
              let score = 0;

              // Check if one contains the other
              if (sf.norm.includes(pdfNorm) || pdfNorm.includes(sf.norm)) {
                score =
                  (Math.min(sf.norm.length, pdfNorm.length) /
                    Math.max(sf.norm.length, pdfNorm.length)) *
                  80;
              }

              // Check label matching
              if (
                sf.normLabel.includes(pdfNorm) ||
                pdfNorm.includes(sf.normLabel)
              ) {
                const labelScore =
                  (Math.min(sf.normLabel.length, pdfNorm.length) /
                    Math.max(sf.normLabel.length, pdfNorm.length)) *
                  75;
                score = Math.max(score, labelScore);
              }

              // Pattern matching for common variations
              for (const pattern of sf.patterns) {
                if (
                  pattern === pdfNorm ||
                  pattern.includes(pdfNorm) ||
                  pdfNorm.includes(pattern)
                ) {
                  score = Math.max(score, 70);
                }
              }

              if (score > bestScore) {
                bestScore = score;
                best = sf;
              }
            }
          }

          // Strategy 3: Word-based matching for multi-word fields
          if (!best || bestScore < 60) {
            const pdfWords = pdfNorm.match(/\w+/g) || [];
            for (const sf of schemaFields) {
              const schemaWords = sf.norm.match(/\w+/g) || [];
              const labelWords = sf.normLabel.match(/\w+/g) || [];

              let wordMatches = 0;
              let totalWords = Math.max(
                pdfWords.length,
                Math.max(schemaWords.length, labelWords.length)
              );

              // Count matching words
              for (const pdfWord of pdfWords) {
                if (
                  schemaWords.includes(pdfWord) ||
                  labelWords.includes(pdfWord)
                ) {
                  wordMatches++;
                }
              }

              if (totalWords > 0) {
                const wordScore = (wordMatches / totalWords) * 60;
                if (wordScore > bestScore) {
                  bestScore = wordScore;
                  best = sf;
                }
              }
            }
          }

          // Only use match if score is reasonable (at least 50%)
          if (best && bestScore >= 50) {
            console.log(
              `[MAPPING] Matched "${fieldName}" → "${
                best.key
              }" (score: ${bestScore.toFixed(1)})`
            );
            return { ...m, schemaKey: best.key };
          } else {
            // PDFs can have any fields - it's normal for some fields not to match schema
            // Only log if score is very low (likely a real issue)
            if (bestScore < 30) {
              // Silently skip - PDF fields don't need to match schema
            }
            return { ...m, schemaKey: null };
          }
        });

        const matchedCount = detectedFieldMapping.filter(
          (m) => m.schemaKey
        ).length;
        console.log(
          `[MAPPING] ✅ schemaKey mapping applied: ${matchedCount}/${detectedFieldMapping.length} fields matched`
        );
      } else {
        console.log(
          "[MAPPING] Skipped schemaKey mapping (no schema fields or no detected fields)"
        );
      }
    }
  } catch (mapErr) {
    console.warn(
      "[MAPPING] Failed to map fields to schema keys:",
      mapErr.message
    );
    console.log(
      "[MAPPING] Fields will be remapped automatically after schema generation completes"
    );
  }

  // Step 6: Store PDF template if field mapping exists (manual, AI-detected, or interactive fields)
  let templateResult = null;
  try {
    const mappingSource = fieldMapping ? "manual" : "AI-detected";
    const fieldCount = detectedFieldMapping ? detectedFieldMapping.length : 0;
    console.log(
      `[PDF-TEMPLATE] Storing PDF template with ${fieldCount} ${mappingSource} field mappings...`
    );

    templateResult = await storePdfTemplate({
      tenantId,
      fileName,
      s3Key: s3Result.s3Key,
      s3Url: s3Result.s3Url,
      fieldMapping: detectedFieldMapping || [],
      displayName,
      description,
      userId,
      fileHash, // Include hash for duplicate detection
    });

    console.log(
      `[PDF-TEMPLATE] ✅ Template stored successfully: ${templateResult.id}`
    );

    // Trigger remapping if schema exists (for 100% coverage)
    try {
      const prisma = require("../../lib/prisma");
      const existingSchema = await prisma.formSchema.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: "desc" },
      });

      if (existingSchema) {
        console.log(
          `[PDF-TEMPLATE] 🔄 Schema exists - triggering schema-driven remapping for 100% coverage...`
        );
        const {
          regenerateTemplateFieldMappingWithSchema,
        } = require("../pdf/pdf.service");
        // Run remapping in background (don't wait)
        setImmediate(async () => {
          try {
            const remapResult = await regenerateTemplateFieldMappingWithSchema({
              templateId: templateResult.id,
              tenantId,
            });
            if (remapResult.success) {
              console.log(
                `[PDF-TEMPLATE] ✅ Schema-driven remap complete: ${
                  remapResult.matched
                } found, ${remapResult.notInPdf || 0} not in PDF, ${
                  remapResult.total
                } total (100% coverage)`
              );
            }
          } catch (remapError) {
            console.error(
              `[PDF-TEMPLATE] ❌ Failed to remap template after save:`,
              remapError.message
            );
          }
        });
      } else {
        console.log(
          `[PDF-TEMPLATE] ⏳ No schema yet - will remap when schema is generated`
        );
      }
    } catch (remapError) {
      console.warn(
        `[PDF-TEMPLATE] ⚠️ Could not check schema for remapping:`,
        remapError.message
      );
    }
  } catch (error) {
    console.error("[PDF-TEMPLATE] Failed to store template:", error.message);
    // Don't fail the entire upload if template storage fails
  }

  // Queue schema generation AFTER templates/field mappings are stored
  try {
    const jobId = backgroundJobQueue.addSchemaGenerationJob({
      tenantId,
      formName: "Master Form", // Single consolidated form per tenant
      description: "Consolidated form from all uploaded documents",
      userId,
    });
    console.log(
      `[AUTO-SCHEMA] ✅ Background schema generation queued with job ID: ${jobId}`
    );
  } catch (jobError) {
    console.error(
      "[AUTO-SCHEMA] Failed to queue schema generation job:",
      jobError.message
    );
  }

  return {
    chunks: count,
    schemaUpdated: schemaResult !== null,
    schemaId: schemaResult?.id,
    merged: schemaResult?.merged || false,
    newFieldsAdded: schemaResult?.newFieldsAdded || 0,
    s3Url: s3Result.s3Url,
    s3Key: s3Result.s3Key,
    s3Bucket: s3Result.bucket,
    template: templateResult,
    interactiveFields: {
      found: interactiveFormFields.length > 0,
      count: interactiveFormFields.length,
      fieldNames: interactiveFormFields.map((f) => f.fieldName),
    },
    aiDetection: {
      enabled: enableAIDetection,
      method: detectionMethod, // 'hybrid', 'coordinate', 'vision', or 'vision-fallback'
      fieldsDetected: detectedFieldMapping ? detectedFieldMapping.length : 0,
      textBasedFields: detectionStats.textBasedFields || 0,
      visionBasedFields: detectionStats.visionBasedFields || 0,
      highConfidenceFields: detectionStats.highConfidenceFields || 0,
      usedAI:
        !fieldMapping &&
        detectedFieldMapping &&
        detectedFieldMapping.length > 0 &&
        detectedFieldMapping.some((f) => !f.interactiveField), // Some fields from AI, not just interactive
    },
  };
}

/**
 * Get all uploaded PDFs for tenant with pagination
 * Uses PdfTemplate table which stores the actual PDF metadata
 */
async function getEmbeddings(tenantId, options = {}) {
  const { page = 1, limit = 10, search = "" } = options;
  const skip = (page - 1) * limit;

  try {
    console.log("🔍 getEmbeddings called with:", { tenantId, options });

    // Build where clause for PdfTemplate
    const whereClause = {
      tenantId,
      isActive: true,
      ...(search && {
        OR: [
          { fileName: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    console.log("📋 Where clause:", whereClause);

    // Get PDF templates with pagination
    const pdfTemplates = await prisma.pdfTemplate.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    console.log("📄 Found PDF templates:", pdfTemplates.length);

    // Get total count
    const total = await prisma.pdfTemplate.count({
      where: whereClause,
    });

    console.log("📊 Total count:", total);

    const totalPages = Math.ceil(total / limit);

    // For each template, get the embedding stats if available
    const embeddings = await Promise.all(
      pdfTemplates.map(async (template) => {
        // Count chunks for this PDF from pdf_embeddings table
        let chunks = 0;
        try {
          chunks = await prisma.pdfEmbedding.count({
            where: {
              tenantId: template.tenantId,
              fileName: template.fileName,
            },
          });
        } catch (err) {
          console.log(
            "Note: Could not count embeddings for",
            template.fileName
          );
        }

        return {
          id: template.id,
          pdfName: template.fileName,
          displayName: template.displayName,
          description: template.description,
          pdfPath: template.s3Url,
          s3Key: template.s3Key,
          tenantId: template.tenantId,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          chunks: chunks,
          embeddings: chunks, // Same as chunks for now
          fieldCount: template.fieldMapping
            ? Array.isArray(template.fieldMapping)
              ? template.fieldMapping.length
              : 0
            : 0,
        };
      })
    );

    return {
      embeddings,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Error fetching PDF templates:", error);
    throw new Error(`Failed to fetch uploaded PDFs: ${error.message}`);
  }
}

/**
 * Get specific PDF template by ID
 */
async function getEmbeddingById(id, tenantId) {
  try {
    const template = await prisma.pdfTemplate.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!template) {
      throw new Error("PDF not found");
    }

    // Count chunks for this PDF
    let chunks = 0;
    try {
      chunks = await prisma.pdfEmbedding.count({
        where: {
          tenantId: template.tenantId,
          fileName: template.fileName,
        },
      });
    } catch (err) {
      console.log("Note: Could not count embeddings for", template.fileName);
    }

    return {
      id: template.id,
      pdfName: template.fileName,
      displayName: template.displayName,
      description: template.description,
      pdfPath: template.s3Url,
      s3Key: template.s3Key,
      tenantId: template.tenantId,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      chunks: chunks,
      embeddings: chunks,
      fieldMapping: template.fieldMapping,
      fieldCount: template.fieldMapping
        ? Array.isArray(template.fieldMapping)
          ? template.fieldMapping.length
          : 0
        : 0,
    };
  } catch (error) {
    console.error("Error fetching PDF by ID:", error);
    throw new Error("Failed to fetch PDF");
  }
}

/**
 * Delete PDF template and associated embeddings by ID
 * Also cleans up master form fields that are no longer used by other PDFs
 */
async function deleteEmbedding(id, tenantId) {
  try {
    // Get the PDF template first
    const template = await prisma.pdfTemplate.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!template) {
      throw new Error("PDF not found");
    }

    // Count chunks before deletion
    let chunksCount = 0;
    try {
      chunksCount = await prisma.pdfEmbedding.count({
        where: {
          tenantId,
          fileName: template.fileName,
        },
      });

      // Delete all embeddings/chunks for this PDF
      await prisma.pdfEmbedding.deleteMany({
        where: {
          tenantId,
          fileName: template.fileName,
        },
      });
    } catch (err) {
      console.log("Note: Could not delete embeddings for", template.fileName);
    }

    // Clean up master form fields BEFORE deleting the PDF template
    // This allows the cleanup logic to properly detect if this is the last PDF
    const {
      cleanupMasterFormFields,
    } = require("../form-field/formFieldCleanup.service");
    let cleanupResult = null;

    try {
      cleanupResult = await cleanupMasterFormFields({
        tenantId,
        deletedPdfTemplate: template,
      });
      console.log(
        `[PDF-DELETE] Field cleanup completed: ${cleanupResult.fieldsRemoved} field(s) removed`
      );
    } catch (cleanupError) {
      console.error("[PDF-DELETE] Field cleanup failed:", cleanupError.message);
      // Don't fail the delete operation if cleanup fails
      cleanupResult = {
        error: cleanupError.message,
        fieldsRemoved: 0,
      };
    }

    // Delete the PDF template AFTER field cleanup
    await prisma.pdfTemplate.delete({
      where: {
        id,
      },
    });

    return {
      deletedPdf: {
        id: template.id,
        fileName: template.fileName,
        displayName: template.displayName,
        chunksDeleted: chunksCount,
      },
      fieldCleanup: cleanupResult,
    };
  } catch (error) {
    console.error("Error deleting PDF:", error);
    throw new Error(`Failed to delete PDF: ${error.message}`);
  }
}

module.exports = {
  processPdfAndStore,
  getEmbeddings,
  getEmbeddingById,
  deleteEmbedding,
};
