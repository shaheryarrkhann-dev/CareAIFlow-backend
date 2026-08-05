const { body, param, query } = require("express-validator");

/**
 * Create claims billing record validation
 */
const createClaimsRecordValidator = [
  body("residentId").trim().notEmpty().withMessage("Resident ID is required"),
  body("billingMonth")
    .notEmpty()
    .withMessage("Billing month is required")
    .isISO8601()
    .withMessage("Billing month must be a valid ISO 8601 date")
    .toDate(),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
  // Optional fields validation
  body("tierId").optional().isUUID().withMessage("tierId must be a valid UUID"),
  body("units")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Units must be a positive integer"),
  body("serviceFromDate")
    .optional()
    .isISO8601()
    .withMessage("Service From Date must be a valid ISO 8601 date"),
  body("serviceToDate")
    .optional()
    .isISO8601()
    .withMessage("Service To Date must be a valid ISO 8601 date"),
  body("billingStatus")
    .optional()
    .isIn(["PENDING", "PAID", "PARTIAL", "OVERDUE"])
    .withMessage("billingStatus must be PENDING, PAID, PARTIAL, or OVERDUE"),
  body("paidAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("paidAmount must be a non-negative number"),
  body("paidAt")
    .optional()
    .isISO8601()
    .withMessage("paidAt must be a valid ISO 8601 date"),
];

/**
 * Update claims billing record validation
 */
const updateClaimsRecordValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Record ID is required")
    .isUUID()
    .withMessage("Record ID must be a valid UUID"),
  body("tierId").optional().isUUID().withMessage("tierId must be a valid UUID"),
  body("units")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Units must be a positive integer"),
  body("serviceFromDate")
    .optional()
    .isISO8601()
    .withMessage("Service From Date must be a valid ISO 8601 date"),
  body("serviceToDate")
    .optional()
    .isISO8601()
    .withMessage("Service To Date must be a valid ISO 8601 date"),
  body("clientDob")
    .optional()
    .isISO8601()
    .withMessage("Client DOB must be a valid ISO 8601 date"),
  body("billingStatus")
    .optional()
    .isIn(["PENDING", "PAID", "PARTIAL", "OVERDUE"])
    .withMessage("billingStatus must be PENDING, PAID, PARTIAL, or OVERDUE"),
  body("paidAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("paidAmount must be a non-negative number"),
  body("paidAt")
    .optional()
    .isISO8601()
    .withMessage("paidAt must be a valid ISO 8601 date"),
];

/**
 * Get claims billing records query validation
 */
const getClaimsRecordsValidator = [
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
    .withMessage("Resident ID cannot be empty"),
  query("billingMonth")
    .optional()
    .isISO8601()
    .withMessage("Billing month must be a valid ISO 8601 date"),
  query("tierId")
    .optional()
    .isUUID()
    .withMessage("tierId must be a valid UUID"),
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters"),
  query("billingStatus")
    .optional()
    .trim()
    .isIn(["PENDING", "PAID", "PARTIAL", "OVERDUE", "UNPAID"])
    .withMessage(
      "billingStatus must be PENDING, PAID, PARTIAL, OVERDUE, or UNPAID"
    ),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Claims billing record ID param validation
 */
const claimsRecordIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Record ID is required")
    .isUUID()
    .withMessage("Record ID must be a valid UUID"),
];

/**
 * Resident ID param validation
 * Note: residentId should be a UUID from the Resident model
 */
const residentIdValidator = [
  param("residentId").trim().notEmpty().withMessage("Resident ID is required"),
];

/**
 * Get claims billing tiers query validation
 */
const getTiersValidator = [
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
    .customSanitizer((value) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    })
    .isBoolean()
    .withMessage("isActive must be a boolean"),
  query("tierNumber")
    .optional()
    .isInt({ min: 1, max: 6 })
    .withMessage("Tier number must be between 1 and 6"),
  query("isILOS")
    .optional()
    .customSanitizer((value) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    })
    .isBoolean()
    .withMessage("isILOS must be a boolean"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Tier ID param validation
 */
const tierIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Tier ID is required")
    .isUUID()
    .withMessage("Tier ID must be a valid UUID"),
];

