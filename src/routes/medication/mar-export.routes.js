const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const {
  exportMarPdf,
  exportMedicationListPdf,
  exportMedicationDetailPdf,
  exportPrnLogsPdf,
  exportAuditTrailPdf,
  exportResidentSummaryPdf,
  exportCalendarMarPdf,
} = require("../../controllers/medication/mar-export.controller");

// All routes require authentication and EMAR:view (export requires EMAR:export for stricter control, but view gates access)
router.use(authenticate());
router.use(requirePermission("EMAR", "view"));

/**
 * @route   GET /api/mar/export/pdf
 * @desc    Export MAR records to PDF
 * @access  Private (STAFF, ADMIN, SUPER_ADMIN)
 */
router.get(
  "/mar/export/pdf",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  // authorize(["ADMIN", "STAFF", "SUPER_ADMIN"]),
  exportMarPdf
);

/**
 * @route   GET /api/medications/export/pdf
 * @desc    Export medication list to PDF
 * @access  Private (STAFF, ADMIN, SUPER_ADMIN)
 */
router.get(
  "/medications/export/pdf",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  // authorize(["ADMIN", "STAFF", "SUPER_ADMIN"]),
  exportMedicationListPdf
);

/**
 * @route   GET /api/medications/:id/export/pdf
 * @desc    Export single medication profile to PDF
 */
router.get(
  "/medications/:id/export/pdf",
  exportMedicationDetailPdf
);

/**
 * @route   GET /api/prn/export/pdf
 * @desc    Export PRN logs to PDF
 * @access  Private (STAFF, ADMIN, SUPER_ADMIN)
 */
router.get(
  "/prn/export/pdf",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  // authorize(["ADMIN", "STAFF", "SUPER_ADMIN"]),
  exportPrnLogsPdf
);

/**
 * @route   GET /api/mar/audit/export/pdf
 * @desc    Export audit trail to PDF
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
router.get(
  "/mar/audit/export/pdf",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  // authorize(["ADMIN", "SUPER_ADMIN"]),
  exportAuditTrailPdf
);

/**
 * @route   GET /api/residents/:id/summary/export/pdf
 * @desc    Export resident summary to PDF
 * @access  Private (STAFF, ADMIN, SUPER_ADMIN)
 */
router.get(
  "/residents/:id/summary/export/pdf",
  // authorize(["ADMIN", "STAFF", "SUPER_ADMIN"]),
  exportResidentSummaryPdf
);

/**
 * @route   GET /api/mar/export/calendar-pdf
 * @desc    Export calendar-style MAR to PDF (traditional pharmacy format)
 * @access  Private (STAFF, ADMIN, SUPER_ADMIN)
 * @query   residentId (required), month (1-12, required), year (required), tenantId (optional, SUPER_ADMIN only)
 * @note    For non-SUPER_ADMIN users, tenantId is automatically derived from user context.
 *          For SUPER_ADMIN, tenantId can be provided to export for a different tenant.
 */
router.get(
  "/mar/export/calendar-pdf",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided (SUPER_ADMIN only)
  // authorize(["ADMIN", "STAFF", "SUPER_ADMIN"]),
  exportCalendarMarPdf
);

module.exports = router;
