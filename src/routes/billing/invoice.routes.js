const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const invoiceController = require("../../controllers/billing/invoice.controller");
const {
  generateInvoiceValidator,
  getInvoicesValidator,
  invoiceIdValidator,
  updateInvoiceStatusValidator,
} = require("../../validators/invoice.validators");

// All routes require authentication; billing unified under Claims Billing (CLAIMS_BILLING:view)
router.use(authenticate());
router.use(requirePermission("CLAIMS_BILLING", "view"));

/**
 * POST /api/invoices/generate
 * Generate invoice for a single resident
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.post(
  "/generate",
  enforceTenantIsolation("tenantId"),
  validate(generateInvoiceValidator),
  invoiceController.generateInvoice
);

/**
 * POST /api/invoices/generate-month
 * Generate invoices for all active residents for a month
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.post(
  "/generate-month",
  enforceTenantIsolation("tenantId"),
  validate(generateInvoiceValidator),
  invoiceController.generateInvoicesForMonth
);

/**
 * GET /api/invoices
 * Get invoices with filtering
 * Roles: All authenticated users
 * Query params: page, limit, month, status, residentId, billingTierId, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(getInvoicesValidator),
  invoiceController.getInvoices
);

/**
 * GET /api/invoices/:id
 * Get invoice by ID
 * Roles: All authenticated users
 */
router.get(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(invoiceIdValidator),
  invoiceController.getInvoiceById
);

/**
 * PATCH /api/invoices/:id/status
 * Update invoice status
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 */
router.patch(
  "/:id/status",
  validate(updateInvoiceStatusValidator),
  invoiceController.updateInvoiceStatus
);

module.exports = router;
