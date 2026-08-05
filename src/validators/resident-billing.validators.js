const { body, param } = require("express-validator");

/**
 * Assign tier to resident validation
 */
const assignTierToResidentValidator = [
  param("residentId").trim().notEmpty().withMessage("Resident ID is required"),
  body("billingTierId")
    .trim()
    .notEmpty()
    .withMessage("Billing tier ID is required")
    .isUUID()
    .withMessage("Billing tier ID must be a valid UUID"),
  body("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date")
    .toDate(),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Update resident tier validation
 */
const updateResidentTierValidator = [
  param("residentId").trim().notEmpty().withMessage("Resident ID is required"),
  body("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date")
    .toDate(),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

module.exports = {
  assignTierToResidentValidator,
  updateResidentTierValidator,
};

