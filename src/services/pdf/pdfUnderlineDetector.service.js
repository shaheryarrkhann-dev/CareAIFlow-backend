/**
 * PDF Underline Detector
 * Detects actual underline positions from PDF structure
 * This is critical for accurate text positioning
 */

/**
 * Find actual underline Y position from PDF structure
 * Looks for underlines, dashes, or gaps that indicate fillable areas
 * @param {Object} field - Field with label and approximate coordinates
 * @param {Array} pdfStructure - PDF structure with text items
 * @returns {Object|null} Underline position info
 */
function findActualUnderlineY(field, pdfStructure) {
  const { x, y, label, page } = field;
  
  const pageStructure = pdfStructure[page] || pdfStructure[0];
  if (!pageStructure || !pageStructure.items) {
    return null;
  }
  
  // Find text items near the field Y position (within 10pt)
  const nearbyItems = pageStructure.items.filter(item => 
    Math.abs(item.y - y) < 10
  ).sort((a, b) => a.x - b.x);
  
  if (nearbyItems.length === 0) {
    return null;
  }
  
  // Look for underline patterns (dashes, underscores, or gaps after labels)
  let underlineY = null;
  let labelEndX = null;
  
  // Try to find the label first
  if (label) {
    const labelText = label.replace(/:\s*$/, '').trim().toLowerCase();
    for (const item of nearbyItems) {
      if (item.text.toLowerCase().includes(labelText)) {
        labelEndX = item.x + (item.width || 0);
        break;
      }
    }
  }
  
  // Look for underline patterns or gaps after label
  for (const item of nearbyItems) {
    const itemText = (item.text || '').trim();
    
    // Check if it's an underline pattern (dashes, underscores, dots)
    const isUnderline = /^[_\-\s\.]+$/.test(itemText) || itemText.length === 0;
    
    // Check if it's after the label (if we found label)
    const isAfterLabel = !labelEndX || item.x > labelEndX;
    
    if (isUnderline && isAfterLabel) {
      // Found underline - use its Y position
      underlineY = item.y;
      
      // Also check if there's a gap (empty space) that indicates field start
      const prevItem = nearbyItems.find(i => i.x < item.x && Math.abs(i.y - item.y) < 5);
      if (prevItem) {
        const gap = item.x - (prevItem.x + (prevItem.width || 0));
        if (gap > 5) {
          return {
            underlineY: underlineY,
            fieldStartX: item.x,
            labelEndX: labelEndX,
            gap: gap,
            fromPdfStructure: true,
            confidence: 0.9
          };
        }
      }
      
      return {
        underlineY: underlineY,
        fieldStartX: item.x,
        labelEndX: labelEndX,
        fromPdfStructure: true,
        confidence: 0.8
      };
    }
  }
  
  // If no underline found, look for gaps after labels (indicates field area)
  if (labelEndX) {
    for (const item of nearbyItems) {
      if (item.x > labelEndX + 5) {
        const gap = item.x - labelEndX;
        if (gap > 5 && gap < 50) {
          // Found gap - likely field start
          return {
            underlineY: item.y, // Use Y of next item as underline position
            fieldStartX: item.x,
            labelEndX: labelEndX,
            gap: gap,
            fromPdfStructure: true,
            confidence: 0.7
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Detect table column boundaries from PDF structure
 * @param {Object} field - Field that might be in a table
 * @param {Array} pdfStructure - PDF structure
 * @returns {Object|null} Table column info
 */
function detectTableColumn(field, pdfStructure) {
  const { x, y, page } = field;
  
  const pageStructure = pdfStructure[page] || pdfStructure[0];
  if (!pageStructure || !pageStructure.items) {
    return null;
  }
  
  // Find all items on the same line (within 5pt Y difference)
  const sameLineItems = pageStructure.items.filter(item => 
    Math.abs(item.y - y) < 5
  ).sort((a, b) => a.x - b.x);
  
  if (sameLineItems.length < 3) {
    return null; // Not enough items for a table
  }
  
  // Check if items form columns (consistent X spacing)
  const xPositions = sameLineItems.map(item => item.x);
  const gaps = [];
  for (let i = 1; i < xPositions.length; i++) {
    gaps.push(xPositions[i] - xPositions[i-1]);
  }
  
  // Calculate average gap and variance
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
  
  // If gaps are relatively consistent, it's likely a table
  if (variance < 100 && avgGap > 50 && avgGap < 300) {
    // Find which column this field is in
    let columnIndex = 0;
    for (let i = 0; i < xPositions.length; i++) {
      if (x >= xPositions[i] - 10 && x < xPositions[i] + 100) {
        columnIndex = i;
        break;
      }
    }
    
    return {
      isTableCell: true,
      columnIndex: columnIndex,
      columnStartX: xPositions[columnIndex],
      columnWidth: avgGap * 0.8, // Approximate column width
      avgGap: avgGap
    };
  }
  
  return null;
}

module.exports = {
  findActualUnderlineY,
  detectTableColumn
};
