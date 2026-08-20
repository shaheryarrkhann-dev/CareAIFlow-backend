/**
 * Azure Document Intelligence Service
 * Uses Azure AI Document Intelligence (Form Recognizer) for professional-grade form field detection
 * This is the PRIMARY detection method - fallback to AI detection if this fails
 */

const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');

// Initialize Azure client (lazy initialization)
let documentAnalysisClient = null;

/**
 * Get or create Azure Document Intelligence client
 * @returns {DocumentAnalysisClient|null}
 */
function getAzureClient() {
  if (documentAnalysisClient) {
    return documentAnalysisClient;
  }

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !key) {
    console.warn('[AZURE-DI] ⚠️ Azure Document Intelligence not configured (missing endpoint or key)');
    console.warn('[AZURE-DI] Please add to .env:');
    console.warn('[AZURE-DI]   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://YOUR_RESOURCE.cognitiveservices.azure.com/');
    console.warn('[AZURE-DI]   AZURE_DOCUMENT_INTELLIGENCE_KEY=your_key_here');
    return null;
  }

  try {
    documentAnalysisClient = new DocumentAnalysisClient(
      endpoint,
      new AzureKeyCredential(key)
    );
    console.log('[AZURE-DI] ✅ Azure Document Intelligence client initialized');
    return documentAnalysisClient;
  } catch (error) {
    console.error('[AZURE-DI] ❌ Failed to initialize Azure client:', error.message);
    return null;
  }
}

/**
 * Map Azure field type to our field type
 * @param {string} azureType - Azure field type
 * @returns {string} Our field type
 */
function mapAzureFieldType(azureType) {
  const typeMap = {
    'string': 'text',
    'number': 'number',
    'integer': 'number',
    'date': 'date',
    'time': 'time',
    'phoneNumber': 'text',
    'email': 'email',
    'selectionMark': 'checkbox',
    'signature': 'signature',
    'array': 'textarea',
    'object': 'text'
  };
  
  return typeMap[azureType] || 'text';
}

/**
 * Normalize field name to snake_case
 * @param {string} fieldName 
 * @returns {string}
 */
function normalizeFieldName(fieldName) {
  if (!fieldName) return 'unknown_field';
  
  return fieldName
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '') // Remove special chars
    .replace(/[\s-]+/g, '_') // Replace spaces/dashes with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim underscores
}

/**
 * Detect form fields using Azure Document Intelligence
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} fileName - Original file name
 * @returns {Promise<Array>} Detected fields with coordinates
 */
