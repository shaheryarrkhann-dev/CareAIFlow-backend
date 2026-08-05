const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

/**
 * Hash a folder password for storage. Never store plain text.
 * @param {string} plainPassword - Plain text password
 * @returns {Promise<string>} Bcrypt hash
 */
async function hashFolderPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== "string" || plainPassword.trim() === "") {
    return null;
  }
  return bcrypt.hash(plainPassword.trim(), SALT_ROUNDS);
}

/**
 * Verify a folder password against stored hash.
 * @param {string} plainPassword - Password provided by user
 * @param {string|null} hash - Stored bcrypt hash
 * @returns {Promise<boolean>} True if valid
 */
async function verifyFolderPassword(plainPassword, hash) {
  if (!hash) return true;
  if (!plainPassword || typeof plainPassword !== "string") return false;
  return bcrypt.compare(plainPassword.trim(), hash);
}

module.exports = {
  hashFolderPassword,
  verifyFolderPassword,
};
