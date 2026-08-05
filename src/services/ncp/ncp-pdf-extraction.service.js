const pdfParse = require("pdf-parse");

/**
 * Extract text from PDF buffer
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} Object with text, page count, and metadata
 */
async function extractTextFromPdf(pdfBuffer) {
  try {
    console.log("[NCP-PDF] Extracting text from PDF...");

    // Extract text using pdf-parse
    const data = await pdfParse(pdfBuffer);

    const result = {
      text: data.text || "",
      pageCount: data.numpages || 0,
      info: data.info || {},
      metadata: data.metadata || {},
      totalCharacters: (data.text || "").length,
      totalWords: (data.text || "").split(/\s+/).filter(Boolean).length,
    };

    console.log(
      `[NCP-PDF] ✅ Extracted ${result.totalCharacters} characters, ${result.totalWords} words from ${result.pageCount} pages`
    );

    return result;
  } catch (error) {
    console.error("[NCP-PDF] Error extracting text from PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Validate PDF structure and content
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} Validation result
 */
async function validatePdfStructure(pdfBuffer) {
  try {
    console.log("[NCP-PDF] Validating PDF structure...");

    // Check if buffer is valid
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error("PDF buffer is empty");
    }

    // Check PDF header
    const header = pdfBuffer.slice(0, 4).toString();
    if (header !== "%PDF") {
      throw new Error("Invalid PDF format: missing PDF header");
    }

    // Try to parse PDF to get page count
    let pageCount = 0;
    let textLength = 0;
    try {
      const data = await pdfParse(pdfBuffer);
      pageCount = data.numpages || 0;
      textLength = (data.text || "").length;
    } catch (parseError) {
      console.warn("[NCP-PDF] Warning: Could not parse PDF for validation:", parseError.message);
    }

    // Validate page count (NCP forms are typically 10-50 pages)
    if (pageCount === 0) {
      throw new Error("PDF appears to be empty or corrupted");
    }

    if (pageCount > 100) {
      console.warn(`[NCP-PDF] Warning: PDF has ${pageCount} pages, which is unusually large for an NCP form`);
    }

    // Check if PDF has extractable text
    if (textLength < 100) {
      console.warn("[NCP-PDF] Warning: PDF has very little text content. It may be image-based and require OCR.");
    }

    const validation = {
      isValid: true,
      pageCount,
      textLength,
      fileSize: pdfBuffer.length,
      hasText: textLength > 0,
      warnings: [],
    };

    if (textLength < 100) {
      validation.warnings.push("PDF has minimal text content - may require OCR");
    }

    if (pageCount > 100) {
      validation.warnings.push(`PDF has ${pageCount} pages - processing may take longer`);
    }

    console.log(`[NCP-PDF] ✅ PDF validation passed: ${pageCount} pages, ${textLength} characters`);

    return validation;
  } catch (error) {
    console.error("[NCP-PDF] PDF validation failed:", error);
    return {
      isValid: false,
      error: error.message,
      pageCount: 0,
      textLength: 0,
      fileSize: pdfBuffer?.length || 0,
      hasText: false,
      warnings: [],
    };
  }
}

/**
 * Chunk PDF text into manageable pieces for OpenAI processing
 * Strategy: Try to chunk by sections, fallback to page-based or fixed-size chunks
 *
 * @param {string} text - Full PDF text
 * @param {Object} options - Chunking options
 * @param {number} options.maxChunkSize - Maximum characters per chunk (default: 300000 for GPT-4.1's 1M token context)
 * @param {number} options.overlap - Overlap between chunks in characters (default: 5000)
 * @param {number} options.pageCount - Number of pages (for page-based chunking)
 * @returns {Array<Object>} Array of chunk objects with text, index, and metadata
 */
function chunkPdfText(text, options = {}) {
  const {
    maxChunkSize = 300000, // ~75,000 tokens - GPT-4.1 supports 1M token context, leaving room for prompt and response
    overlap = 5000, // Overlap to prevent losing context at boundaries (increased for better continuity)
    pageCount = 0,
  } = options;

  console.log(`[NCP-PDF] Chunking text: ${text.length} characters into chunks of max ${maxChunkSize} characters`);

  if (!text || text.length === 0) {
    console.warn("[NCP-PDF] Warning: Empty text provided for chunking");
    return [];
  }

  // DISABLED: Section-based chunking causes too many false positives
  // The regex patterns match too many lines, creating hundreds of tiny chunks
  // Example: 31,929 chars with 610 sections = 52 chars per chunk (way too small!)
  // We'll skip section-based chunking entirely and use page-based or fixed-size instead

  const lines = text.split("\n");
  let chunks = [];

  // Skip section-based chunking entirely - it's too unreliable
  console.log("[NCP-PDF] Skipping section-based chunking (too many false positives). Using page-based or fixed-size chunking.");

  // Strategy 1: Page-based chunking (if we know page count)
  // Group multiple pages together to reduce chunk count
  if (pageCount > 0 && pageCount <= 100 && text.length > 1000) {
      // Calculate how many pages can fit in one chunk
      const avgCharsPerPage = text.length / pageCount;
      const pagesPerChunk = Math.max(1, Math.floor(maxChunkSize / avgCharsPerPage));
      const totalChunks = Math.ceil(pageCount / pagesPerChunk);

      console.log(`[NCP-PDF] Using page-based chunking: ${pageCount} pages, grouping ${pagesPerChunk} pages per chunk (${totalChunks} total chunks)`);

      // Estimate lines per page (rough estimate)
      const avgLinesPerPage = Math.ceil(lines.length / pageCount);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startPage = chunkIndex * pagesPerChunk;
        const endPage = Math.min((chunkIndex + 1) * pagesPerChunk, pageCount);

        const startLine = startPage * avgLinesPerPage;
        const endLine = Math.min(endPage * avgLinesPerPage, lines.length);
        const chunkText = lines.slice(startLine, endLine).join("\n");

        if (chunkText.length > maxChunkSize) {
          // Chunk is too large, split it
          const subChunks = splitLargeText(chunkText, maxChunkSize, overlap);
          chunks.push(...subChunks.map((chunk, idx) => ({
            text: chunk,
            index: chunks.length + idx,
            type: "page-group",
            pageRange: `${startPage + 1}-${endPage}`,
            isSubChunk: true,
          })));
        } else {
          chunks.push({
            text: chunkText,
            index: chunks.length,
            type: "page-group",
            pageRange: `${startPage + 1}-${endPage}`,
            isSubChunk: false,
          });
        }
      }
    } else {
      // Strategy 3: Fixed-size chunking with overlap (fallback)
      // Only chunk if text is actually large enough
      if (text.length <= maxChunkSize) {
        console.log("[NCP-PDF] Text fits in single chunk, no chunking needed");
        chunks = [{
          text: text,
          index: 0,
          type: "single",
          isSubChunk: false,
        }];
      } else {
        console.log("[NCP-PDF] Using fixed-size chunking with overlap");
        chunks = splitLargeText(text, maxChunkSize, overlap).map((chunk, idx) => ({
          text: chunk,
          index: idx,
          type: "fixed",
          isSubChunk: false,
        }));
      }
    }

  // Add metadata to each chunk
  chunks = chunks.map((chunk, idx) => ({
    ...chunk,
    characterCount: chunk.text.length,
    wordCount: chunk.text.split(/\s+/).filter(Boolean).length,
    estimatedTokens: Math.ceil(chunk.text.length / 4), // Rough estimate: 1 token ≈ 4 characters
  }));

  console.log(
    `[NCP-PDF] ✅ Created ${chunks.length} chunks (avg ${Math.round(chunks.reduce((sum, c) => sum + c.characterCount, 0) / chunks.length)} chars per chunk)`
  );

  return chunks;
}

