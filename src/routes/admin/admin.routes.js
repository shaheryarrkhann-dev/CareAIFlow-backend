const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");
const { apiLimiter } = require("../../middlewares/rateLimit.middleware");
const assistedActivationController = require("../../controllers/admin/assisted-activation.controller");
const onboardingStatusController = require("../../controllers/admin/onboarding-status.controller");
const leadsController = require("../../controllers/admin/leads.controller");

/**
 * POST /api/admin/assisted-activation
 */
router.post(
  "/assisted-activation",
  apiLimiter,
  authenticate(),
  authorize("SUPER_ADMIN"),
  assistedActivationController.createAssistedActivation,
);

/**
 * GET /api/admin/onboarding-status?email=
 */
router.get(
  "/onboarding-status",
  apiLimiter,
  authenticate(),
  authorize("SUPER_ADMIN"),
  onboardingStatusController.getOnboardingStatus,
);

/**
 * GET /api/admin/leads
 */
router.get(
  "/leads",
  apiLimiter,
  authenticate(),
  authorize("SUPER_ADMIN"),
  leadsController.listLeads,
);

module.exports = router;
