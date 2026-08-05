const { body, param, query } = require("express-validator");

/**
 * Create note validation
 */
const createNoteValidator = [
  body("residentId").trim().notEmpty().withMessage("residentId is required"),
  body("residentName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("residentName must not exceed 200 characters"),
  body("type")
    .trim()
    .notEmpty()
    .withMessage("type is required")
    .isIn(["Care", "Behavior"])
    .withMessage("type must be one of: Care, Behavior"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("description is required")
    .isLength({ min: 1, max: 10000 })
    .withMessage("description must be between 1 and 10000 characters"),
];

/**
 * Update note validation
 */
const updateNoteValidator = [
  param("id").trim().notEmpty().withMessage("Note ID is required"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("description is required")
    .isLength({ min: 1, max: 10000 })
    .withMessage("description must be between 1 and 10000 characters"),
];

/**
 * Get notes query validation
 */
const getNotesValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("type")
    .optional()
    .trim()
    .isIn(["Care", "Behavior"])
    .withMessage("type must be one of: Care, Behavior"),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Export notes query validation
 */
const exportNotesValidator = [
  query("noteId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("noteId cannot be empty"),
  query("noteIds")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("noteIds cannot be empty")
    .custom((value) => {
      const ids = String(value)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        throw new Error("noteIds must include at least one id");
      }
      return true;
    }),
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("type")
    .optional()
    .trim()
    .isIn(["Care", "Behavior"])
    .withMessage("type must be one of: Care, Behavior"),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Note ID param validation
 */
const noteIdValidator = [
  param("id").trim().notEmpty().withMessage("Note ID is required"),
];

/**
 * Get residents query validation
 */
const getResidentsValidator = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 5000 })
    .withMessage("Limit must be between 1 and 5000"),
  query("offset")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Offset must be a non-negative integer"),
  query("status")
    .optional()
    .trim()
    .isIn(["ACTIVE", "INACTIVE", "Active", "Inactive"])
    .withMessage("status must be ACTIVE or INACTIVE"),
];

/**
 * Resident ID param validation
 * Note: residentId should be a UUID from the Resident model
 */
const residentIdValidator = [
  param("id").trim().notEmpty().withMessage("Resident ID is required"),
];

/**
 * Generate note with AI validation
 */
const generateNoteValidator = [
  body("prompt")
    .trim()
    .notEmpty()
    .withMessage("prompt is required")
    .isLength({ min: 10, max: 5000 })
    .withMessage("prompt must be between 10 and 5000 characters"),
  body("type")
    .trim()
    .notEmpty()
    .withMessage("type is required")
    .isIn(["Care", "Behavior"])
    .withMessage("type must be one of: Care, Behavior"),
];

module.exports = {
  createNoteValidator,
  updateNoteValidator,
  getNotesValidator,
  exportNotesValidator,
  noteIdValidator,
  getResidentsValidator,
  residentIdValidator,
  generateNoteValidator,
};