/**
 * Create tier validation
 */
const createTierValidator = [
  body("tierNumber")
    .notEmpty()
    .withMessage("Tier number is required")
    .isInt({ min: 1, max: 6 })
    .withMessage("Tier number must be between 1 and 6"),
  body("isILOS").optional().isBoolean().withMessage("isILOS must be a boolean"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Tier name is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("Tier name must be between 1 and 100 characters"),
  body("unitCost")
    .notEmpty()
    .withMessage("Unit cost is required")
    .isFloat({ min: 0.01 })
    .withMessage("Unit cost must be greater than 0"),
  body("modifier1")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Modifier 1 must be 10 characters or less"),
  body("modifier2")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Modifier 2 must be 10 characters or less"),
  body("serviceCode")
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage("Service code must be 20 characters or less"),
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
 * Update tier validation
 */
const updateTierValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Tier ID is required")
    .isUUID()
    .withMessage("Tier ID must be a valid UUID"),
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Tier name must be between 1 and 100 characters"),
  body("unitCost")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Unit cost must be greater than 0"),
  body("modifier1")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Modifier 1 must be 10 characters or less"),
  body("modifier2")
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage("Modifier 2 must be 10 characters or less"),
  body("serviceCode")
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage("Service code must be 20 characters or less"),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
];

/**
 * Update provider settings validation
 */
const updateProviderSettingsValidator = [
  body("providerName")
    .trim()
    .notEmpty()
    .withMessage("Provider name is required")
    .isLength({ min: 1, max: 200 })
    .withMessage("Provider name must be between 1 and 200 characters"),
  body("tinSsnEin")
    .trim()
    .notEmpty()
    .withMessage("TIN/SSN/EIN is required")
    .isLength({ min: 1, max: 50 })
    .withMessage("TIN/SSN/EIN must be between 1 and 50 characters"),
  body("billingProviderNpi")
    .trim()
    .notEmpty()
    .withMessage("Billing Provider NPI is required")
    .isLength({ min: 1, max: 50 })
    .withMessage("Billing Provider NPI must be between 1 and 50 characters"),
  body("billingProviderTaxonomy")
    .trim()
    .notEmpty()
    .withMessage("Billing Provider Taxonomy is required")
    .isLength({ min: 1, max: 50 })
    .withMessage(
      "Billing Provider Taxonomy must be between 1 and 50 characters"
    ),
  body("billingProviderStreet")
    .trim()
    .notEmpty()
    .withMessage("Billing Provider Street Address is required")
    .isLength({ min: 1, max: 200 })
    .withMessage(
      "Billing Provider Street Address must be between 1 and 200 characters"
    ),
  body("billingProviderCity")
    .trim()
    .notEmpty()
    .withMessage("Billing Provider City is required")
    .isLength({ min: 1, max: 100 })
    .withMessage("Billing Provider City must be between 1 and 100 characters"),
  body("billingProviderState")
    .trim()
    .notEmpty()
    .withMessage("Billing Provider State is required")
    .isLength({ min: 2, max: 2 })
    .withMessage("Billing Provider State must be 2 characters"),
  body("billingProviderZip")
    .trim()
    .notEmpty()
    .withMessage("Billing Provider Zip Code is required")
    .isLength({ min: 5, max: 10 })
    .withMessage(
      "Billing Provider Zip Code must be between 5 and 10 characters"
    ),
  body("providerId")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Provider ID must be 50 characters or less"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

module.exports = {
  createClaimsRecordValidator,
  updateClaimsRecordValidator,
  getClaimsRecordsValidator,
  claimsRecordIdValidator,
  residentIdValidator,
  getTiersValidator,
  tierIdValidator,
  createTierValidator,
  updateTierValidator,
  updateProviderSettingsValidator,
};
