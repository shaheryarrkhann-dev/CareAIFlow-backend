const stripeCheckoutService = require("../../services/stripe/stripe-checkout.service");
const subscriptionManagementService = require("../../services/stripe/subscription-management.service");
const prisma = require("../../lib/prisma");
const { getPlanEntitlement } = require("../../config/planEntitlements");
const {
  isSelfServeCheckoutEnabled,
} = require("../../config/onboardingLaunchConfig");

function rejectSuperAdminSubscription(res) {
  return res.status(403).json({
    success: false,
    code: "SUPER_ADMIN_SUBSCRIPTION_BYPASS",
    message:
      "Super admins are not subject to CareAIFlow subscriptions. Sign in as an organization admin to manage billing.",
  });
}

function isSuperAdmin(req) {
  return req.user?.role === "SUPER_ADMIN";
}

/**
 * POST /api/stripe/checkout-session
 */
async function createCheckoutSession(req, res, next) {
  try {
    if (isSuperAdmin(req)) {
      return rejectSuperAdminSubscription(res);
    }

    if (!isSelfServeCheckoutEnabled()) {
      return res.status(403).json({
        success: false,
        code: "SELF_SERVE_CHECKOUT_DISABLED",
        message:
          "Self-serve checkout is disabled. Contact CareAIFlow for assisted activation.",
      });
    }

    const { planKey, billingPeriod } = req.body || {};
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        isEmailVerified: true,
      },
    });

    if (!dbUser) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await stripeCheckoutService.createCheckoutSession({
      user: dbUser,
      planKey,
      billingPeriod,
    });

    return res.status(201).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/stripe/checkout-session/:sessionId
 */
async function getCheckoutSession(req, res, next) {
  try {
    if (isSuperAdmin(req)) {
      return rejectSuperAdminSubscription(res);
    }

    const { sessionId } = req.params;
    const result = await stripeCheckoutService.confirmCheckoutAndPersist(
      sessionId,
      req.user.id,
    );
    return res.json({
      success: true,
      session: result.session,
      subscription: result.subscription,
      paid: result.paid,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/stripe/subscription/me
 */
async function getMySubscription(req, res, next) {
  try {
    if (isSuperAdmin(req)) {
      const multiHome = getPlanEntitlement("multi-home");
      return res.json({
        success: true,
        subscription: null,
        facilityCount: 0,
        includedFacilities: null,
        extraFacilityQuantity: 0,
        facilityLimit: null,
        maxResidentsPerFacility: null,
        entitlement: multiHome
          ? {
              planKey: "super-admin",
              facilityLimit: null,
              maxResidentsPerFacility: null,
              extraFacilityAllowed: true,
              moduleFlags: {
                ...multiHome.moduleFlags,
                emar: true,
              },
            }
          : null,
        billingAlert: null,
        subscriptionBypassed: true,
      });
    }

    const overview =
      await subscriptionManagementService.getSubscriptionOverview(req.user.id);
    return res.json({
      success: true,
      ...overview,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stripe/subscription/change-plan
 */
async function changePlan(req, res, next) {
  try {
    if (isSuperAdmin(req)) {
      return rejectSuperAdminSubscription(res);
    }

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only organization admins can change the subscription plan",
      });
    }

    const overview = await subscriptionManagementService.changePlan(
      req.user.id,
      {
        planKey: req.body?.planKey,
        billingPeriod: req.body?.billingPeriod,
      },
    );

    return res.json({
      success: true,
      message: "Subscription plan updated",
      ...overview,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stripe/subscription/preview-change-plan
 */
async function previewChangePlan(req, res, next) {
  try {
    if (isSuperAdmin(req)) {
      return rejectSuperAdminSubscription(res);
    }
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only organization admins can change the subscription plan",
      });
    }

    const preview = await subscriptionManagementService.previewPlanChange(
      req.user.id,
      {
        planKey: req.body?.planKey,
        billingPeriod: req.body?.billingPeriod,
      },
    );
    return res.json(preview);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stripe/subscription/extra-facilities
 */
async function setExtraFacilities(req, res, next) {
  try {
    if (isSuperAdmin(req)) {
      return rejectSuperAdminSubscription(res);
    }

    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only organization admins can manage extra facilities",
      });
    }

    const overview = await subscriptionManagementService.setExtraFacilities(
      req.user.id,
      { quantity: req.body?.quantity },
    );

    return res.json({
      success: true,
      message: "Extra facilities updated",
      ...overview,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stripe/subscription/preview-extra-facilities
 */
async function previewExtraFacilities(req, res, next) {
  try {
    if (isSuperAdmin(req)) {
      return rejectSuperAdminSubscription(res);
    }
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only organization admins can manage extra facilities",
      });
    }

    const preview = await subscriptionManagementService.previewExtraFacilities(
      req.user.id,
      { quantity: req.body?.quantity },
    );
    return res.json(preview);
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res) {
  if (isSuperAdmin(req)) {
    rejectSuperAdminSubscription(res);
    return false;
  }
  if (req.user.role !== "ADMIN") {
    res.status(403).json({
      success: false,
      message: "Only organization admins can manage billing",
    });
    return false;
  }
  return true;
}

/**
 * POST /api/stripe/subscription/cancel
 * Body: { cancelAtPeriodEnd?: boolean } default true
 */
async function cancelSubscription(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const cancelAtPeriodEnd =
      req.body?.cancelAtPeriodEnd === undefined
        ? true
        : Boolean(req.body.cancelAtPeriodEnd);

    const overview = await subscriptionManagementService.setCancelAtPeriodEnd(
      req.user.id,
      cancelAtPeriodEnd,
    );

    return res.json({
      success: true,
      message: cancelAtPeriodEnd
        ? "Subscription will cancel at the end of the billing period"
        : "Subscription cancellation withdrawn — billing will continue",
      ...overview,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/stripe/billing-portal-session
 */
async function createBillingPortalSession(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const result =
      await subscriptionManagementService.createBillingPortalSession(
        req.user.id,
      );

    return res.json({
      success: true,
      url: result.url,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCheckoutSession,
  getCheckoutSession,
  getMySubscription,
  changePlan,
  previewChangePlan,
  setExtraFacilities,
  previewExtraFacilities,
  cancelSubscription,
  createBillingPortalSession,
};
