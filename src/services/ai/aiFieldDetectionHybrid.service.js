/**
 * Hybrid PDF Field Detection Service
 * Schema-Driven OpenAI Approach - 100% Field Coverage
 *
 * Priority Order:
 * 1. Schema-Driven Detection (PRIMARY - ensures 100% schema field coverage)
 *    - Uses OpenAI GPT-4o for bulk detection
 *    - Targeted search for each schema field
 *    - Guarantees ALL schema fields have mappings
 * 2. OpenAI GPT-4o Vision (FALLBACK - only if schema-driven fails)
 * 3. OCR-based detection (LAST RESORT - only if all OpenAI methods fail)
 *
 * Results: 100% schema field coverage (found OR notInPdf)
 * No Azure dependency - pure OpenAI approach
 */

const { generateFieldMappingWithCoordinateAI, extractPdfStructure } = require('./aiFieldDetectionCoordinate.service');
const { generateFieldMappingWithAI, pdfPageToImage } = require('./aiFieldDetection.service');
const { validateAndRefineCoordinates } = require('../pdf/pdfStructureAnalyzer.service');
const { detectFieldsFromSchema } = require('./schemaDrivenFieldDetection.service');
const {
  extractTextWithOCR,
  enhanceFieldsWithOCR,
  shouldUseOCR
} = require('./ocrEnhancement.service');
const { detectFieldsWithOCR } = require('./ocrFieldDetection.service');
// Azure removed - using OpenAI-only approach

/**
 * Analyze PDF complexity to determine which detection method(s) to use
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<Object>} Complexity analysis result
 */
async function analyzePdfComplexity(pdfBuffer) {
  try {
    console.log('[HYBRID] Analyzing PDF complexity...');

    const structure = await extractPdfStructure(pdfBuffer);

    let complexity = {
      simple: false,
      complex: false,
      hasCheckboxes: false,
      hasUnderlines: false,
      hasTablesOrGrid: false,
      textDensity: 0,
      recommendedMethod: 'text'
    };

    for (const page of structure) {
      const text = page.textContent.toLowerCase();

      // Check for checkboxes (☐, □, ☑, ☒, or text patterns)
      if (text.includes('☐') || text.includes('□') || text.includes('☑') ||
          text.includes('☒') || text.includes('[ ]') || text.includes('[x]')) {
        complexity.hasCheckboxes = true;
      }

      // Check for underlines (common patterns: ___, ---, etc.)
      const underlinePattern = /_{3,}|_{2,}\s|\.{3,}|-{3,}/g;
      const underlineMatches = text.match(underlinePattern);
      if (underlineMatches && underlineMatches.length > 5) {
        complexity.hasUnderlines = true;
      }

      // Check text density (items per page)
      const density = page.items.length / (page.width * page.height);
      complexity.textDensity = Math.max(complexity.textDensity, density);

      // Check for table/grid patterns (many items with similar Y coordinates)
      const lineYPositions = page.lines.map(l => Math.round(l.y / 10) * 10);
      const uniqueLines = new Set(lineYPositions);
      if (uniqueLines.size > 10 && uniqueLines.size < page.lines.length / 2) {
        complexity.hasTablesOrGrid = true;
      }
    }

    // Determine complexity level
    complexity.complex = complexity.hasCheckboxes || complexity.hasTablesOrGrid;
    complexity.simple = !complexity.complex && complexity.hasUnderlines;

    // Recommend detection method
    if (complexity.complex) {
      complexity.recommendedMethod = 'hybrid'; // Use both methods
    } else if (complexity.simple) {
      complexity.recommendedMethod = 'text'; // Text-based is sufficient
    } else {
      complexity.recommendedMethod = 'vision'; // Vision may work better
    }

    console.log('[HYBRID] Complexity analysis:', {
      simple: complexity.simple,
      complex: complexity.complex,
      hasCheckboxes: complexity.hasCheckboxes,
      hasUnderlines: complexity.hasUnderlines,
      recommendedMethod: complexity.recommendedMethod
    });

    return complexity;
  } catch (error) {
    console.error('[HYBRID] Complexity analysis failed:', error);
    return { recommendedMethod: 'text', simple: false, complex: false };
  }
}

/**
 * Merge fields from multiple detection methods
 * @param {Array} textFields - Fields detected by text-based method
 * @param {Array} visionFields - Fields detected by vision-based method
 * @returns {Array} Merged field mapping
 */
