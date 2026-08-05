const { body, param, query } = require("express-validator");

/**
 * NCP extraction ID validation
 */
const extractionIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Extraction ID is required")
    .isUUID()
    .withMessage("Extraction ID must be a valid UUID"),
];

/**
 * List extractions query validation
 */
const listExtractionsValidator = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("offset")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Offset must be a non-negative integer"),
  query("status")
    .optional()
    .isIn(["PENDING", "EXTRACTING", "EXTRACTED", "REVIEWED", "POPULATED", "FAILED"])
    .withMessage("Status must be one of: PENDING, EXTRACTING, EXTRACTED, REVIEWED, POPULATED, FAILED"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("Tenant ID must be a valid UUID"),
  query("residentId")
    .optional()
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),
  query("includeArchived")
    .optional()
    .isIn(["true", "false"])
    .withMessage("includeArchived must be true or false"),
];

/**
 * Update extraction data validation
 */
const updateExtractionValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Extraction ID is required")
    .isUUID()
    .withMessage("Extraction ID must be a valid UUID"),
  body("extractedData")
    .notEmpty()
    .withMessage("extractedData is required")
    .isObject()
    .withMessage("extractedData must be an object"),
  body("requiresCbhs")
    .optional()
    .isBoolean()
    .withMessage("requiresCbhs must be a boolean"),
  body("cbhsNotes")
    .optional()
    .isString()
    .withMessage("cbhsNotes must be a string")
    .isLength({ max: 2000 })
    .withMessage("cbhsNotes must be 2000 characters or fewer"),
];

module.exports = {
  extractionIdValidator,
  listExtractionsValidator,
  updateExtractionValidator,
};
