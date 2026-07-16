const { createWorker } = require('tesseract.js');
const sharp = require('sharp');

/**
 * OCR Enhancement Service
 * Enhances PDF field detection using Tesseract OCR
 * Used during PDF upload to better detect:
 * - Underlines/dashes
 * - Image-based text
 * - Scanned content
 */

/**
 * Extract text from PDF image using OCR
 * @param {Buffer} imageBuffer - PDF page image buffer
 * @param {number} pageIndex - Page index
 * @returns {Promise<Object>} OCR result with text, words, and bounding boxes
 */
async function extractTextWithOCR(imageBuffer, pageIndex = 0) {
  const worker = await createWorker('eng');
  
  try {
    console.log(`[OCR] Starting OCR extraction for page ${pageIndex + 1}...`);
    
    // Optimize image for OCR
    const optimizedImage = await sharp(imageBuffer)
      .grayscale() // Convert to grayscale for better OCR
      .normalize() // Enhance contrast
      .toBuffer();
    
    // Run OCR with detailed output
    const result = await worker.recognize(optimizedImage);
    
    console.log(`[OCR] ✅ Extracted ${result.data.words.length} words, confidence: ${result.data.confidence.toFixed(1)}%`);
    
    return {
      text: result.data.text,
      words: result.data.words.map(word => ({
        text: word.text,
        confidence: word.confidence,
        bbox: word.bbox, // { x0, y0, x1, y1 }
        baseline: word.baseline
      })),
      lines: result.data.lines.map(line => ({
        text: line.text,
        confidence: line.confidence,
        bbox: line.bbox,
        words: line.words.map(w => w.text).join(' ')
      })),
      confidence: result.data.confidence,
      pageIndex
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Detect underlines and dashes in OCR text
 * Helps identify fillable fields marked with underscores or dashes
 * @param {Object} ocrResult - OCR extraction result
 * @returns {Array} Detected underline fields
 */
function detectUnderlines(ocrResult) {
  const underlineFields = [];
  const { lines } = ocrResult;
  
  for (const line of lines) {
    const text = line.text;
    
    // Pattern 1: Label followed by underscores: "Name: ______"
    const underscorePattern = /([A-Za-z\s]+):\s*(_+|_{3,})/gi;
    let match;
    
    while ((match = underscorePattern.exec(text)) !== null) {
      const label = match[1].trim();
      const underlines = match[2];
      const underlineLength = underlines.length * 8; // Estimate width
      
      underlineFields.push({
        label,
        type: 'text',
        bbox: line.bbox,
        underlineLength,
        confidence: line.confidence,
        pattern: 'underscore'
      });
    }
    
    // Pattern 2: Label followed by dashes: "Name: ------"
    const dashPattern = /([A-Za-z\s]+):\s*(-+|-{3,})/gi;
    
    while ((match = dashPattern.exec(text)) !== null) {
      const label = match[1].trim();
      const dashes = match[2];
      const dashLength = dashes.length * 8;
      
      underlineFields.push({
        label,
        type: 'text',
        bbox: line.bbox,
        dashLength,
        confidence: line.confidence,
        pattern: 'dash'
      });
    }
    
    // Pattern 3: Standalone underlines or dashes (field without nearby label)
    const standalonePattern = /^(_+|-+|_{5,}|-{5,})$/;
    if (standalonePattern.test(text.trim())) {
      underlineFields.push({
        label: null,
        type: 'text',
        bbox: line.bbox,
        length: text.trim().length * 8,
        confidence: line.confidence,
        pattern: 'standalone'
      });
    }
  }
  
  console.log(`[OCR] Detected ${underlineFields.length} underline/dash fields`);
  return underlineFields;
}

/**
 * Detect checkboxes from OCR symbols
 * Looks for checkbox characters: ☐, □, [ ]
 * @param {Object} ocrResult - OCR extraction result
 * @returns {Array} Detected checkbox fields
 */
function detectCheckboxes(ocrResult) {
  const checkboxFields = [];
  const { lines, words } = ocrResult;
  
  // Common checkbox patterns
  const checkboxSymbols = ['☐', '□', '[', ']', '[ ]', '[]'];
  
  for (const line of lines) {
    const text = line.text;
    
    // Look for checkbox symbols followed by text
    for (const symbol of checkboxSymbols) {
      if (text.includes(symbol)) {
        // Extract label after checkbox
        const parts = text.split(symbol);
        if (parts.length > 1 && parts[1].trim()) {
          const label = parts[1].trim();
          
          checkboxFields.push({
            label,
            type: 'checkbox',
            bbox: line.bbox,
            confidence: line.confidence,
            symbol
          });
        }
      }
    }
    
    // Pattern: Word at start of line might be checkbox item
    // Example: "DENTURES", "HEARING AID", "JEWELRY"
    if (line.text.trim().length > 0 && line.text.trim().length < 30) {
      const trimmed = line.text.trim();
      // If line is short and all caps or title case, might be checkbox item
      if (trimmed === trimmed.toUpperCase() || /^[A-Z][a-z\s]+$/.test(trimmed)) {
        checkboxFields.push({
          label: trimmed,
          type: 'checkbox',
          bbox: line.bbox,
          confidence: line.confidence,
          symbol: 'inferred'
        });
      }
    }
  }
  
  console.log(`[OCR] Detected ${checkboxFields.length} potential checkbox fields`);
  return checkboxFields;
}

/**
 * Enhance existing field detection with OCR data
 * Combines AI detection with OCR-detected fields
 * @param {Array} aiDetectedFields - Fields detected by AI (GPT-4o)
 * @param {Object} ocrResult - OCR extraction result
 * @param {number} pageHeight - PDF page height for coordinate conversion
 * @returns {Array} Enhanced field mappings
 */
function enhanceFieldsWithOCR(aiDetectedFields, ocrResult, pageHeight) {
  console.log(`[OCR] Enhancing ${aiDetectedFields.length} AI-detected fields with OCR data...`);
  
  const underlines = detectUnderlines(ocrResult);
  const checkboxes = detectCheckboxes(ocrResult);
  const enhancedFields = [...aiDetectedFields];
  
  // Add OCR-detected underline fields that weren't found by AI
  for (const underline of underlines) {
    if (!underline.label) continue; // Skip standalone underlines without labels
    
    const normalizedLabel = underline.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check if AI already detected this field
    const alreadyDetected = aiDetectedFields.some(f => {
      const aiLabel = (f.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return aiLabel === normalizedLabel || 
             Math.abs(f.y - underline.bbox.y0) < 10; // Same Y position
    });
    
    if (!alreadyDetected) {
      // Add new field detected by OCR
      const fieldName = underline.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      
      enhancedFields.push({
        fieldName,
        label: underline.label,
        x: underline.bbox.x0 + (underline.underlineLength || underline.dashLength || 100),
        y: underline.bbox.y0,
        width: underline.underlineLength || underline.dashLength || 200,
        height: 20,
        type: 'text',
        confidence: underline.confidence / 100,
        detectionMethod: 'ocr-underline',
        pattern: underline.pattern
      });
      
      console.log(`[OCR] ➕ Added field "${fieldName}" from OCR ${underline.pattern} pattern`);
    }
  }
  
  // Add OCR-detected checkbox fields that weren't found by AI
  for (const checkbox of checkboxes) {
    if (!checkbox.label) continue;
    
    const normalizedLabel = checkbox.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const alreadyDetected = aiDetectedFields.some(f => {
      const aiLabel = (f.label || f.fieldName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return aiLabel === normalizedLabel || aiLabel.includes(normalizedLabel);
    });
    
    if (!alreadyDetected) {
      const fieldName = checkbox.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      
      enhancedFields.push({
        fieldName,
        label: checkbox.label,
        x: checkbox.bbox.x0,
        y: checkbox.bbox.y0,
        width: 15,
        height: 15,
        type: 'checkbox',
        confidence: checkbox.confidence / 100,
        detectionMethod: 'ocr-checkbox',
        symbol: checkbox.symbol
      });
      
      console.log(`[OCR] ➕ Added checkbox "${fieldName}" from OCR`);
    }
  }
  
  const addedCount = enhancedFields.length - aiDetectedFields.length;
  console.log(`[OCR] ✅ Enhanced detection: ${aiDetectedFields.length} AI + ${addedCount} OCR = ${enhancedFields.length} total fields`);
  
  return enhancedFields;
}

/**
 * Check if PDF page needs OCR enhancement
 * Returns true if:
 * - Text extraction yielded very little text
 * - Page appears to be scanned (image-based)
 * - User requested OCR explicitly
 * @param {string} extractedText - Text extracted from PDF
 * @param {Object} options - Options
 * @returns {boolean} Whether OCR should be used
 */
function shouldUseOCR(extractedText, options = {}) {
  if (options.forceOCR) {
    console.log('[OCR] Force OCR enabled by user');
    return true;
  }
  
  // If very little text extracted, might be scanned/image-based
  if (!extractedText || extractedText.trim().length < 100) {
    console.log('[OCR] Little text found, enabling OCR enhancement');
    return true;
  }
  
  // Check if text looks sparse or corrupted
  const wordCount = extractedText.trim().split(/\s+/).length;
  if (wordCount < 50) {
    console.log(`[OCR] Only ${wordCount} words found, enabling OCR enhancement`);
    return true;
  }
  
  // Always use OCR as enhancement if enabled in config
  if (options.enableOCREnhancement !== false) {
    console.log('[OCR] OCR enhancement enabled by config');
    return true;
  }
  
  return false;
}

module.exports = {
  extractTextWithOCR,
  detectUnderlines,
  detectCheckboxes,
  enhanceFieldsWithOCR,
  shouldUseOCR
};

