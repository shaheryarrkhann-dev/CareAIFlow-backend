const { body, param, query } = require("express-validator");

/**
 * Create billing tier validation
 */
const createBillingTierValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters"),
  body("monthlyRate")
    .notEmpty()
    .withMessage("Monthly rate is required")
    .isFloat({ min: 0.01, max: 999999.99 })
    .withMessage("Monthly rate must be between 0.01 and 999999.99"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Update billing tier validation
 */
const updateBillingTierValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Billing tier ID is required")
    .isUUID()
    .withMessage("Billing tier ID must be a valid UUID"),
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters"),
  body("monthlyRate")
    .optional()
    .isFloat({ min: 0.01, max: 999999.99 })
    .withMessage("Monthly rate must be between 0.01 and 999999.99"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
];

/**
 * Get billing tiers query validation
 */
const getBillingTiersValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("isActive")
    .optional()
    .isIn(["true", "false"])
    .withMessage("isActive must be 'true' or 'false'"),
  query("search")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Search term must not exceed 100 characters"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Billing tier ID param validation
 */
const billingTierIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Billing tier ID is required")
    .isUUID()
    .withMessage("Billing tier ID must be a valid UUID"),
];

module.exports = {
  createBillingTierValidator,
  updateBillingTierValidator,
  getBillingTiersValidator,
  billingTierIdValidator,
};