/**
 * Split large text into smaller chunks with overlap
 * @param {string} text - Text to split
 * @param {number} maxSize - Maximum size per chunk
 * @param {number} overlap - Overlap between chunks
 * @returns {Array<string>} Array of text chunks
 */
function splitLargeText(text, maxSize, overlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    // If not at the end, try to break at a sentence or paragraph boundary
    if (end < text.length) {
      // Look for paragraph break (double newline)
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + maxSize * 0.5) {
        end = paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = text.lastIndexOf(". ", end);
        if (sentenceBreak > start + maxSize * 0.5) {
          end = sentenceBreak + 2;
        } else {
          // Look for word break
          const wordBreak = text.lastIndexOf(" ", end);
          if (wordBreak > start + maxSize * 0.5) {
            end = wordBreak + 1;
          }
        }
      }
    }

    const chunk = text.slice(start, end);
    chunks.push(chunk);

    // Move start position with overlap
    start = end - overlap;
    if (start < 0) start = 0;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Get PDF metadata (page count, file size, etc.)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} PDF metadata
 */
async function getPdfMetadata(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return {
      pageCount: data.numpages || 0,
      title: data.info?.Title || null,
      author: data.info?.Author || null,
      subject: data.info?.Subject || null,
      creator: data.info?.Creator || null,
      producer: data.info?.Producer || null,
      creationDate: data.info?.CreationDate || null,
      modificationDate: data.info?.ModDate || null,
      fileSize: pdfBuffer.length,
    };
  } catch (error) {
    console.error("[NCP-PDF] Error getting PDF metadata:", error);
    return {
      pageCount: 0,
      fileSize: pdfBuffer.length,
      error: error.message,
    };
  }
}

module.exports = {
  extractTextFromPdf,
  validatePdfStructure,
  chunkPdfText,
  getPdfMetadata,
};
