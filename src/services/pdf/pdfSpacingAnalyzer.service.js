/**
 * PDF Spacing Analyzer
 * Dynamically calculates spacing and padding from actual PDF structure
 * This eliminates the need for hardcoded padding/margin values
 */

/**
 * Find the actual gap between label and field start in PDF
 * @param {Array} textItems - Text items from PDF structure
 * @param {number} fieldX - Detected field X coordinate
 * @param {string} label - Field label text
 * @param {number} fieldY - Field Y coordinate (approximate)
 * @returns {Object} Actual spacing information
 */
function findActualSpacingFromPdf(textItems, fieldX, label, fieldY) {
  // Find text items on the same line (within 5pt Y difference)
  const sameLineItems = textItems.filter(item => 
    Math.abs(item.y - fieldY) < 5
  ).sort((a, b) => a.x - b.x); // Sort by X position
  
  // Try to find the label text items
  const labelText = label ? label.replace(/:\s*$/, '').trim().toLowerCase() : '';
  let labelEndX = null;
  let fieldStartX = null;
  let actualSpacing = null;
  
  if (labelText && sameLineItems.length > 0) {
    // Strategy 1: Try to find label as single text item
    for (let i = 0; i < sameLineItems.length; i++) {
      const item = sameLineItems[i];
      const itemText = item.text.toLowerCase().trim();
      
      // Check for exact match or if label contains item text or vice versa
      if (itemText.includes(labelText) || labelText.includes(itemText) || 
          itemText === labelText) {
        // Found label - calculate where it ends
        labelEndX = item.x + (item.width || 0);
        
        // Look for the next item after the label
        for (let j = i + 1; j < sameLineItems.length; j++) {
          const nextItem = sameLineItems[j];
          if (nextItem.x > labelEndX + 5) {
            fieldStartX = nextItem.x;
            actualSpacing = fieldStartX - labelEndX;
            break;
          }
        }
        
        // If no next item found, check gap to detected fieldX
        if (!fieldStartX && fieldX > labelEndX) {
          actualSpacing = fieldX - labelEndX;
        }
        
        break;
      }
    }
    
    // Strategy 2: If not found, try word-based matching (labels split across items)
    if (!labelEndX && labelText.length > 0) {
      const labelWords = labelText.split(/\s+/).filter(w => w.length > 2); // Get significant words
      
      // Combine consecutive text items to reconstruct full label
      for (let i = 0; i < sameLineItems.length; i++) {
        let combinedText = '';
        let combinedEndX = 0;
        let matchedWords = 0;
        
        // Try combining items starting from position i
        for (let j = i; j < Math.min(i + 5, sameLineItems.length); j++) {
          const item = sameLineItems[j];
          combinedText += (combinedText ? ' ' : '') + item.text.toLowerCase();
          combinedEndX = item.x + (item.width || 0);
          
          // Check if combined text matches label words
          matchedWords = labelWords.filter(word => 
            combinedText.includes(word)
          ).length;
          
          // If we matched at least 60% of label words, consider it a match
          if (matchedWords >= Math.ceil(labelWords.length * 0.6)) {
            labelEndX = combinedEndX;
            
            // Look for next item after combined label
            if (j + 1 < sameLineItems.length) {
              const nextItem = sameLineItems[j + 1];
              if (nextItem.x > labelEndX + 5) {
                fieldStartX = nextItem.x;
                actualSpacing = fieldStartX - labelEndX;
                break;
              }
            }
            
            // Check gap to detected fieldX
            if (!fieldStartX && fieldX > labelEndX) {
              actualSpacing = fieldX - labelEndX;
            }
            
            break;
          }
          
          // If items are too far apart, stop combining
          if (j + 1 < sameLineItems.length) {
            const nextItem = sameLineItems[j + 1];
            if (nextItem.x - combinedEndX > 20) {
              break; // Gap too large, stop combining
            }
          }
        }
        
        if (labelEndX) break;
      }
    }
    
    // Strategy 3: If still not found, try partial matching with first few words
    if (!labelEndX && labelText.length > 0) {
      const firstWords = labelText.split(/\s+/).slice(0, 2).join(' '); // First 2 words
      
      for (let i = 0; i < sameLineItems.length; i++) {
        const item = sameLineItems[i];
        const itemText = item.text.toLowerCase();
        
        if (itemText.includes(firstWords) || firstWords.includes(itemText)) {
          labelEndX = item.x + (item.width || 0);
          
          // Check gap to detected fieldX
          if (fieldX > labelEndX) {
            actualSpacing = fieldX - labelEndX;
          }
          break;
        }
      }
    }
  }
  
  return {
    labelEndX,
    fieldStartX: fieldStartX || fieldX,
    actualSpacing: actualSpacing || null,
    detected: actualSpacing !== null || labelEndX !== null
  };
}

