const { body } = require("express-validator");
const { FAX_MAX_UPLOAD_BYTES } = require("../utils/pdfFax.util");

/** Allow larger uploads; server compresses before sending to iFax. */
const MAX_PDF_BYTES = FAX_MAX_UPLOAD_BYTES;
const MAX_COVER_MESSAGE = 2000;
const MAX_COVER_SUBJECT = 200;
const MAX_NAME = 100;

const sendReportPdfFaxValidator = [
  body("faxNumber")
    .trim()
    .notEmpty()
    .withMessage("Fax number is required")
    .isLength({ max: 40 })
    .withMessage("Fax number is too long"),
  body("subject")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: MAX_COVER_SUBJECT })
    .withMessage(`Subject must be at most ${MAX_COVER_SUBJECT} characters`),
  body("message")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: MAX_COVER_MESSAGE })
    .withMessage(`Message must be at most ${MAX_COVER_MESSAGE} characters`),
  body("fromName")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: MAX_NAME })
    .withMessage(`Sender name must be at most ${MAX_NAME} characters`),
  body("toName")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: MAX_NAME })
    .withMessage(`Recipient name must be at most ${MAX_NAME} characters`),
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
          `PDF is too large to upload for fax (max about ${Math.round(MAX_PDF_BYTES / (1024 * 1024))}MB)`
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
  body("sourceModule")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Source module must be at most 100 characters"),
];

module.exports = {
  sendReportPdfFaxValidator,
};
