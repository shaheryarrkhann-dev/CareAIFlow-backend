const OpenAI = require("openai");
const fs = require("node:fs");
const path = require("node:path");
const { loadNcpSchema } = require("./ncp-ai-extraction.service");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Convert PDF page to base64 image for Vision API
 * Uses existing pdfPageToImage function from aiFieldDetection service
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} pageIndex - Page index (0-based)
 * @param {number} scale - Scale factor (default 2 for quality)
 * @returns {Promise<Object>} Image data with base64, width, height
 */
async function convertPdfPageToImage(pdfBuffer, pageIndex = 0, scale = 2) {
  try {
    // Import the existing pdfPageToImage function
    const { pdfPageToImage: convertPage } = require("../ai/aiFieldDetection.service");
    return await convertPage(pdfBuffer, pageIndex, scale);
  } catch (error) {
    console.error(`[NCP-Vision] Error converting page ${pageIndex} to image:`, error);
    throw error;
  }
}

/**
 * Create system prompt for Vision API
 * @returns {string} System prompt
 */
function createVisionSystemPrompt() {
  return `You are a healthcare data extraction specialist specializing in Adult Family Home (AFH) Negotiated Care Plan (NCP) assessment documents.

Your task is to analyze PDF page images and extract structured data matching the provided schema.

CRITICAL RULES:
1. Extract ONLY fields that exist in the provided schema - do not invent new fields
2. For checkbox fields: use "X" if checked/marked, "" (empty string) if unchecked/not marked
3. For enum fields: use EXACT values from the enum list provided in the schema
4. For dates: format as MM/DD/YYYY (e.g., "01/15/2024")
5. If a field is not found in the image, use null or empty string (do not make up values)
6. Return valid JSON matching the schema structure exactly
7. Preserve text content exactly as written - do not summarize or paraphrase
8. For multi-value fields (like allergies), separate with semicolons
9. Be precise and accurate - healthcare data requires exactness
10. You can see checkboxes, tables, handwriting, and visual formatting - use this information

FIELD TYPE HANDLING:
- String fields: Extract text as-is, preserve formatting
- Enum fields: Match exactly to provided enum values
- Checkbox fields: "X" for checked (look for ✓, ☑, X, or filled boxes), "" for unchecked
- Date fields: Convert to MM/DD/YYYY format
- Number fields: Extract numeric values only

VISUAL ANALYSIS:
- Look for checked boxes, filled forms, handwritten notes
- Understand table structures and extract data from cells
- Recognize different sections and their boundaries
- Identify labels and their corresponding values

Return a JSON object with field names matching the schema exactly.`;
}

/**
 * Create user prompt with schema and page context for Vision API
 * @param {Object} schema - NCP schema object
 * @param {number} pageIndex - Current page index
 * @param {number} totalPages - Total number of pages
 * @returns {string} User prompt
 */
function createVisionUserPrompt(schema, pageIndex = 0, totalPages = 1) {
  // Create a simplified schema representation
  const schemaSummary = Object.entries(schema).map(([fieldName, fieldDef]) => {
    const summary = {
      name: fieldName,
      type: fieldDef.type || "string",
      description: fieldDef.description || "",
    };

    if (fieldDef.enum) {
      summary.enum = fieldDef.enum;
    }

    return summary;
  });

  const pageContext = totalPages > 1
    ? `\n\nNOTE: This is page ${pageIndex + 1} of ${totalPages}. Extract all relevant fields from this page.`
    : "";

  return `Extract data from this NCP assessment PDF page image. Match fields to the schema provided.

SCHEMA (${Object.keys(schema).length} fields):
${JSON.stringify(schemaSummary.slice(0, 50), null, 2)}${schemaSummary.length > 50 ? `\n... and ${schemaSummary.length - 50} more fields` : ""}
${pageContext}

INSTRUCTIONS:
1. Analyze the PDF page image carefully
2. Extract all fields that appear in the image
3. Match field names exactly to the schema
4. For checkboxes: look for ✓, ☑, X, or filled boxes - use "X" if checked, "" if unchecked
5. For enums: use exact values from the enum list
6. For dates: format as MM/DD/YYYY
7. Return a JSON object with extracted field values
8. Only include fields that have values found in the image
9. Use null or empty string for missing fields
10. Pay attention to visual layout, tables, and form structure

Return ONLY valid JSON - no markdown, no explanations, just the JSON object.`;
}

