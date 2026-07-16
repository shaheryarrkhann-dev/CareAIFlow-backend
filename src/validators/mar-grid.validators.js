const { query } = require("express-validator");

/**
 * Get MAR grid query validation
 */
const getMarGridValidator = [
  query("residentId").trim().notEmpty().withMessage("residentId is required"),
  query("date")
    .notEmpty()
    .withMessage("date is required")
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Get MAR grid range query validation
 */
const getMarGridRangeValidator = [
  query("residentId").trim().notEmpty().withMessage("residentId is required"),
  query("startDate")
    .notEmpty()
    .withMessage("startDate is required")
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date"),
  query("endDate")
    .notEmpty()
    .withMessage("endDate is required")
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Get resident medication dashboard query validation
 */
const getResidentMedicationDashboardValidator = [
  query("residentId")
    .optional()
    .trim()
    .custom((value) => {
      // Allow empty, "all", or a valid resident ID
      if (!value || value === "all" || value.trim().length > 0) {
        return true;
      }
      throw new Error("residentId must be 'all' or a valid resident ID");
    }),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

module.exports = {
  getMarGridValidator,
  getMarGridRangeValidator,
  getResidentMedicationDashboardValidator,
};

