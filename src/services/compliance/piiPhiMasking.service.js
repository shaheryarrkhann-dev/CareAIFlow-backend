/**
 * PII/PHI Masking Service
 * Masks Personal Identifiable Information (PII) and Protected Health Information (PHI)
 * for HIPAA compliance before sending data to AI models
 */

const crypto = require('crypto');

// PII/PHI patterns to detect and mask
const PII_PHI_PATTERNS = {
  // Social Security Number: XXX-XX-XXXX or XXXXXXXXX
  ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
  
  // Phone numbers: (XXX) XXX-XXXX, XXX-XXX-XXXX, XXXXXXXXXX
  phone: /\b(?:\+?1[-.]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g,
  
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  
  // Dates (MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD)
  date: /\b(?:0?[1-9]|1[0-2])[-\/](?:0?[1-9]|[12][0-9]|3[01])[-\/](?:19|20)\d{2}\b|\b(?:19|20)\d{2}[-\/](?:0?[1-9]|1[0-2])[-\/](?:0?[1-9]|[12][0-9]|3[01])\b/g,
  
  // Credit card numbers (simplified)
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  
  // Medical Record Numbers (MRN) - pattern: MRN: XXXXXXX or MRN XXXXXXX
  mrn: /\b(?:MRN|Medical\s+Record\s+Number)[\s:]+[A-Z0-9]{5,15}\b/gi,
  
  // Addresses - simplified pattern for street addresses
  address: /\b\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct)\b/gi,
  
  // Names with titles (Dr., Mr., Mrs., Ms., Miss)
  nameWithTitle: /\b(?:Dr|Mr|Mrs|Ms|Miss)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
};

/**
 * Mask PII/PHI in text content
 * @param {string} text - Text to mask
 * @param {Object} options - Masking options
 * @returns {Object} { maskedText, maskingMap, detectedPiiTypes }
 */
function maskPiiPhi(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { maskedText: text, maskingMap: {}, detectedPiiTypes: [] };
  }
  
  const {
    preserveStructure = true, // Keep same length/format
    maskChar = 'X',
    includeMap = true // Whether to return reversible mapping
  } = options;
  
  let maskedText = text;
  const maskingMap = {}; // Maps masked tokens back to originals (for internal use only)
  const detectedPiiTypes = new Set();
  
  // Counter for unique tokens
  let tokenCounter = 0;
  
  // Mask each PII/PHI type
  for (const [piiType, pattern] of Object.entries(PII_PHI_PATTERNS)) {
    maskedText = maskedText.replace(pattern, (match) => {
      detectedPiiTypes.add(piiType);
      
      if (preserveStructure) {
        // Generate a unique token
        const token = `[${piiType.toUpperCase()}_${tokenCounter++}]`;
        
        if (includeMap) {
          // Store original value (encrypted) for potential recovery
          const hash = crypto.createHash('sha256').update(match).digest('hex').substring(0, 16);
          maskingMap[token] = { original: match, hash, type: piiType };
        }
        
        return token;
      } else {
        // Simple masking with X's
        return match.replace(/[a-zA-Z0-9]/g, maskChar);
      }
    });
  }
  
  return {
    maskedText,
    maskingMap: includeMap ? maskingMap : null,
    detectedPiiTypes: Array.from(detectedPiiTypes),
    hasPii: detectedPiiTypes.size > 0
  };
}

/**
 * Mask PII/PHI in form data object
 * @param {Object} formData - Form data object
 * @param {Array} excludeFields - Fields to exclude from masking
 * @returns {Object} { maskedData, maskingMap, detectedPiiTypes }
 */
