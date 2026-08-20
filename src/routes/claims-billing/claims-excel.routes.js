const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const claimsExcelController = require("../../controllers/claims-billing/claims-excel.controller");
const { residentIdValidator } = require("../../validators/claims-billing.validators");

// All routes require authentication and CLAIMS_BILLING:view
router.use(authenticate());
router.use(requirePermission("CLAIMS_BILLING", "view"));
router.use(
  require("../../middlewares/plan-entitlement.middleware").requirePlanModule(
    "advancedCareBilling",
  ),
);

/**
 * GET /api/claims-billing/excel/resident/:residentId
 * Download resident Excel sheet (direct download)
 * Roles: All authenticated users
 */
router.get(
  "/resident/:residentId",
  enforceTenantIsolation("tenantId"),
  validate(residentIdValidator),
  claimsExcelController.downloadResidentSheet
);

/**
 * GET /api/claims-billing/excel/resident/:residentId/signed-url
 * Get signed URL for Excel download (for secure access)
 * Roles: All authenticated users
 * Query params: expiresIn (optional, default: 3600 seconds)
 */
router.get(
  "/resident/:residentId/signed-url",
  enforceTenantIsolation("tenantId"),
  validate(residentIdValidator),
  claimsExcelController.getSignedDownloadUrl
);

/**
 * POST /api/claims-billing/excel/regenerate/:residentId
 * Regenerate resident Excel sheet
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 */
router.post(
  "/regenerate/:residentId",
  enforceTenantIsolation("tenantId"),
  validate(residentIdValidator),
  claimsExcelController.regenerateResidentSheet
);

module.exports = router;

