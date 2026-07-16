const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const claimsTierController = require("../../controllers/claims-billing/claims-tier.controller");
const {
  getTiersValidator,
  tierIdValidator,
  createTierValidator,
  updateTierValidator,
} = require("../../validators/claims-billing.validators");

// All routes require authentication and CLAIMS_BILLING:view
router.use(authenticate());
router.use(requirePermission("CLAIMS_BILLING", "view"));

/**
 * GET /api/claims-billing/tiers
 * Get claims billing tiers
 * Roles: All authenticated users
 * Query params: page, limit, isActive, tierNumber, tenantId (SUPER_ADMIN only)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(getTiersValidator),
  claimsTierController.getTiers
);

/**
 * GET /api/claims-billing/tiers/:id/fields
 * Get tier fields for auto-fill
 * Roles: All authenticated users
 * Must be defined BEFORE /:id route to avoid route conflicts
 */
router.get(
  "/:id/fields",
  enforceTenantIsolation("tenantId"),
  validate(tierIdValidator),
  claimsTierController.getTierFields
);

/**
 * GET /api/claims-billing/tiers/:id
 * Get claims billing tier by ID
 * Roles: All authenticated users
 */
router.get(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(tierIdValidator),
  claimsTierController.getTierById
);

/**
 * POST /api/claims-billing/tiers
 * Create claims billing tier
 * Roles: ADMIN, SUPER_ADMIN
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(createTierValidator),
  claimsTierController.createTier
);

/**
 * PUT /api/claims-billing/tiers/:id
 * Update claims billing tier
 * Roles: ADMIN, SUPER_ADMIN
 */
router.put(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(updateTierValidator),
  claimsTierController.updateTier
);

/**
 * DELETE /api/claims-billing/tiers/:id
 * Delete claims billing tier
 * Roles: ADMIN, SUPER_ADMIN
 */
router.delete(
  "/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(tierIdValidator),
  claimsTierController.deleteTier
);

module.exports = router;