function mergeFieldDetections(textFields, visionFields) {
  console.log(`[HYBRID] Merging fields: ${textFields.length} text + ${visionFields.length} vision`);

  const merged = [];
  const processedFields = new Set();

  // Helper to normalize field names for comparison
  const normalize = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Create a map of vision fields for quick lookup
  const visionFieldMap = new Map();
  visionFields.forEach(field => {
    const key = normalize(field.fieldName || field.label);
    visionFieldMap.set(key, field);
  });

  // Process text-based fields first (generally more accurate coordinates)
  for (const textField of textFields) {
    const normalizedName = normalize(textField.fieldName || textField.label);
    const visionField = visionFieldMap.get(normalizedName);

    if (visionField) {
      // Field detected by both methods - merge intelligently
      console.log(`[HYBRID] Merging field: ${textField.fieldName}`);

      // For checkboxes, prefer vision detection (better at visual elements)
      if (textField.type === 'checkbox' || visionField.type === 'checkbox') {
        merged.push({
          ...visionField,
          detectionMethod: 'vision',
          confidence: 'high',
          alternateDetection: {
            method: 'text',
            coordinates: { x: textField.x, y: textField.y }
          }
        });
      } else {
        // For text fields, ALWAYS prefer text-based coordinates (more accurate)
        // Vision API coordinates from image conversion can have scaling errors
        // Only use vision coordinates if text-based has no coordinates
        const useTextCoords = textField.x !== undefined && textField.y !== undefined &&
                             !isNaN(textField.x) && !isNaN(textField.y);
        const useVisionCoords = !useTextCoords && visionField.x !== undefined &&
                                visionField.y !== undefined && !isNaN(visionField.x) && !isNaN(visionField.y);

        if (useTextCoords) {
          // Use text-based coordinates (preferred - from native PDF structure)
          merged.push({
            ...textField,
            detectionMethod: 'text',
            confidence: 'high',
            alternateDetection: {
              method: 'vision',
              coordinates: { x: visionField.x, y: visionField.y }
            }
          });
        } else if (useVisionCoords) {
          // Fallback to vision if text has no coordinates
          console.warn(`[HYBRID] Using vision coordinates for "${textField.fieldName}" - text-based had no coords`);
          merged.push({
            ...visionField,
            fieldName: textField.fieldName || visionField.fieldName,
            label: textField.label || visionField.label,
            detectionMethod: 'vision',
            confidence: 'medium',
            alternateDetection: {
              method: 'text',
              coordinates: { x: textField.x, y: textField.y }
            }
          });
        } else {
          // Use text field with default coordinates
          merged.push({
            ...textField,
            detectionMethod: 'text',
            confidence: 'low'
          });
        }
      }

      processedFields.add(normalizedName);
    } else {
      // Field only detected by text method
      merged.push({
        ...textField,
        detectionMethod: 'text',
        confidence: 'medium'
      });
      processedFields.add(normalizedName);
    }
  }

  // Add vision-only fields
  for (const visionField of visionFields) {
    const normalizedName = normalize(visionField.fieldName || visionField.label);

    if (!processedFields.has(normalizedName)) {
      merged.push({
        ...visionField,
        detectionMethod: 'vision',
        confidence: 'medium'
      });
    }
  }

  console.log(`[HYBRID] Merged result: ${merged.length} total fields`);
  return merged;
}

/**
 * Enhance field detection with type-specific improvements
 * @param {Array} fields - Detected fields
 * @param {Object} complexity - PDF complexity analysis
 * @returns {Array} Enhanced fields
 */
function enhanceFieldDetection(fields, complexity) {
  console.log('[HYBRID] Enhancing field detection...');

  return fields.map(field => {
    const enhanced = { ...field };

    // Adjust checkbox dimensions for better rendering
    if (field.type === 'checkbox' || field.type === 'boolean') {
      enhanced.width = Math.min(field.width || 15, 15);
      enhanced.height = Math.min(field.height || 15, 15);

      // If detected by vision and has underlines, adjust Y position slightly
      if (field.detectionMethod === 'vision' && complexity.hasUnderlines) {
        enhanced.y = field.y - 2; // Slight adjustment for alignment
      }
    }

    // Enhance text field widths based on label length
    if (field.type === 'text' || field.type === 'textarea') {
      const labelLength = (field.label || '').length;

      // If width seems too small, adjust based on label
      if (field.width < 100 && labelLength > 10) {
        enhanced.width = Math.max(field.width, labelLength * 8);
      }
    }

    // Ensure date fields have appropriate width
    if (field.type === 'date') {
      enhanced.width = Math.max(field.width || 120, 100);
      enhanced.height = Math.max(field.height || 20, 18);
    }

    return enhanced;
  });
}

