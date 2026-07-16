const crypto = require('crypto');

/**
 * HIPAA Encryption Utility
 * Encrypts and decrypts sensitive PHI fields at the application level
 * Uses AES-256-GCM for authenticated encryption
 */
class EncryptionUtil {
  constructor() {
    // Get encryption key from environment variable
    // In production, use AWS Secrets Manager or KMS
    const keyString = process.env.ENCRYPTION_KEY || this.generateKey();
    
    if (!process.env.ENCRYPTION_KEY) {
      console.warn('⚠️  WARNING: ENCRYPTION_KEY not set. Using generated key. This is NOT secure for production!');
      console.warn('⚠️  Set ENCRYPTION_KEY in your .env file (32-byte hex string)');
    }

    // Convert hex string to buffer (32 bytes for AES-256)
    this.key = Buffer.from(keyString, 'hex');
    
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
  }

  /**
   * Generate a random encryption key (for development only)
   * @returns {string} Hex-encoded 32-byte key
   */
  generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt sensitive data
   * @param {string} plaintext - Data to encrypt
   * @returns {Object} Encrypted data object with iv, content, and tag
   */
  encrypt(plaintext) {
    if (!plaintext || plaintext === null || plaintext === undefined) {
      return null;
    }

    // Convert to string if needed
    const text = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

    // Generate random IV (Initialization Vector)
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    
    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    // Return encrypted data structure
    return {
      iv: iv.toString('hex'),
      content: encrypted,
      tag: tag.toString('hex'),
      encrypted: true // Flag to identify encrypted data
    };
  }

  /**
   * Decrypt sensitive data
   * @param {Object|string} encryptedData - Encrypted data object or plain text
   * @returns {string} Decrypted plaintext
   */
  decrypt(encryptedData) {
    if (!encryptedData || encryptedData === null || encryptedData === undefined) {
      return null;
    }

    // If it's already plain text (for backward compatibility)
    if (typeof encryptedData === 'string') {
      // Check if it looks like encrypted data (starts with enc:)
      if (encryptedData.startsWith('enc:')) {
        try {
          const parsed = JSON.parse(encryptedData.substring(4));
          return this.decrypt(parsed);
        } catch {
          return encryptedData; // Return as-is if parsing fails
        }
      }
      return encryptedData; // Return plain text
    }

    // If it's an object with encrypted flag
    if (typeof encryptedData === 'object' && encryptedData.encrypted) {
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          this.key,
          Buffer.from(encryptedData.iv, 'hex')
        );
        
        // Set authentication tag
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
        
        // Decrypt
        let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
      } catch (error) {
        console.error('Decryption error:', error.message);
        throw new Error('Failed to decrypt data. Data may be corrupted or key is incorrect.');
      }
    }

    // If it's an object but not encrypted (legacy data)
    return encryptedData;
  }

  /**
   * Check if data is encrypted
   * @param {any} data - Data to check
   * @returns {boolean} True if encrypted
   */
  isEncrypted(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }
    return data.encrypted === true && data.iv && data.content && data.tag;
  }

  /**
   * Encrypt specific fields in an object
   * @param {Object} obj - Object containing sensitive fields
   * @param {string[]} fieldsToEncrypt - Array of field names to encrypt
   * @returns {Object} Object with encrypted fields
   */
  encryptFields(obj, fieldsToEncrypt) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const encrypted = { ...obj };
    
    for (const field of fieldsToEncrypt) {
      if (encrypted[field] !== undefined && encrypted[field] !== null) {
        // Only encrypt if not already encrypted
        if (!this.isEncrypted(encrypted[field])) {
          encrypted[field] = this.encrypt(encrypted[field]);
        }
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt specific fields in an object
   * @param {Object} obj - Object containing encrypted fields
   * @param {string[]} fieldsToDecrypt - Array of field names to decrypt
   * @returns {Object} Object with decrypted fields
   */
  decryptFields(obj, fieldsToDecrypt) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const decrypted = { ...obj };
    
    for (const field of fieldsToDecrypt) {
      if (decrypted[field] !== undefined && decrypted[field] !== null) {
        if (this.isEncrypted(decrypted[field])) {
          decrypted[field] = this.decrypt(decrypted[field]);
        }
      }
    }
    
    return decrypted;
  }
}

// Export singleton instance
module.exports = new EncryptionUtil();






