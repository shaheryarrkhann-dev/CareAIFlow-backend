/**
 * OCR-Based Field Detection Service
 * Uses Tesseract OCR as PRIMARY method to detect ALL form fields
 * More comprehensive than AI-only detection
 */

const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const { pdfPageToImage } = require('./aiFieldDetection.service');

/**
 * Comprehensive OCR-based field detection for ALL pages
 * This is the PRIMARY detection method when OCR is enabled
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - PDF file name
 * @param {Object} options - Detection options
 * @returns {Promise<Array>} Detected fields with coordinates
 */
async function detectFieldsWithOCR(pdfBuffer, fileName, options = {}) {
  console.log('[OCR-PRIMARY] 🔍 Starting comprehensive OCR field detection...');
  console.log('[OCR-PRIMARY] This will analyze ALL pages using OCR as primary method');
  
  const { numPages = 2, scale = 2 } = options;
  const allFields = [];
  
  try {
    // Initialize Tesseract worker once for all pages
    const worker = await createWorker('eng');
    
    console.log('[OCR-PRIMARY] Initialized Tesseract OCR engine');
    
    // Process each page
    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
      console.log(`[OCR-PRIMARY] Processing page ${pageIndex + 1}/${numPages}...`);
      
      try {
        // Convert PDF page to high-quality image
        const pageImage = await pdfPageToImage(pdfBuffer, pageIndex, scale);
        
        if (!pageImage || !pageImage.base64) {
          console.warn(`[OCR-PRIMARY] Failed to convert page ${pageIndex + 1} to image, skipping`);
          continue;
        }
        
        // Optimize image for OCR
        const imageBuffer = Buffer.from(pageImage.base64, 'base64');
        const optimizedImage = await sharp(imageBuffer)
          .grayscale()
          .normalize()
          .sharpen()
          .toBuffer();
        
        // Run comprehensive OCR analysis
        const ocrResult = await worker.recognize(optimizedImage);
        
        // Validate OCR result
        if (!ocrResult || !ocrResult.data) {
          console.warn(`[OCR-PRIMARY] Page ${pageIndex + 1}: Invalid OCR result, skipping`);
          continue;
        }
        
        const words = ocrResult.data.words || [];
        const lines = ocrResult.data.lines || [];
        const confidence = ocrResult.data.confidence || 0;
        
        console.log(`[OCR-PRIMARY] Page ${pageIndex + 1}: Extracted ${words.length} words, ${lines.length} lines, confidence: ${confidence.toFixed(1)}%`);
        
        // Skip if no text detected
        if (words.length === 0 && lines.length === 0) {
          console.warn(`[OCR-PRIMARY] Page ${pageIndex + 1}: No text detected, skipping`);
          continue;
        }
        
        // Detect all field types from OCR data
        const pageFields = await detectAllFieldTypes(ocrResult, pageIndex, pageImage.width, pageImage.height);
        
        console.log(`[OCR-PRIMARY] Page ${pageIndex + 1}: Detected ${pageFields.length} fields`);
        
        allFields.push(...pageFields);
        
      } catch (pageError) {
        console.error(`[OCR-PRIMARY] Error processing page ${pageIndex + 1}:`, pageError.message);
      }
    }
    
    // Terminate worker
    await worker.terminate();
    
    console.log(`[OCR-PRIMARY] ✅ Total fields detected across all pages: ${allFields.length}`);
    
    return allFields;
    
  } catch (error) {
    console.error('[OCR-PRIMARY] OCR detection failed:', error);
    throw error;
  }
}

/**
 * Detect ALL field types from OCR data
 * Comprehensive analysis of text, layout, and patterns
 * @param {Object} ocrResult - Tesseract OCR result
 * @param {number} pageIndex - Page index
 * @param {number} pageWidth - Page width in pixels
 * @param {number} pageHeight - Page height in pixels
 * @returns {Array} Detected fields
 */
