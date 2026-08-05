const { body, query } = require("express-validator");

const LAYOUT_OPTIONS = ["default", "compact", "reception"];

/**
 * facilityId in query (required for QR config operations)
 */
const facilityIdQueryValidator = [
  query("facilityId")
    .notEmpty()
    .withMessage("facilityId is required")
    .isUUID()
    .withMessage("Invalid facility ID"),
];

/**
 * Update QR template customization
 */
const updateCustomizationValidator = [
  body("facilityId")
    .notEmpty()
    .withMessage("facilityId is required")
    .isUUID()
    .withMessage("Invalid facility ID"),
  body("instructionText")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Instruction text must not exceed 500 characters"),
  body("disclaimerText")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Disclaimer text must not exceed 1000 characters"),
  body("layoutOption")
    .optional()
    .trim()
    .isIn(LAYOUT_OPTIONS)
    .withMessage(`layoutOption must be one of: ${LAYOUT_OPTIONS.join(", ")}`),
  body("facilityDisplayName")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Facility display name must not exceed 255 characters"),
  body("logoUrl")
    .optional()
    .trim()
    .isLength({ max: 2048 })
    .withMessage("Logo URL must not exceed 2048 characters"),
  body("logoS3Key")
    .optional()
    .trim()
    .isLength({ max: 1024 })
    .withMessage("Logo S3 key must not exceed 1024 characters"),
];

const logoUploadValidator = [
  body("facilityId")
    .notEmpty()
    .withMessage("facilityId is required")
    .isUUID()
    .withMessage("Invalid facility ID"),
];

module.exports = {
  facilityIdQueryValidator,
  updateCustomizationValidator,
  logoUploadValidator,
  LAYOUT_OPTIONS,
};