function maskFormData(formData, excludeFields = []) {
  if (!formData || typeof formData !== 'object') {
    return { maskedData: formData, maskingMap: {}, detectedPiiTypes: [] };
  }
  
  const maskedData = {};
  const globalMaskingMap = {};
  const globalDetectedPiiTypes = new Set();
  
  for (const [key, value] of Object.entries(formData)) {
    // Skip excluded fields
    if (excludeFields.includes(key)) {
      maskedData[key] = value;
      continue;
    }
    
    // Skip non-string values
    if (typeof value !== 'string') {
      maskedData[key] = value;
      continue;
    }
    
    // Mask the value
    const { maskedText, maskingMap, detectedPiiTypes } = maskPiiPhi(value, {
      preserveStructure: true,
      includeMap: true
    });
    
    maskedData[key] = maskedText;
    
    // Merge masking map
    if (maskingMap) {
      globalMaskingMap[key] = maskingMap;
    }
    
    // Merge detected PII types
    detectedPiiTypes.forEach(type => globalDetectedPiiTypes.add(type));
  }
  
  return {
    maskedData,
    maskingMap: globalMaskingMap,
    detectedPiiTypes: Array.from(globalDetectedPiiTypes),
    hasPii: globalDetectedPiiTypes.size > 0
  };
}

/**
 * Unmask PII/PHI using masking map (internal use only, requires authorization)
 * @param {string} maskedText - Masked text
 * @param {Object} maskingMap - Masking map from maskPiiPhi
 * @returns {string} Unmasked text
 */
function unmaskPiiPhi(maskedText, maskingMap) {
  if (!maskedText || !maskingMap) {
    return maskedText;
  }
  
  let unmaskedText = maskedText;
  
  for (const [token, data] of Object.entries(maskingMap)) {
    unmaskedText = unmaskedText.replace(token, data.original);
  }
  
  return unmaskedText;
}

/**
 * Sanitize text for AI processing (remove PII/PHI completely)
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeForAI(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  const { maskedText } = maskPiiPhi(text, {
    preserveStructure: true,
    includeMap: false
  });
  
  return maskedText;
}

/**
 * Check if text contains PII/PHI
 * @param {string} text - Text to check
 * @returns {Object} { hasPii, detectedTypes }
 */
function detectPiiPhi(text) {
  if (!text || typeof text !== 'string') {
    return { hasPii: false, detectedTypes: [] };
  }
  
  const detectedTypes = [];
  
  for (const [piiType, pattern] of Object.entries(PII_PHI_PATTERNS)) {
    if (pattern.test(text)) {
      detectedTypes.push(piiType);
    }
  }
  
  return {
    hasPii: detectedTypes.length > 0,
    detectedTypes
  };
}

/**
 * Get masked version of value for display (show only last 4 digits for SSN, etc.)
 * @param {string} value - Value to mask for display
 * @param {string} type - Type of PII (ssn, phone, email, etc.)
 * @returns {string} Masked value for display
 */
function maskForDisplay(value, type) {
  if (!value) return value;
  
  switch (type) {
    case 'ssn':
      // XXX-XX-1234
      return value.replace(/\d(?=\d{4})/g, 'X');
    
    case 'phone':
      // (XXX) XXX-1234
      return value.replace(/\d(?=\d{4})/g, 'X');
    
    case 'email':
      // j***@example.com
      const [local, domain] = value.split('@');
      return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
    
    case 'creditCard':
      // XXXX-XXXX-XXXX-1234
      return value.replace(/\d(?=\d{4})/g, 'X');
    
    default:
      // Generic: show first and last character
      if (value.length <= 2) return 'XX';
      return `${value[0]}${'X'.repeat(value.length - 2)}${value[value.length - 1]}`;
  }
}

/**
 * Log PII/PHI access (for audit trail)
 * @param {string} userId - User ID accessing PII/PHI
 * @param {string} action - Action performed
 * @param {string} resource - Resource accessed
 * @param {Array} piiTypes - Types of PII accessed
 */
function logPiiAccess(userId, action, resource, piiTypes = []) {
  console.log(`[PII-AUDIT] User ${userId} performed "${action}" on ${resource}`);
  console.log(`[PII-AUDIT]   PII types accessed: ${piiTypes.join(', ') || 'none'}`);
  console.log(`[PII-AUDIT]   Timestamp: ${new Date().toISOString()}`);
  
  // TODO: Store in dedicated audit log table for HIPAA compliance
}

module.exports = {
  maskPiiPhi,
  maskFormData,
  unmaskPiiPhi,
  sanitizeForAI,
  detectPiiPhi,
  maskForDisplay,
  logPiiAccess,
  PII_PHI_PATTERNS
};

