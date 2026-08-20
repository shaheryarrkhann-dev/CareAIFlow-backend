const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const validate = require("../../middlewares/validate.middleware");
const { apiLimiter } = require("../../middlewares/rateLimit.middleware");
const onboardingController = require("../../controllers/onboarding/onboarding.controller");
const {
  bootstrapOrganizationValidator,
} = require("../../validators/onboarding.validators");

/**
 * GET /api/onboarding/config
 * Public plan catalog + launch flags (self-serve, trial, capacity).
 */
router.get("/config", apiLimiter, onboardingController.getConfig);

/**
 * POST /api/onboarding/bootstrap
 * Create org + first facility and attach current user as ADMIN.
 */
router.post(
  "/bootstrap",
  apiLimiter,
  authenticate(),
  validate(bootstrapOrganizationValidator),
  onboardingController.bootstrap
);

/**
 * GET /api/onboarding/session
 * Resolved resume payload (next step, draft, gates).
 */
router.get(
  "/session",
  apiLimiter,
  authenticate(),
  onboardingController.getSession
);

/**
 * PATCH /api/onboarding/session
 * Merge draft + soft progress (path, invite skip, checklist).
 */
router.patch(
  "/session",
  apiLimiter,
  authenticate(),
  onboardingController.patchSession
);

/**
 * POST /api/onboarding/session/complete
 * Mark onboarding complete after minimum gate.
 */
router.post(
  "/session/complete",
  apiLimiter,
  authenticate(),
  onboardingController.completeSession
);

/**
 * POST /api/onboarding/confirm-assisted
 * Assisted customers confirm plan without Stripe Checkout.
 */
router.post(
  "/confirm-assisted",
  apiLimiter,
  authenticate(),
  onboardingController.confirmAssisted
);

module.exports = router;
