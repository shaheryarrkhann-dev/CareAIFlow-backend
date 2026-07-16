const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const billingTierController = require("../../controllers/billing/billing-tier.controller");
const {
  createBillingTierValidator,
  updateBillingTierValidator,
  getBillingTiersValidator,
  billingTierIdValidator,
} = require("../../validators/billing-tier.validators");

// All routes require authentication; billing unified under Claims Billing (CLAIMS_BILLING:view)
router.use(authenticate());
router.use(requirePermission("CLAIMS_BILLING", "view"));

/**
 * POST /api/billing-tiers
 * Create new billing tier
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(createBillingTierValidator),
  billingTierController.createBillingTier
);

/**
 * GET /api/billing-tiers
 * Get billing tiers with filtering
 * Roles: All authenticated users
 * Query params: page, limit, isActive, search, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(getBillingTiersValidator),
  billingTierController.getBillingTiers
);

/**
 * GET /api/billing-tiers/:id
 * Get billing tier by ID
 * Roles: All authenticated users
 */
router.get(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(billingTierIdValidator),
  billingTierController.getBillingTierById
);

/**
 * PUT /api/billing-tiers/:id
 * Update billing tier
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 */
router.put(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(updateBillingTierValidator),
  billingTierController.updateBillingTier
);

/**
 * DELETE /api/billing-tiers/:id
 * Delete billing tier
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 * Note: Cannot delete if assigned to residents or has invoices
 */
router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(billingTierIdValidator),
  billingTierController.deleteBillingTier
);

/**
 * GET /api/billing-tiers/:tierId/residents
 * Get all residents assigned to a billing tier
 * Roles: All authenticated users
 */
router.get(
  "/:tierId/residents",
  enforceTenantIsolation("tenantId"),
  validate(billingTierIdValidator),
  billingTierController.getResidentsByTier
);

/**
 * POST /api/billing-tiers/generate-features
 * Generate billing tier features using AI
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 */
router.post(
  "/generate-features",
  billingTierController.generateFeatures
);

module.exports = router;
