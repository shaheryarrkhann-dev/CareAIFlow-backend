/**
 * PDF Field Type Detector
 * Detects different field types (text, textarea, table columns) from PDF structure
 * This helps ensure correct positioning for different field types
 */

const {
  findActualUnderlineY,
  detectTableColumn
} = require('./pdfUnderlineDetector.service');

/**
 * Detect field type based on PDF structure and context
 * @param {Object} field - Field with coordinates
 * @param {Array} pdfStructure - PDF structure with text items
 * @returns {string} Field type: 'text', 'textarea', 'table-cell', 'signature', 'date'
 */
function detectFieldTypeFromStructure(field, pdfStructure) {
  const { x, y, width, height, label, fieldName } = field;
  
  // Get page structure
  const pageStructure = pdfStructure[field.page] || pdfStructure[0];
  if (!pageStructure) {
    return field.type || 'text';
  }
  
  // Check for table cells (narrow width, specific patterns)
  if (width > 0 && width < 250 && pageStructure.items) {
    // Look for table-like patterns (multiple items at similar Y with varying X)
    const sameLineItems = pageStructure.items.filter(item => 
      Math.abs(item.y - y) < 10
    );
    
    // If multiple items on same line with gaps, likely table
    if (sameLineItems.length > 3) {
      const xPositions = sameLineItems.map(item => item.x).sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < xPositions.length; i++) {
        gaps.push(xPositions[i] - xPositions[i-1]);
      }
      
      // Consistent gaps suggest table structure
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const gapVariance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
      
      if (gapVariance < 100 && avgGap > 50) {
        return 'table-cell';
      }
    }
  }
  
  // Check for textarea (large height or width)
  if (height && height > 30) {
    return 'textarea';
  }
  
  // Check for signature fields
  const name = (fieldName || label || '').toLowerCase();
  if (name.includes('signature') || name.includes('sign')) {
    return 'signature';
  }
  
  // Check for date fields
  if (name.includes('date') || name.includes('dob') || name.includes('birth')) {
    return 'date';
  }
  
  // Default to text
  return 'text';
}

/**
 * Find actual underline position from PDF structure
 * Uses the dedicated underline detector service
 * @param {Object} field - Field with coordinates
 * @param {Array} pdfStructure - PDF structure
 * @returns {Object|null} Underline position info or null
 */
function findUnderlinePosition(field, pdfStructure) {
  // Use the dedicated underline detector
  const underlineInfo = findActualUnderlineY(field, pdfStructure);
  
  if (underlineInfo) {
    return {
      underlineX: underlineInfo.fieldStartX,
      underlineY: underlineInfo.underlineY,
      gap: underlineInfo.gap,
      fromPdfStructure: true,
      confidence: underlineInfo.confidence
    };
  }
  
  return null;
}

/**
 * Get optimal positioning for different field types
 * @param {Object} field - Field with coordinates and type
 * @param {Array} pdfStructure - PDF structure
 * @returns {Object} Optimal positioning info
 */
function getOptimalPositioning(field, pdfStructure) {
  const fieldType = detectFieldTypeFromStructure(field, pdfStructure);
  const underlineInfo = findUnderlinePosition(field, pdfStructure);
  const tableInfo = detectTableColumn(field, pdfStructure);
  
  let x = field.x;
  let y = field.y;
  let padding = 5;
  
  // Use actual underline position if found (MOST ACCURATE)
  if (underlineInfo && underlineInfo.fromPdfStructure) {
    x = underlineInfo.underlineX || field.x;
    y = underlineInfo.underlineY || field.y; // CRITICAL: Use actual underline Y
    padding = 3; // Smaller padding when we have exact position
    // Reduced logging for performance
  }
  
  // Handle table cells
  if (tableInfo && tableInfo.isTableCell) {
    padding = 3; // Minimal padding for table cells
    // Use column start X if available
    if (tableInfo.columnStartX) {
      x = tableInfo.columnStartX;
    }
  }
  
  // Adjust based on field type
  switch (fieldType) {
    case 'table-cell':
      padding = 3; // Minimal padding for table cells
      break;
    case 'textarea':
      padding = 5;
      break;
    case 'signature':
      padding = 5;
      break;
    default:
      padding = underlineInfo ? 3 : 5; // Use smaller padding if we found underline
  }
  
  return {
    x,
    y, // CRITICAL: This is the actual underline Y position from PDF
    padding,
    fieldType,
    fromPdfStructure: underlineInfo !== null,
    underlineY: underlineInfo?.underlineY || y
  };
}

module.exports = {
  detectFieldTypeFromStructure,
  findUnderlinePosition,
  getOptimalPositioning
};