/**
 * Calculate dynamic padding based on PDF structure analysis
 * @param {Object} field - Field with coordinates and metadata
 * @param {Array} pdfStructure - PDF structure with text items
 * @returns {Object} Calculated padding and spacing
 */
function calculateDynamicSpacing(field, pdfStructure) {
  const { x, y, label, width, page } = field;
  
  // Get page structure
  const pageStructure = pdfStructure[page] || pdfStructure[0];
  if (!pageStructure || !pageStructure.items) {
    // Fallback: use minimal spacing
    return {
      leftPadding: 5,
      rightPadding: 5,
      spacingAfterLabel: 10,
      labelEndX: null
    };
  }
  
  // Find actual spacing from PDF
  const spacingInfo = findActualSpacingFromPdf(
    pageStructure.items,
    x,
    label,
    y
  );
  
  // Calculate padding based on actual spacing
  let leftPadding = 5; // Minimum padding
  let spacingAfterLabel = 10; // Minimum spacing
  let labelEndX = spacingInfo.labelEndX; // Preserve label end position
  
  if (spacingInfo.detected && spacingInfo.actualSpacing) {
    // Use actual spacing from PDF, but ensure minimum
    spacingAfterLabel = Math.max(5, Math.min(spacingInfo.actualSpacing, 30));
    // If we found actual spacing, use smaller padding
    leftPadding = 3;
  } else if (label && label.length > 0) {
    // Better estimation: calculate label width from actual text items
    const labelText = label.replace(/:\s*$/, '').trim().toLowerCase();
    const sameLineItems = pageStructure.items.filter(item => 
      Math.abs(item.y - y) < 5
    ).sort((a, b) => a.x - b.x);
    
    // Try to find actual label position in PDF using improved matching
    const labelWords = labelText.split(/\s+/).filter(w => w.length > 2);
    
    // Try exact match first
    for (const item of sameLineItems) {
      const itemText = item.text.toLowerCase().trim();
      if (itemText.includes(labelText) || labelText.includes(itemText)) {
        labelEndX = item.x + (item.width || 0);
        const gap = x - labelEndX;
        if (gap > 0 && gap < 100) {
          spacingAfterLabel = gap;
        } else {
          spacingAfterLabel = Math.max(8, label.length * 0.5);
        }
        break;
      }
    }
    
    // If not found, try word-based matching (for labels split across items)
    if (labelEndX === null && labelWords.length > 0) {
      let combinedText = '';
      let combinedEndX = 0;
      
      for (let i = 0; i < sameLineItems.length; i++) {
        const item = sameLineItems[i];
        combinedText += (combinedText ? ' ' : '') + item.text.toLowerCase();
        combinedEndX = item.x + (item.width || 0);
        
        const matchedWords = labelWords.filter(word => 
          combinedText.includes(word)
        ).length;
        
        // If we matched at least 60% of label words
        if (matchedWords >= Math.ceil(labelWords.length * 0.6)) {
          labelEndX = combinedEndX;
          const gap = x - labelEndX;
          if (gap > 0 && gap < 100) {
            spacingAfterLabel = gap;
          } else {
            spacingAfterLabel = Math.max(8, label.length * 0.5);
          }
          break;
        }
        
        // Stop if gap too large
        if (i + 1 < sameLineItems.length) {
          const nextItem = sameLineItems[i + 1];
          if (nextItem.x - combinedEndX > 20) break;
        }
      }
    }
    
    // If label not found, estimate based on label length
    if (labelEndX === null) {
      const estimatedLabelWidth = label.length * 6.5; // Rough estimate: 6.5pt per character
      spacingAfterLabel = Math.max(8, Math.min(estimatedLabelWidth * 0.3, 20));
      leftPadding = 5;
    } else {
      leftPadding = 3; // Smaller padding when we have actual label position
    }
  }
  
  // Right padding: use small fixed value or calculate from field width
  const rightPadding = Math.min(5, width ? width * 0.02 : 5);
  
  return {
    leftPadding,
    rightPadding,
    spacingAfterLabel,
    actualSpacing: spacingInfo.actualSpacing,
    labelEndX: labelEndX, // CRITICAL: Include label end position
    fromPdfStructure: spacingInfo.detected || labelEndX !== null
  };
}

