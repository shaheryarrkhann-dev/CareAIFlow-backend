const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const claimsBillingController = require("../../controllers/claims-billing/claims-billing.controller");
const {
  createClaimsRecordValidator,
  updateClaimsRecordValidator,
  getClaimsRecordsValidator,
  claimsRecordIdValidator,
  residentIdValidator,
} = require("../../validators/claims-billing.validators");

// All routes require authentication and CLAIMS_BILLING:view (aligned with frontend Claims Billing)
router.use(authenticate());
router.use(requirePermission("CLAIMS_BILLING", "view"));

/**
 * POST /api/claims-billing
 * Create claims billing record
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(createClaimsRecordValidator),
  claimsBillingController.createClaimsRecord
);

/**
 * GET /api/claims-billing
 * Get claims billing records with filtering
 * Roles: All authenticated users
 * Query params: page, limit, residentId, billingMonth, tierId, search, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(getClaimsRecordsValidator),
  claimsBillingController.getClaimsRecords
);

/**
 * GET /api/claims-billing/prefill/:residentId
 * Get pre-filled billing form data for a resident
 * Roles: All authenticated users
 * Query params: tierId (optional) - If provided, auto-fills tier-related fields
 * Must be defined BEFORE /resident/:residentId and /:id routes to avoid conflicts
 */
router.get(
  "/prefill/:residentId",
  enforceTenantIsolation("tenantId"),
  validate(residentIdValidator),
  claimsBillingController.getPrefilledBillingData
);

/**
 * GET /api/claims-billing/resident/:residentId
 * Get claims billing history for a resident
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/resident/:residentId",
  enforceTenantIsolation("tenantId"),
  validate(residentIdValidator),
  claimsBillingController.getClaimsHistory
);

/**
 * GET /api/claims-billing/:id
 * Get claims billing record by ID
 * Roles: All authenticated users
 */
router.get(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(claimsRecordIdValidator),
  claimsBillingController.getClaimsRecord
);

/**
 * PUT /api/claims-billing/:id
 * Update claims billing record
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 */
router.put(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(updateClaimsRecordValidator),
  claimsBillingController.updateClaimsRecord
);

/**
 * DELETE /api/claims-billing/:id
 * Delete claims billing record
 * Roles: ADMIN, SUPER_ADMIN
 */
router.delete(
  "/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(claimsRecordIdValidator),
  claimsBillingController.deleteClaimsRecord
);

module.exports = router;