async function detectAllFieldTypes(ocrResult, pageIndex, pageWidth, pageHeight) {
  const fields = [];
  const lines = ocrResult.data.lines || [];
  const words = ocrResult.data.words || [];
  const blocks = ocrResult.data.blocks || [];
  
  console.log(`[OCR-DETECT] Analyzing ${lines.length} lines and ${words.length} words on page ${pageIndex + 1}`);
  
  // Early return if no data
  if (lines.length === 0 && words.length === 0) {
    console.warn(`[OCR-DETECT] No OCR data available for page ${pageIndex + 1}`);
    return fields;
  }
  
  // 1. Detect TEXT INPUT FIELDS (labels with underlines/blanks)
  const textFields = detectTextInputFields(lines, words);
  console.log(`[OCR-DETECT] Found ${textFields.length} text input fields`);
  fields.push(...textFields);
  
  // 2. Detect CHECKBOX FIELDS
  const checkboxFields = detectCheckboxFields(lines, words);
  console.log(`[OCR-DETECT] Found ${checkboxFields.length} checkbox fields`);
  fields.push(...checkboxFields);
  
  // 3. Detect TABLE FIELDS
  const tableFields = detectTableFields(lines, words);
  console.log(`[OCR-DETECT] Found ${tableFields.length} table fields`);
  fields.push(...tableFields);
  
  // 4. Detect DATE FIELDS
  const dateFields = detectDateFields(lines, words);
  console.log(`[OCR-DETECT] Found ${dateFields.length} date fields`);
  fields.push(...dateFields);
  
  // 5. Detect SIGNATURE FIELDS
  const signatureFields = detectSignatureFields(lines, words);
  console.log(`[OCR-DETECT] Found ${signatureFields.length} signature fields`);
  fields.push(...signatureFields);
  
  // 6. Detect DROPDOWN/SELECT FIELDS
  const dropdownFields = detectDropdownFields(lines, words);
  console.log(`[OCR-DETECT] Found ${dropdownFields.length} dropdown fields`);
  fields.push(...dropdownFields);
  
  // 7. Detect TEXTAREA FIELDS (multi-line)
  const textareaFields = detectTextareaFields(lines, words);
  console.log(`[OCR-DETECT] Found ${textareaFields.length} textarea fields`);
  fields.push(...textareaFields);
  
  // Add page index to all fields
  return fields.map(f => ({
    ...f,
    pageIndex,
    pageWidth,
    pageHeight,
    detectionMethod: 'ocr-primary'
  }));
}

/**
 * Detect text input fields from OCR data
 * Looks for patterns like "Label: _____" or "Label: -----"
 */