/**
 * Analyze field position relative to label using PDF structure
 * @param {Object} field - Field mapping
 * @param {Array} pdfStructure - PDF structure
 * @returns {Object} Enhanced field position info
 */
function analyzeFieldPosition(field, pdfStructure) {
  const { x, y, label, page } = field;
  
  const pageStructure = pdfStructure[page] || pdfStructure[0];
  if (!pageStructure || !pageStructure.items) {
    return {
      needsXAdjustment: false,
      suggestedX: x,
      confidence: 0.5
    };
  }
  
  // Find label position in PDF
  const sameLineItems = pageStructure.items.filter(item => 
    Math.abs(item.y - y) < 5
  ).sort((a, b) => a.x - b.x);
  
  if (label && sameLineItems.length > 0) {
    const labelText = label.replace(/:\s*$/, '').trim().toLowerCase();
    const labelWords = labelText.split(/\s+/).filter(w => w.length > 2);
    let foundLabelEndX = null;
    
    // Try exact match first
    for (const item of sameLineItems) {
      const itemText = item.text.toLowerCase().trim();
      if (itemText.includes(labelText) || labelText.includes(itemText)) {
        foundLabelEndX = item.x + (item.width || 0);
        break;
      }
    }
    
    // If not found, try word-based matching
    if (foundLabelEndX === null && labelWords.length > 0) {
      let combinedText = '';
      let combinedEndX = 0;
      
      for (let i = 0; i < sameLineItems.length; i++) {
        const item = sameLineItems[i];
        combinedText += (combinedText ? ' ' : '') + item.text.toLowerCase();
        combinedEndX = item.x + (item.width || 0);
        
        const matchedWords = labelWords.filter(word => 
          combinedText.includes(word)
        ).length;
        
        if (matchedWords >= Math.ceil(labelWords.length * 0.6)) {
          foundLabelEndX = combinedEndX;
          break;
        }
        
        if (i + 1 < sameLineItems.length) {
          const nextItem = sameLineItems[i + 1];
          if (nextItem.x - combinedEndX > 20) break;
        }
      }
    }
    
    if (foundLabelEndX !== null) {
      // Check if detected X is at label start (too close to label)
      const firstItem = sameLineItems.find(item => 
        item.text.toLowerCase().includes(labelWords[0] || labelText)
      );
      
      if (firstItem && Math.abs(x - firstItem.x) < 20) {
        const gap = x - foundLabelEndX;
        
        // If gap is negative or very small, X is at label start
        if (gap < 15) {
          return {
            needsXAdjustment: true,
            suggestedX: foundLabelEndX + 12, // Add spacing after label
            confidence: 0.9,
            reason: 'X appears to be at label start'
          };
        }
      }
    }
  }
  
  return {
    needsXAdjustment: false,
    suggestedX: x,
    confidence: 0.7
  };
}

module.exports = {
  findActualSpacingFromPdf,
  calculateDynamicSpacing,
  analyzeFieldPosition
};