/**
 * Extract NCP data from PDF page image using Vision API
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} pageIndex - Page index (0-based)
 * @param {Object} schema - NCP schema
 * @param {number} totalPages - Total number of pages
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Object>} Extracted data object
 */
async function extractNcpDataFromPageImage(pdfBuffer, pageIndex, schema, totalPages = 1, retryCount = 0) {
  const maxRetries = 3;
  const model = "gpt-4.1-2025-04-14"; // Using GPT-4.1 for better performance and 1M token context

  try {
    console.log(
      `[NCP-Vision] Extracting data from page ${pageIndex + 1}/${totalPages} using Vision API (attempt ${retryCount + 1})`
    );

    // Convert PDF page to image
    const imageData = await convertPdfPageToImage(pdfBuffer, pageIndex, 2);
    if (!imageData || !imageData.base64) {
      throw new Error(`Failed to convert page ${pageIndex + 1} to image`);
    }

    // Create prompts
    const systemPrompt = createVisionSystemPrompt();
    const userPrompt = createVisionUserPrompt(schema, pageIndex, totalPages);

    // Prepare messages for Vision API
    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imageData.base64}`,
              detail: "high", // Use high detail for better accuracy
            },
          },
        ],
      },
    ];

    // Call Vision API
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.1, // Low temperature for accuracy
      max_tokens: 32000, // Large output for 391+ fields - GPT-4.1 supports much higher limits (up to 1M context)
      response_format: { type: "json_object" }, // Force JSON response
    });

    const responseText = completion.choices[0].message.content.trim();

    // Remove markdown code blocks if present
    let cleanedResponse = responseText;
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Parse JSON
    let extractedData;
    try {
      extractedData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("[NCP-Vision] JSON parse error:", parseError.message);
      console.error("[NCP-Vision] Response text (first 500 chars):", cleanedResponse.substring(0, 500));

      // Retry with adjusted prompt if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        console.log(`[NCP-Vision] Retrying extraction (attempt ${retryCount + 2}/${maxRetries + 1})...`);
        return extractNcpDataFromPageImage(pdfBuffer, pageIndex, schema, totalPages, retryCount + 1);
      }

      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }

    console.log(
      `[NCP-Vision] ✅ Extracted ${Object.keys(extractedData).length} fields from page ${pageIndex + 1}`
    );

    return extractedData;
  } catch (error) {
    console.error(`[NCP-Vision] Error extracting data from page ${pageIndex + 1}:`, error);

    // Retry on certain errors
    if (
      (error.message.includes("rate limit") ||
       error.message.includes("timeout") ||
       error.code === "rate_limit_exceeded") &&
      retryCount < maxRetries
    ) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
      console.log(`[NCP-Vision] Rate limit hit, retrying after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      return extractNcpDataFromPageImage(pdfBuffer, pageIndex, schema, totalPages, retryCount + 1);
    }

    throw error;
  }
}

/**
 * Extract NCP data from PDF using Vision API (processes all pages)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Extracted and normalized data
 */
