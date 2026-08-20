const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const claimsProviderController = require("../../controllers/claims-billing/claims-provider.controller");
const { updateProviderSettingsValidator } = require("../../validators/claims-billing.validators");

// All routes require authentication; GET requires CLAIMS_BILLING:view, PUT requires manage_provider
router.use(authenticate());
router.use(
  require("../../middlewares/plan-entitlement.middleware").requirePlanModule(
    "advancedCareBilling",
  ),
);

/**
 * GET /api/claims-billing/provider
 * Get provider settings
 */
router.get(
  "/",
  requirePermission("CLAIMS_BILLING", "view"),
  enforceTenantIsolation("tenantId"),
  claimsProviderController.getProviderSettings
);

/**
 * PUT /api/claims-billing/provider
 * Update provider settings. Requires CLAIMS_BILLING:manage_provider
 */
router.put(
  "/",
  requirePermission("CLAIMS_BILLING", "manage_provider"),
  enforceTenantIsolation("tenantId"),
  validate(updateProviderSettingsValidator),
  claimsProviderController.updateProviderSettings
);

module.exports = router;

