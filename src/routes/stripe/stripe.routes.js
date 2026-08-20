const express = require("express");
const { body, param } = require("express-validator");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const validate = require("../../middlewares/validate.middleware");
const { apiLimiter } = require("../../middlewares/rateLimit.middleware");
const stripeCheckoutController = require("../../controllers/stripe/stripe-checkout.controller");

const checkoutSessionValidator = [
  body("planKey")
    .trim()
    .isIn(["starter", "professional", "multi-home"])
    .withMessage("planKey must be starter, professional, or multi-home"),
  body("billingPeriod")
    .optional()
    .isIn(["monthly", "annual"])
    .withMessage("billingPeriod must be monthly or annual"),
];

const changePlanValidator = [
  body("planKey")
    .trim()
    .isIn(["starter", "professional", "multi-home"])
    .withMessage("planKey must be starter, professional, or multi-home"),
  body("billingPeriod")
    .optional()
    .isIn(["monthly", "annual"])
    .withMessage("billingPeriod must be monthly or annual"),
];

const extraFacilitiesValidator = [
  body("quantity")
    .isInt({ min: 0, max: 50 })
    .withMessage("quantity must be an integer between 0 and 50"),
];

const cancelSubscriptionValidator = [
  body("cancelAtPeriodEnd")
    .optional()
    .isBoolean()
    .withMessage("cancelAtPeriodEnd must be a boolean"),
];

const sessionIdParam = [
  param("sessionId")
    .isString()
    .notEmpty()
    .withMessage("sessionId is required"),
];

/**
 * POST /api/stripe/checkout-session
 */
router.post(
  "/checkout-session",
  apiLimiter,
  authenticate(),
  validate(checkoutSessionValidator),
  stripeCheckoutController.createCheckoutSession
);

/**
 * GET /api/stripe/checkout-session/:sessionId
 * Confirm payment + persist subscription (idempotent with webhook).
 */
router.get(
  "/checkout-session/:sessionId",
  apiLimiter,
  authenticate(),
  validate(sessionIdParam),
  stripeCheckoutController.getCheckoutSession
);

/**
 * GET /api/stripe/subscription/me
 */
router.get(
  "/subscription/me",
  apiLimiter,
  authenticate(),
  stripeCheckoutController.getMySubscription
);

/**
 * POST /api/stripe/subscription/preview-change-plan
 */
router.post(
  "/subscription/preview-change-plan",
  apiLimiter,
  authenticate(),
  validate(changePlanValidator),
  stripeCheckoutController.previewChangePlan
);

/**
 * POST /api/stripe/subscription/change-plan
 */
router.post(
  "/subscription/change-plan",
  apiLimiter,
  authenticate(),
  validate(changePlanValidator),
  stripeCheckoutController.changePlan
);

/**
 * POST /api/stripe/subscription/preview-extra-facilities
 */
router.post(
  "/subscription/preview-extra-facilities",
  apiLimiter,
  authenticate(),
  validate(extraFacilitiesValidator),
  stripeCheckoutController.previewExtraFacilities
);

/**
 * POST /api/stripe/subscription/extra-facilities
 */
router.post(
  "/subscription/extra-facilities",
  apiLimiter,
  authenticate(),
  validate(extraFacilitiesValidator),
  stripeCheckoutController.setExtraFacilities
);

/**
 * POST /api/stripe/subscription/cancel
 */
router.post(
  "/subscription/cancel",
  apiLimiter,
  authenticate(),
  validate(cancelSubscriptionValidator),
  stripeCheckoutController.cancelSubscription
);

/**
 * POST /api/stripe/billing-portal-session
 */
router.post(
  "/billing-portal-session",
  apiLimiter,
  authenticate(),
  stripeCheckoutController.createBillingPortalSession
);

module.exports = router;