function detectTextInputFields(lines, words) {
  const fields = [];
  
  for (const line of lines) {
    // Safety checks
    if (!line || !line.text || !line.bbox) continue;
    
    const text = line.text;
    const bbox = line.bbox;
    
    // Pattern 1: Label with underscores "Name: _______"
    const underscorePattern = /([A-Za-z\s\/\-']+?):\s*(_+|_{2,})/gi;
    let match;
    
    while ((match = underscorePattern.exec(text)) !== null) {
      const label = match[1].trim();
      const fieldName = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      fields.push({
        fieldName,
        label,
        x: bbox.x1 + 10, // After the label
        y: bbox.y0,
        width: 200,
        height: 20,
        type: 'text',
        pattern: 'underscore',
        confidence: (line.confidence || 0) / 100
      });
    }
    
    // Pattern 2: Label with dashes "Phone: -------"
    const dashPattern = /([A-Za-z\s\/\-']+?):\s*(-+|-{2,})/gi;
    
    while ((match = dashPattern.exec(text)) !== null) {
      const label = match[1].trim();
      const fieldName = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      fields.push({
        fieldName,
        label,
        x: bbox.x1 + 10,
        y: bbox.y0,
        width: 200,
        height: 20,
        type: 'text',
        pattern: 'dash',
        confidence: (line.confidence || 0) / 100
      });
    }
    
    // Pattern 3: Label followed by blank space (common in forms)
    const blankPattern = /([A-Za-z\s\/\-']+?):\s*$/i;
    if (blankPattern.test(text) && text.length < 50) {
      const match = text.match(blankPattern);
      if (match) {
        const label = match[1].trim();
        const fieldName = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        fields.push({
          fieldName,
          label,
          x: bbox.x1 + 10,
          y: bbox.y0,
          width: 200,
          height: 20,
          type: 'text',
          pattern: 'blank',
          confidence: (line.confidence || 0) / 100
        });
      }
    }
  }
  
  return fields;
}

/**
 * Detect checkbox fields from OCR data
 */
function detectCheckboxFields(lines, words) {
  const fields = [];
  const checkboxSymbols = ['☐', '□', '☑', '☒', '[', ']', '[ ]', '[]'];
  
  for (const line of lines) {
    // Safety checks
    if (!line || !line.text || !line.bbox) continue;
    
    const text = line.text;
    const bbox = line.bbox;
    
    // Check if line contains checkbox symbols
    const hasCheckbox = checkboxSymbols.some(symbol => text.includes(symbol));
    
    if (hasCheckbox) {
      // Extract label after checkbox
      let label = text;
      for (const symbol of checkboxSymbols) {
        label = label.replace(new RegExp(symbol, 'g'), '').trim();
      }
      
      if (label && label.length > 0) {
        const fieldName = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        fields.push({
          fieldName,
          label,
          x: bbox.x0,
          y: bbox.y0,
          width: 15,
          height: 15,
          type: 'checkbox',
          confidence: (line.confidence || 0) / 100
        });
      }
    }
    
    // Pattern: Single word/phrase in ALL CAPS (often checkbox items)
    if (text === text.toUpperCase() && text.length > 2 && text.length < 30 && /^[A-Z\s]+$/.test(text)) {
      const fieldName = text.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      fields.push({
        fieldName,
        label: text,
        x: bbox.x0,
        y: bbox.y0,
        width: 15,
        height: 15,
        type: 'checkbox',
        pattern: 'all-caps',
        confidence: (line.confidence || 0) / 100
      });
    }
  }
  
  return fields;
}

/**
 * Detect table fields from OCR data
 */
function detectTableFields(lines, words) {
  const fields = [];
  
  // Look for table-like patterns (multiple items in rows)
  // This is a simplified approach - can be enhanced
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Safety checks
    if (!line || !line.text || !line.bbox) continue;
    
    const text = line.text;
    
    // Pattern: "Item | Description" or "Name | Phone | Address"
    if (text.includes('|') || text.includes('\t')) {
      const parts = text.split(/[|\t]/).map(p => p.trim()).filter(p => p.length > 0);
      
      if (parts.length >= 2) {
        parts.forEach((part, idx) => {
          const fieldName = part.toLowerCase().replace(/[^a-z0-9]/g, '_') + `_col${idx}`;
          
          fields.push({
            fieldName,
            label: part,
            x: line.bbox.x0 + (idx * 100),
            y: line.bbox.y0,
            width: 100,
            height: 20,
            type: 'table-cell',
            columnIndex: idx,
            confidence: (line.confidence || 0) / 100
          });
        });
      }
    }
  }
  
  return fields;
}

/**
 * Detect date fields from OCR data
 */
function detectDateFields(lines, words) {
  const fields = [];
  const dateKeywords = ['date', 'dob', 'birth', 'admission', 'discharge', 'signed', 'effective'];
  
  for (const line of lines) {
    // Safety checks
    if (!line || !line.text || !line.bbox) continue;
    
    const text = line.text.toLowerCase();
    const bbox = line.bbox;
    
    // Check if line contains date-related keywords
    const isDateField = dateKeywords.some(keyword => text.includes(keyword));
    
    if (isDateField && text.includes(':')) {
      const match = text.match(/([^:]+):/);
      if (match) {
        const label = match[1].trim();
        const fieldName = label.replace(/[^a-z0-9]/g, '_');
        
        fields.push({
          fieldName,
          label,
          x: bbox.x1 + 10,
          y: bbox.y0,
          width: 150,
          height: 20,
          type: 'date',
          confidence: (line.confidence || 0) / 100
        });
      }
    }
  }
  
  return fields;
}

/**
 * Detect signature fields from OCR data
 */
function detectSignatureFields(lines, words) {
  const fields = [];
  const signatureKeywords = ['signature', 'signed', 'sign here', 'resident', 'guardian', 'provider', 'manager'];
  
  for (const line of lines) {
    // Safety checks
    if (!line || !line.text || !line.bbox) continue;
    
    const text = line.text.toLowerCase();
    const bbox = line.bbox;
    
    // Check if line contains signature-related keywords
    const isSignatureField = signatureKeywords.some(keyword => text.includes(keyword)) && 
                             (text.includes(':') || text.includes('_'));
    
    if (isSignatureField) {
      let label = line.text.trim();
      label = label.replace(/[:_\-]+$/, '').trim();
      
      const fieldName = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
      
      fields.push({
        fieldName,
        label,
        x: bbox.x1 + 10,
        y: bbox.y0,
        width: 200,
        height: 20,
        type: 'signature',
        confidence: (line.confidence || 0) / 100
      });
    }
  }
  
  return fields;
}

/**
 * Detect dropdown/select fields from OCR data
 */
function detectDropdownFields(lines, words) {
  const fields = [];
  const dropdownKeywords = ['select', 'choose', 'gender', 'male', 'female', 'yes', 'no'];
  
  for (const line of lines) {
    // Safety checks
    if (!line || !line.text || !line.bbox) continue;
    
    const text = line.text.toLowerCase();
    const bbox = line.bbox;
    
    // Pattern: "Gender: Male Female" or "Select: ..."
    if (dropdownKeywords.some(kw => text.includes(kw)) && text.includes(':')) {
      const match = text.match(/([^:]+):/);
      if (match) {
        const label = match[1].trim();
        const fieldName = label.replace(/[^a-z0-9]/g, '_');
        
        fields.push({
          fieldName,
          label,
          x: bbox.x1 + 10,
          y: bbox.y0,
          width: 100,
          height: 20,
          type: 'select',
          confidence: (line.confidence || 0) / 100
        });
      }
    }
  }
  
  return fields;
}

/**
 * Detect textarea fields (multi-line text areas)
 */
function detectTextareaFields(lines, words) {
  const fields = [];
  const textareaKeywords = ['notes', 'comments', 'description', 'allergies', 'medications', 'remarks'];
  
  for (const line of lines) {
    // Safety checks
    if (!line || !line.text || !line.bbox) continue;
    
    const text = line.text.toLowerCase();
    const bbox = line.bbox;
    
    if (textareaKeywords.some(kw => text.includes(kw)) && text.includes(':')) {
      const match = text.match(/([^:]+):/);
      if (match) {
        const label = match[1].trim();
        const fieldName = label.replace(/[^a-z0-9]/g, '_');
        
        fields.push({
          fieldName,
          label,
          x: bbox.x1 + 10,
          y: bbox.y0,
          width: 400,
          height: 60,
          type: 'textarea',
          confidence: (line.confidence || 0) / 100
        });
      }
    }
  }
  
  return fields;
}

module.exports = {
  detectFieldsWithOCR,
  detectAllFieldTypes
};

