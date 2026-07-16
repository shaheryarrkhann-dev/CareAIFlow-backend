const { body } = require("express-validator");
const validator = require("validator");

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_MESSAGE = 10000;
const MAX_SUBJECT = 500;

const sendReportPdfEmailValidator = [
  body("to")
    .trim()
    .notEmpty()
    .withMessage("Recipient is required")
    .custom((value) => {
      const parts = String(value)
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!parts.length) {
        throw new Error("At least one recipient email is required");
      }
      if (parts.length > 10) {
        throw new Error("A maximum of 10 recipients is allowed");
      }
      for (const email of parts) {
        if (!validator.isEmail(email)) {
          throw new Error(`Invalid email address: ${email}`);
        }
      }
      return true;
    }),
  body("subject")
    .trim()
    .notEmpty()
    .withMessage("Subject is required")
    .isLength({ max: MAX_SUBJECT })
    .withMessage(`Subject must be at most ${MAX_SUBJECT} characters`),
  body("message")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: MAX_MESSAGE })
    .withMessage(`Message must be at most ${MAX_MESSAGE} characters`),
  body("pdfBase64")
    .notEmpty()
    .withMessage("PDF data is required")
    .isString()
    .custom((value) => {
      const s = String(value).trim();
      if (!s.length) {
        throw new Error("PDF data is required");
      }
      let buf;
      try {
        buf = Buffer.from(s, "base64");
      } catch {
        throw new Error("PDF must be valid base64");
      }
      if (!buf.length) {
        throw new Error("PDF is empty");
      }
      if (buf.length > MAX_PDF_BYTES) {
        throw new Error(
          `PDF is too large (max ${Math.round(MAX_PDF_BYTES / (1024 * 1024))}MB)`
        );
      }
      if (buf.slice(0, 5).toString() !== "%PDF-") {
        throw new Error("Attachment must be a PDF file");
      }
      return true;
    }),
  body("filename")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Filename must be between 1 and 200 characters"),
];

module.exports = {
  sendReportPdfEmailValidator,
};
