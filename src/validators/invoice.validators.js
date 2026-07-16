const { body, param, query } = require("express-validator");

/**
 * Generate invoice validation
 */
const generateInvoiceValidator = [
  body("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Resident ID cannot be empty"),
  body("month")
    .notEmpty()
    .withMessage("Month is required")
    .isISO8601()
    .withMessage("Month must be a valid ISO 8601 date")
    .toDate(),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Get invoices query validation
 */
const getInvoicesValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("month")
    .optional()
    .isISO8601()
    .withMessage("Month must be a valid ISO 8601 date"),
  query("status")
    .optional()
    .isIn(["Pending", "Paid", "Overdue"])
    .withMessage("Status must be one of: Pending, Paid, Overdue"),
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Resident ID cannot be empty"),
  query("billingTierId")
    .optional()
    .isUUID()
    .withMessage("billingTierId must be a valid UUID"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Invoice ID param validation
 */
const invoiceIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Invoice ID is required")
    .isUUID()
    .withMessage("Invoice ID must be a valid UUID"),
];

/**
 * Update invoice status validation
 */
const updateInvoiceStatusValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Invoice ID is required")
    .isUUID()
    .withMessage("Invoice ID must be a valid UUID"),
  body("status")
    .trim()
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["Pending", "Paid", "Overdue"])
    .withMessage("Status must be one of: Pending, Paid, Overdue"),
];

module.exports = {
  generateInvoiceValidator,
  getInvoicesValidator,
  invoiceIdValidator,
  updateInvoiceStatusValidator,
};

