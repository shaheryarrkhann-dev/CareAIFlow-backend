const { body, param, query } = require("express-validator");

/**
 * Create library item validation
 */
const createLibraryItemValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ max: 200 })
    .withMessage("name must not exceed 200 characters"),
  body("type")
    .trim()
    .notEmpty()
    .withMessage("type is required")
    .isIn(["Problem", "Goal", "Intervention"])
    .withMessage("type must be one of: Problem, Goal, Intervention"),
  body("category")
    .optional()
    .trim()
    .isIn(["Medical", "Behavioral", "Functional", "Social", "Other"])
    .withMessage(
      "category must be one of: Medical, Behavioral, Functional, Social, Other"
    ),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("description is required")
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("content")
    .optional()
    .isObject()
    .withMessage("content must be an object"),
  body("tags")
    .optional()
    .isArray()
    .withMessage("tags must be an array"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Update library item validation
 */
const updateLibraryItemValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Library item ID is required")
    .isUUID()
    .withMessage("Library item ID must be a valid UUID"),
  body("name")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("name must not exceed 200 characters"),
  body("type")
    .optional()
    .trim()
    .isIn(["Problem", "Goal", "Intervention"])
    .withMessage("type must be one of: Problem, Goal, Intervention"),
  body("category")
    .optional()
    .trim()
    .isIn(["Medical", "Behavioral", "Functional", "Social", "Other"])
    .withMessage(
      "category must be one of: Medical, Behavioral, Functional, Social, Other"
    ),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("content")
    .optional()
    .isObject()
    .withMessage("content must be an object"),
  body("tags")
    .optional()
    .isArray()
    .withMessage("tags must be an array"),
];

/**
 * Library item ID validation
 */
const libraryItemIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Library item ID is required")
    .isUUID()
    .withMessage("Library item ID must be a valid UUID"),
];

/**
 * Get library items validation
 */
const getLibraryItemsValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("type")
    .optional()
    .trim()
    .isIn(["Problem", "Goal", "Intervention"])
    .withMessage("type must be one of: Problem, Goal, Intervention"),
  query("category")
    .optional()
    .trim()
    .isIn(["Medical", "Behavioral", "Functional", "Social", "Other"])
    .withMessage(
      "category must be one of: Medical, Behavioral, Functional, Social, Other"
    ),
  query("search")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("search must not exceed 200 characters"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Apply library item validation
 */
const applyLibraryItemValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Library item ID is required")
    .isUUID()
    .withMessage("Library item ID must be a valid UUID"),
  body("carePlanId")
    .trim()
    .notEmpty()
    .withMessage("carePlanId is required")
    .isUUID()
    .withMessage("carePlanId must be a valid UUID"),
];

module.exports = {
  createLibraryItemValidator,
  updateLibraryItemValidator,
  libraryItemIdValidator,
  getLibraryItemsValidator,
  applyLibraryItemValidator,
};

