const libre = require("libreoffice-convert");
const { promisify } = require("node:util");

const convertAsync = promisify(libre.convert);

/**
 * Convert a DOCX or DOC buffer to PDF using LibreOffice.
 * Requires LibreOffice to be installed on the system (e.g. Windows: default install path).
 *
 * @param {Buffer} docxBuffer - Buffer containing the .docx or .doc file
 * @returns {Promise<Buffer>} PDF file buffer
 * @throws {Error} If LibreOffice is not available or conversion fails
 */
async function convertDocxToPdf(docxBuffer) {
  if (!docxBuffer || !Buffer.isBuffer(docxBuffer)) {
    throw new Error("Invalid input: docxBuffer must be a Buffer");
  }
  const pdfBuffer = await convertAsync(docxBuffer, ".pdf", undefined);
  return pdfBuffer;
}

module.exports = {
  convertDocxToPdf,
};