async function extractNcpDataFromPdfVision(pdfBuffer, options = {}) {
  try {
    console.log("[NCP-Vision] Starting Vision-based NCP data extraction...");

    // Load schema
    const schema = loadNcpSchema();
    console.log(`[NCP-Vision] Loaded schema with ${Object.keys(schema).length} fields`);

    // Get page count from PDF
    const pdfParse = require("pdf-parse");
    const pdfData = await pdfParse(pdfBuffer);
    const totalPages = pdfData.numpages || 1;

    console.log(`[NCP-Vision] Processing ${totalPages} page(s) with Vision API...`);

    // Process pages in batches to avoid rate limits and token limits
    const pagesPerBatch = 5; // Process 5 pages at a time (Vision API can handle multiple images)
    const totalBatches = Math.ceil(totalPages / pagesPerBatch);

    const allExtractedData = {};

    // Process each batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startPage = batchIndex * pagesPerBatch;
      const endPage = Math.min(startPage + pagesPerBatch, totalPages);

      console.log(
        `[NCP-Vision] Processing batch ${batchIndex + 1}/${totalBatches} (pages ${startPage + 1}-${endPage})...`
      );

      // Process pages in this batch
      const batchResults = [];
      for (let pageIndex = startPage; pageIndex < endPage; pageIndex++) {
        try {
          const extracted = await extractNcpDataFromPageImage(
            pdfBuffer,
            pageIndex,
            schema,
            totalPages
          );
          batchResults.push(extracted);
        } catch (pageError) {
          console.error(`[NCP-Vision] Error processing page ${pageIndex + 1}:`, pageError.message);
          // Continue with other pages even if one fails
          batchResults.push({});
        }
      }

      // Merge batch results (later pages override earlier pages for same fields)
      batchResults.forEach((pageData) => {
        Object.entries(pageData).forEach(([fieldName, fieldValue]) => {
          // Only override if new value is not empty and old value is empty, or prefer more complete values
          if (fieldValue !== null && fieldValue !== "" && fieldValue !== undefined) {
            const existingValue = allExtractedData[fieldName];
            if (!existingValue || existingValue === "" || existingValue === null) {
              allExtractedData[fieldName] = fieldValue;
            } else if (typeof fieldValue === "string" && fieldValue.length > (existingValue?.length || 0)) {
              // Prefer longer/more detailed values
              allExtractedData[fieldName] = fieldValue;
            }
          } else if (!(fieldName in allExtractedData)) {
            // Field doesn't exist yet, add it even if empty
            allExtractedData[fieldName] = fieldValue;
          }
        });
      });

      console.log(
        `[NCP-Vision] ✅ Batch ${batchIndex + 1} complete: ${Object.keys(allExtractedData).length} total fields extracted`
      );

      // Add delay between batches to avoid rate limits
      if (batchIndex < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
      }
    }

    console.log(
      `[NCP-Vision] ✅ Vision extraction complete: ${Object.keys(allExtractedData).length} fields extracted from ${totalPages} pages`
    );

    return {
      data: allExtractedData,
      metadata: {
        pagesProcessed: totalPages,
        fieldsExtracted: Object.keys(allExtractedData).length,
        extractionMethod: "vision",
        extractionTimestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[NCP-Vision] Error in extractNcpDataFromPdfVision:", error);
    throw new Error(`Failed to extract NCP data using Vision API: ${error.message}`);
  }
}

/**
 * Determine if PDF should use Vision API or text extraction
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} Decision with reason
 */
async function shouldUseVisionApi(pdfBuffer) {
  try {
    const pdfParse = require("pdf-parse");
    const pdfData = await pdfParse(pdfBuffer);
    const textLength = (pdfData.text || "").length;
    const pageCount = pdfData.numpages || 0;

    // Use Vision API if:
    // 1. Very little text (< 500 chars) - likely scanned/image-based
    // 2. Text extraction yields poor results
    const useVision = textLength < 500 || textLength / pageCount < 100;

    return {
      useVision,
      reason: useVision
        ? textLength < 500
          ? "PDF has minimal text content (likely scanned/image-based)"
          : "Low text density per page (likely complex layout or image-based)"
        : "PDF has sufficient text content for text-based extraction",
      textLength,
      pageCount,
      textDensity: pageCount > 0 ? textLength / pageCount : 0,
    };
  } catch (error) {
    console.error("[NCP-Vision] Error determining extraction method:", error);
    // Default to Vision API if we can't determine
    return {
      useVision: true,
      reason: "Error analyzing PDF, defaulting to Vision API for best results",
      textLength: 0,
      pageCount: 0,
      textDensity: 0,
    };
  }
}

module.exports = {
  extractNcpDataFromPdfVision,
  extractNcpDataFromPageImage,
  shouldUseVisionApi,
  pdfPageToImage: convertPdfPageToImage,
};