/**
 * Generate field mapping using hybrid detection approach
 * @param {Object} params - Detection parameters
 * @param {Buffer} params.pdfBuffer - PDF file buffer
 * @param {string} params.fileName - File name
 * @param {string} params.tenantId - Tenant ID
 * @param {Object} [params.formSchema] - Optional form schema
 * @param {boolean} [params.forceVision] - Force vision detection even for simple forms
 * @returns {Promise<Array>} Hybrid field mapping
 */
async function generateFieldMappingWithHybridAI({
  pdfBuffer,
  fileName,
  tenantId,
  formSchema = null,
  forceVision = false,
  useSchemaDriven = false  // DISABLED: Schema-driven was too slow - checking all 410 fields when PDF only has 15. Use traditional bulk detection instead.
}) {
  try {
    console.log(`[HYBRID] 🎯 Starting hybrid field detection for ${fileName}...`);

    // Step 0: Schema-Driven Detection (PRIMARY - ensures 100% coverage)
    if (useSchemaDriven) {
      console.log('[HYBRID] 🎯 Using SCHEMA-DRIVEN detection for 100% field coverage...');
      try {
        const schemaStart = Date.now();
        const schemaFields = await detectFieldsFromSchema({
          pdfBuffer,
          fileName,
          tenantId,
          formSchema
        });
        const schemaTime = Date.now() - schemaStart;

        if (schemaFields && schemaFields.length > 0) {
          console.log(`[HYBRID] ✅ Schema-driven detection: ${schemaFields.length} fields (100% coverage) (${schemaTime}ms)`);
          console.log(`[HYBRID] 🎉 All schema fields have mappings (found OR notInPdf)`);

          // Validate and refine coordinates for found fields
          const foundFields = schemaFields.filter(f => !f.notInPdf && f.x !== null && f.y !== null);
          if (foundFields.length > 0) {
            try {
              const { validateAndRefineCoordinates } = require('../pdf/pdfStructureAnalyzer.service');
              const structure = await extractPdfStructure(pdfBuffer);
              const validatedFields = validateAndRefineCoordinates(foundFields, structure);

              // Merge validated found fields with notInPdf fields
              const notInPdfFields = schemaFields.filter(f => f.notInPdf);
              const finalFields = [...validatedFields, ...notInPdfFields];

              console.log(`[HYBRID] ✅ Validated ${validatedFields.length} found fields`);
              return finalFields;
            } catch (validationError) {
              console.warn(`[HYBRID] ⚠️ Coordinate validation failed, using schema fields as-is: ${validationError.message}`);
              return schemaFields;
            }
          }

          return schemaFields;
        } else {
          console.log('[HYBRID] Schema-driven detection returned null/empty - schema may be generating, using traditional detection');
        }
      } catch (schemaError) {
        console.warn(`[HYBRID] ⚠️ Schema-driven detection unavailable: ${schemaError.message}`);
        console.log('[HYBRID] Using traditional detection methods (schema will be used for remapping after generation)...');
        // Continue to fallback methods - this is expected if schema doesn't exist yet
      }
    }

    // Fallback: Traditional detection methods (if schema-driven fails or disabled)
    console.log('[HYBRID] 🔄 Using traditional detection methods...');

    // Step 0: Analyze PDF complexity
    const complexity = await analyzePdfComplexity(pdfBuffer);
    console.log(`[HYBRID] Recommended method: ${complexity.recommendedMethod}`);

    let ocrFields = [];
    let textFields = [];
    let visionFields = [];
    let ocrError = null;
    let textError = null;
    let visionError = null;

    // Step 1: Run OpenAI Text-based detection FIRST (PRIMARY - fast, schema-aware)
    console.log('[HYBRID] 🚀 Running OpenAI GPT-4.1 Text Analysis as PRIMARY method...');
    try {
      const textStart = Date.now();
      textFields = await generateFieldMappingWithCoordinateAI({
        pdfBuffer,
        fileName,
        tenantId,
        formSchema
      });
      const textTime = Date.now() - textStart;

      if (textFields && textFields.length > 0) {
        console.log(`[HYBRID] ✅ OpenAI Text/Structure: ${textFields.length} fields (${textTime}ms)`);
        console.log('[HYBRID] 🎉 OpenAI detection found fields - using schema-aware detection!');
      } else {
        console.log(`[HYBRID] ⚠️ OpenAI Text returned no fields, will try fallback methods`);
      }
    } catch (error) {
      textError = error;
      console.error(`[HYBRID] ❌ OpenAI Text detection failed: ${error.message}`);
      console.log('[HYBRID] Falling back to other methods...');
    }

    // Step 2: Run OCR-based detection (FALLBACK if OpenAI not available or needs more fields)
    const shouldRunOCR = !textFields || textFields.length === 0;
    if (shouldRunOCR) {
      console.log('[HYBRID] 🔍 Running OCR-based detection as fallback...');
      try {
        const ocrStart = Date.now();

        // Get PDF structure to determine number of pages
        const pdfStructure = await extractPdfStructure(pdfBuffer);
        const numPages = pdfStructure.length;

        ocrFields = await detectFieldsWithOCR(pdfBuffer, fileName, {
          numPages: numPages,
          scale: 2 // High quality
        });

        const ocrTime = Date.now() - ocrStart;
        console.log(`[HYBRID] ✅ OCR-based: ${ocrFields.length} fields (${ocrTime}ms)`);
      } catch (error) {
        ocrError = error;
        console.error(`[HYBRID] ❌ OCR-based detection failed: ${error.message}`);
      }
    } else {
      console.log('[HYBRID] Skipping OCR (Azure already processed document)');
    }

    // Step 3: Run text-based AI detection (FALLBACK/ENHANCEMENT)
    console.log('[HYBRID] Running text-based AI detection...');
    try {
      const textStart = Date.now();
      textFields = await generateFieldMappingWithCoordinateAI({
        pdfBuffer,
        fileName,
        tenantId,
        formSchema
      });
      const textTime = Date.now() - textStart;
      console.log(`[HYBRID] ✅ Text-based: ${textFields.length} fields (${textTime}ms)`);
    } catch (error) {
      textError = error;
      console.error(`[HYBRID] ❌ Text-based detection failed: ${error.message}`);
    }

    // Step 3: Run vision-based detection ONLY if really needed
    // CRITICAL: Prioritize text-based detection to avoid PDF-to-image conversion issues
    // Only use vision if text-based completely fails or forced
    const shouldUseVision = forceVision ||
                           (textFields.length === 0 && complexity.recommendedMethod === 'vision');

    // For hybrid mode, prefer text-based unless explicitly needed
    // Image conversion can cause coordinate scaling issues
    if (complexity.recommendedMethod === 'hybrid' && textFields.length > 0) {
      console.log('[HYBRID] Text-based detection found fields - skipping vision to avoid coordinate scaling issues');
    }

    if (shouldUseVision) {
      console.log('[HYBRID] Running vision-based detection...');
      try {
        const visionStart = Date.now();
        visionFields = await generateFieldMappingWithAI({
          pdfBuffer,
          fileName,
          tenantId,
          formSchema
        });
        const visionTime = Date.now() - visionStart;
        console.log(`[HYBRID] ✅ Vision-based: ${visionFields.length} fields (${visionTime}ms)`);
      } catch (error) {
        visionError = error;
        console.error(`[HYBRID] ❌ Vision-based detection failed: ${error.message}`);
      }
    } else {
      console.log('[HYBRID] ⏭️  Skipping vision-based detection (not needed for this form)');
    }

    // Step 4: Handle detection results - OpenAI First Approach

    // PRIORITY 1: If OpenAI succeeded, use OpenAI results (schema-aware, accurate)
    if (!textError && textFields && textFields.length > 0) {
      console.log('[HYBRID] ✅ Using OpenAI results (PRIMARY - schema-aware, accurate)');

      // If OpenAI found good results, use them directly
      // Only merge with vision if it found additional fields
      if (visionFields && visionFields.length > 0 && !visionError) {
        console.log('[HYBRID] Merging OpenAI with Vision results for completeness...');
        const mergedFields = mergeFieldDetections(textFields, visionFields);
        return enhanceFieldDetection(mergedFields, complexity);
      }

      return enhanceFieldDetection(textFields, complexity);
    }

    // PRIORITY 2: If OpenAI failed, try Vision (OpenAI Vision API)
    if (textError && !visionError && visionFields && visionFields.length > 0) {
      console.log('[HYBRID] ✅ Using OpenAI Vision results (OpenAI text failed, but vision succeeded)');
      return enhanceFieldDetection(visionFields, complexity);
    }

    // PRIORITY 3: Minimal fallback to OCR only if OpenAI completely failed
    if (textError && visionError && !ocrError && ocrFields && ocrFields.length > 0) {
      console.log('[HYBRID] ⚠️ Using OCR as minimal fallback (OpenAI methods failed)');
      return enhanceFieldDetection(ocrFields, complexity);
    }

    // PRIORITY 4: Handle cases where all methods failed
    if (textError && ocrError && visionError) {
      throw new Error('All detection methods failed (OpenAI Text, OpenAI Vision, OCR)');
    }

    // Step 5: Final merge if we have multiple successful methods
    console.log('[HYBRID] Merging results from successful detection methods...');
    const mergedTextVision = mergeFieldDetections(textFields, visionFields);
    const mergedFields = mergeFieldDetections(ocrFields, mergedTextVision);

    // Step 6: Enhance merged fields
    const enhancedFields = enhanceFieldDetection(mergedFields, complexity);

    // Note: We already ran comprehensive OCR as PRIMARY method in Step 1.5
    // No need for additional OCR enhancement
    const finalFields = enhancedFields;

    // Step 7: Validate and refine coordinates for all fields
    // Get page dimensions from structure
    let pageWidth = 612; // Default US Letter width
    let pageHeight = 792; // Default US Letter height

    try {
      const structure = await extractPdfStructure(pdfBuffer);
      if (structure.length > 0 && structure[0].width && structure[0].height) {
        pageWidth = structure[0].width;
        pageHeight = structure[0].height;
      }
    } catch (error) {
      console.warn('[HYBRID] Could not extract page dimensions for validation, using defaults');
    }

    const validatedFields = validateAndRefineCoordinates(finalFields, pageWidth, pageHeight);

    // Step 8: Log summary
    console.log('\n[HYBRID] 🎉 Hybrid Detection Complete!');
    console.log(`[HYBRID] ✨ Total fields detected: ${validatedFields.length}`);
    console.log(`[HYBRID] 📊 Detection breakdown:`);

    const openAITextOnly = validatedFields.filter(f => f.detectionMethod === 'text' || f.detectionMethod === 'structure').length;
    const visionOnly = validatedFields.filter(f => f.detectionMethod === 'vision').length;
    const ocrPrimary = validatedFields.filter(f => f.detectionMethod === 'ocr-primary').length;
    const ocrUnderline = validatedFields.filter(f => f.detectionMethod === 'ocr-underline').length;
    const ocrCheckbox = validatedFields.filter(f => f.detectionMethod === 'ocr-checkbox').length;
    const highConfidence = validatedFields.filter(f => f.confidence === 'high').length;

    if (openAITextOnly > 0) {
      console.log(`[HYBRID]    🚀 OpenAI Text/Structure (PRIMARY): ${openAITextOnly} fields`);
    }
    if (visionOnly > 0) {
      console.log(`[HYBRID]    - OpenAI Vision: ${visionOnly} fields`);
    }
    if (ocrPrimary > 0) {
      console.log(`[HYBRID]    - OCR-based (fallback): ${ocrPrimary} fields`);
    }
    if (ocrUnderline > 0 || ocrCheckbox > 0) {
      console.log(`[HYBRID]    - OCR-enhanced: ${ocrUnderline + ocrCheckbox} fields (${ocrUnderline} underlines, ${ocrCheckbox} checkboxes)`);
    }
    console.log(`[HYBRID]    - High confidence: ${highConfidence} fields`);

    // Log field types
    const fieldTypes = {};
    validatedFields.forEach(f => {
      fieldTypes[f.type] = (fieldTypes[f.type] || 0) + 1;
    });
    console.log('[HYBRID] 📋 Field types:', fieldTypes);

    // Log coordinate validation stats
    const fieldsWithValidCoords = validatedFields.filter(f =>
      f.x >= 0 && f.y >= 0 && f.width > 0 && f.height > 0
    ).length;
    console.log(`[HYBRID] ✅ Validated coordinates: ${fieldsWithValidCoords}/${validatedFields.length} fields`);

    return validatedFields;

  } catch (error) {
    console.error('[HYBRID] Hybrid detection failed:', error);
    throw error;
  }
}

/**
 * Detect form fields using hybrid approach with complexity analysis
 * This is the main entry point for hybrid detection
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - File name
 * @param {Object} formSchema - Optional form schema
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Detected fields
 */
async function detectFormFieldsWithHybridAI(pdfBuffer, fileName, formSchema = null, tenantId = 'default') {
  return generateFieldMappingWithHybridAI({
    pdfBuffer,
    fileName,
    tenantId,
    formSchema,
    forceVision: false
  });
}

module.exports = {
  generateFieldMappingWithHybridAI,
  detectFormFieldsWithHybridAI,
  analyzePdfComplexity,
  mergeFieldDetections,
  enhanceFieldDetection
};