async function detectFieldsWithAzure(pdfBuffer, fileName) {
  console.log('[AZURE-DI] 🔍 Starting Azure Document Intelligence field detection...');
  console.log(`[AZURE-DI] Analyzing PDF: ${fileName} (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);

  const client = getAzureClient();
  if (!client) {
    console.warn('[AZURE-DI] ⚠️ Azure client not available, skipping Azure detection');
    return null; // Return null to trigger fallback
  }

  try {
    // Use prebuilt-document model - it detects both structure AND form fields
    // This gives us: key-value pairs, tables, selection marks, AND layout
    const modelId = 'prebuilt-document';
    console.log(`[AZURE-DI] Using model: ${modelId}`);

    // Start analysis
    const poller = await client.beginAnalyzeDocument(modelId, pdfBuffer);
    console.log('[AZURE-DI] Analysis started, waiting for results...');

    // Wait for completion
    const result = await poller.pollUntilDone();
    console.log('[AZURE-DI] ✅ Analysis complete!');

    if (!result || !result.pages) {
      console.warn('[AZURE-DI] ⚠️ No pages found in result');
      return null;
    }

    console.log(`[AZURE-DI] Pages analyzed: ${result.pages.length}`);
    
    // Get page dimensions for coordinate conversion
    // Azure returns coordinates in INCHES, we need PDF points (1 inch = 72 points)
    const pageDimensions = result.pages.map(page => ({
      width: page.width * 72,  // Convert inches to points
      height: page.height * 72  // Convert inches to points
    }));
    
    console.log('[AZURE-DI] Page dimensions:', pageDimensions.map((d, i) => 
      `Page ${i+1}: ${d.width.toFixed(1)}x${d.height.toFixed(1)} pts`).join(', '));
    
    // Extract fields from all pages
    const allFields = [];
    
    // Process key-value pairs (form fields)
    if (result.keyValuePairs && result.keyValuePairs.length > 0) {
      console.log(`[AZURE-DI] Found ${result.keyValuePairs.length} key-value pairs`);
      
      for (const kvp of result.keyValuePairs) {
        // Check if key exists and has content
        if (!kvp.key || !kvp.key.content) {
          console.log('[AZURE-DI]   ⚠️ Skipping kvp: missing key or key content');
          continue;
        }
        
        const keyContent = kvp.key.content.trim();
        
        // Skip if key is empty (not a form field)
        if (keyContent.length === 0) {
          console.log(`[AZURE-DI]   ⚠️ Skipping kvp: empty key content`);
          continue;
        }
        
        // Get value content (can be empty for template forms)
        const valueContent = kvp.value?.content || '';
        
        // For empty forms, use KEY bounding region to estimate where the value field should be
        // Azure often detects labels but not the empty underlined areas for values
        let boundingRegions = [];
        
        if (kvp.value && kvp.value.boundingRegions && kvp.value.boundingRegions.length > 0) {
          // Value has bounding regions (filled form or detected value area)
          boundingRegions = kvp.value.boundingRegions;
        } else if (kvp.key.boundingRegions && kvp.key.boundingRegions.length > 0) {
          // Value has no bounding regions - use key's position to estimate value position
          // This is common for empty form templates with underlines
          const keyRegion = kvp.key.boundingRegions[0];
          let keyPolygon = keyRegion.polygon || [];
          
          // Azure can return polygon as either:
          // 1. Array of objects: [{x, y}, {x, y}, {x, y}, {x, y}]
          // 2. Flat array: [x, y, x, y, x, y, x, y]
          if (keyPolygon.length > 0 && typeof keyPolygon[0] === 'object' && keyPolygon[0].x !== undefined) {
            // Convert object format to flat array
            keyPolygon = keyPolygon.flatMap(point => [point.x, point.y]);
            console.log(`[AZURE-DI]   📊 Debug "${keyContent}": converted object polygon (${keyPolygon.length/2} points) to flat array`);
          }
          
          console.log(`[AZURE-DI]   📊 Debug "${keyContent}": polygon length=${keyPolygon.length}, values=[${keyPolygon.slice(0, 8).join(', ')}]`);
          
          if (keyPolygon.length >= 8) {
            // Azure returns coordinates in INCHES - keep them in inches for estimation
            const keyXCoords = [keyPolygon[0], keyPolygon[2], keyPolygon[4], keyPolygon[6]];
            const keyYCoords = [keyPolygon[1], keyPolygon[3], keyPolygon[5], keyPolygon[7]];
            const keyMaxX = Math.max(...keyXCoords);
            const keyMinY = Math.min(...keyYCoords);
            const keyHeight = Math.max(...keyYCoords) - keyMinY;
            
            // Estimate value field: starts after key with some spacing, extends to the right
            // Keep spacing in inches (will be converted to points later)
            const valueX = keyMaxX + 0.15; // ~10pt (0.15 inch) spacing after label
            const valueY = keyMinY;
            const valueWidth = 2.0; // ~150pt (2 inches) default width for form fields
            
            // Create estimated bounding region for value (still in INCHES)
            boundingRegions = [{
              pageNumber: keyRegion.pageNumber,
              polygon: [
                valueX, valueY,                    // top-left
                valueX + valueWidth, valueY,        // top-right
                valueX + valueWidth, valueY + keyHeight, // bottom-right
                valueX, valueY + keyHeight          // bottom-left
              ]
            }];
            
            console.log(`[AZURE-DI]   ℹ️  "${keyContent}": using estimated value position (empty form field)`);
          } else {
            console.log(`[AZURE-DI]   ⚠️ Skipping "${keyContent}": no valid bounding regions`);
            continue;
          }
        } else {
          console.log(`[AZURE-DI]   ⚠️ Skipping "${keyContent}": no bounding regions for key or value`);
          continue;
        }
        
        if (boundingRegions.length === 0) {
          console.log(`[AZURE-DI]   ⚠️ Skipping "${keyContent}": could not determine field position`);
          continue;
        }
        
        const firstRegion = boundingRegions[0];
        const pageNumber = firstRegion.pageNumber - 1; // Convert to 0-based
        let polygon = firstRegion.polygon || [];
        
        // Convert object format [{x, y}, ...] to flat array [x, y, ...] if needed
        if (polygon.length > 0 && typeof polygon[0] === 'object' && polygon[0].x !== undefined) {
          polygon = polygon.flatMap(point => [point.x, point.y]);
        }
        
        if (polygon.length < 8) continue; // Need 8 values for 4 coordinates
        
        // Get page dimensions for coordinate conversion
        const pageDims = pageDimensions[pageNumber];
        if (!pageDims) {
          console.warn(`[AZURE-DI]   ⚠️ No dimensions for page ${pageNumber}`);
          continue;
        }
        
        // Azure returns polygon coordinates in INCHES
        // Convert to PDF points (1 inch = 72 points)
        const xCoords = [polygon[0], polygon[2], polygon[4], polygon[6]].map(coord => coord * 72);
        const yCoords = [polygon[1], polygon[3], polygon[5], polygon[7]].map(coord => coord * 72);
        
        const x = Math.min(...xCoords);
        const y = Math.min(...yCoords);
        const width = Math.max(...xCoords) - x;
        const height = Math.max(...yCoords) - y;
        
        // Normalize field name
        const fieldName = normalizeFieldName(keyContent);
        
        // Detect field type from content or key
        let fieldType = 'text';
        const keyLower = keyContent.toLowerCase();
        
        // Check for gender/checkbox fields - these should NOT be text fields
        if (keyLower.includes('male') || keyLower.includes('female') || 
            keyLower.includes('gender') || keyLower.includes('sex')) {
          fieldType = 'checkbox';
        } else if (keyLower.includes('date') || keyLower.includes('dob') || keyLower.includes('born')) {
          fieldType = 'date';
        } else if (keyLower.includes('phone') || keyLower.includes('tel')) {
          fieldType = 'text';
        } else if (keyLower.includes('email') || keyLower.includes('e-mail')) {
          fieldType = 'email';
        } else if (keyLower.includes('signature') || keyLower.includes('signed')) {
          fieldType = 'signature';
        } else if (keyLower.includes('ssn') || keyLower.includes('social')) {
          fieldType = 'text';
        }
        
        const field = {
          fieldName,
          label: keyContent.trim(),
          page: pageNumber,
          x: x,
          y: y,
          width: width,
          height: height,
          type: fieldType,
          confidence: kvp.confidence || 0,
          source: 'azure',
          value: valueContent // Store detected value for reference
        };
        
        allFields.push(field);
        console.log(`[AZURE-DI]   ✓ "${fieldName}" (${keyContent}) at page ${pageNumber + 1}, (${x.toFixed(1)}, ${y.toFixed(1)}), confidence: ${(kvp.confidence * 100).toFixed(1)}%`);
      }
    }
    
    // DON'T process layout lines here - Azure's coordinate system is different from PDF coordinates
    // Let the text-based AI detection handle this (it uses PDFjs with correct coordinates)
    console.log('[AZURE-DI] ⚠️ Layout-inferred fields disabled - coordinate system mismatch');
    console.log('[AZURE-DI] Text-based AI will supplement with accurate coordinates');
    
    // Process selection marks (checkboxes)
    if (result.pages) {
      for (let pageIndex = 0; pageIndex < result.pages.length; pageIndex++) {
        const page = result.pages[pageIndex];
        
        if (page.selectionMarks && page.selectionMarks.length > 0) {
          console.log(`[AZURE-DI] Found ${page.selectionMarks.length} selection marks on page ${pageIndex + 1}`);
          
          for (const mark of page.selectionMarks) {
            let polygon = mark.polygon || [];
            
            // Convert object format [{x, y}, ...] to flat array [x, y, ...] if needed
            if (polygon.length > 0 && typeof polygon[0] === 'object' && polygon[0].x !== undefined) {
              polygon = polygon.flatMap(point => [point.x, point.y]);
            }
            
            if (polygon.length < 8) continue; // Need 8 values for 4 coordinates
            
            // Get page dimensions for this checkbox's page
            const pageDims = pageDimensions[pageIndex];
            if (!pageDims) continue;
            
            // Convert from inches to PDF points (1 inch = 72 points)
            const xCoords = [polygon[0], polygon[2], polygon[4], polygon[6]].map(coord => coord * 72);
            const yCoords = [polygon[1], polygon[3], polygon[5], polygon[7]].map(coord => coord * 72);
            
            const x = Math.min(...xCoords);
            const y = Math.min(...yCoords);
            const width = Math.max(...xCoords) - x;
            const height = Math.max(...yCoords) - y;
            
            // Try to find nearby text to use as label
            let label = 'checkbox';
            if (page.words) {
              // Find closest word within 50 points (in PDF coordinates)
              let closestWord = null;
              let closestDistance = 50;
              
              for (const word of page.words) {
                let wordPolygon = word.polygon || [];
                
                // Convert object format [{x, y}, ...] to flat array [x, y, ...] if needed
                if (wordPolygon.length > 0 && typeof wordPolygon[0] === 'object' && wordPolygon[0].x !== undefined) {
                  wordPolygon = wordPolygon.flatMap(point => [point.x, point.y]);
                }
                
                if (wordPolygon.length < 8) continue;
                
                // Convert word coordinates from inches to points
                const wordX = Math.min(wordPolygon[0], wordPolygon[2], wordPolygon[4], wordPolygon[6]) * 72;
                const wordY = Math.min(wordPolygon[1], wordPolygon[3], wordPolygon[5], wordPolygon[7]) * 72;
                
                const distance = Math.sqrt(Math.pow(wordX - x, 2) + Math.pow(wordY - y, 2));
                
                if (distance < closestDistance) {
                  closestDistance = distance;
                  closestWord = word.content;
                }
              }
              
              if (closestWord) {
                label = closestWord;
              }
            }
            
            const fieldName = normalizeFieldName(label);
            
            const field = {
              fieldName: `checkbox_${fieldName}`,
              label,
              page: pageIndex,
              x: x,
              y: y,
              width: width,
              height: height,
              type: 'checkbox',
              confidence: mark.confidence || 0,
              source: 'azure',
              state: mark.state // 'selected' or 'unselected'
            };
            
            allFields.push(field);
          }
        }
      }
    }
    
    console.log(`[AZURE-DI] ✅ Total fields detected: ${allFields.length}`);
    console.log(`[AZURE-DI] Field breakdown:`);
    const fieldTypes = allFields.reduce((acc, f) => {
      acc[f.type] = (acc[f.type] || 0) + 1;
      return acc;
    }, {});
    Object.entries(fieldTypes).forEach(([type, count]) => {
      console.log(`[AZURE-DI]   ${type}: ${count} fields`);
    });
    
    return allFields;

  } catch (error) {
    console.error('[AZURE-DI] ❌ Error during Azure Document Intelligence analysis:');
    console.error('[AZURE-DI] Error message:', error.message);
    
    if (error.code) {
      console.error('[AZURE-DI] Error code:', error.code);
    }
    
    if (error.statusCode === 401) {
      console.error('[AZURE-DI] ⚠️ Authentication failed - check your AZURE_DOCUMENT_INTELLIGENCE_KEY');
    } else if (error.statusCode === 404) {
      console.error('[AZURE-DI] ⚠️ Endpoint not found - check your AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    }
    
    // Return null to trigger fallback to other detection methods
    return null;
  }
}

/**
 * Check if Azure Document Intelligence is configured and available
 * @returns {boolean}
 */
function isAzureConfigured() {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  return !!(endpoint && key);
}

module.exports = {
  detectFieldsWithAzure,
  isAzureConfigured,
  getAzureClient
};

