const onboardingService = require("../../services/onboarding/onboarding.service");
const onboardingSessionService = require("../../services/onboarding/onboarding-session.service");
const assistedActivationService = require("../../services/onboarding/assisted-activation.service");
const auditService = require("../../services/compliance/audit.service");
const { getPublicPlanCatalog } = require("../../config/planEntitlements");
const {
  getLaunchConfigPublic,
} = require("../../config/onboardingLaunchConfig");
const {
  sendPlanConfirmedEmail,
} = require("../../utils/email.util");

/**
 * GET /api/onboarding/config
 * Public launch + plan catalog (no auth). FE must not invent prices/limits.
 */
async function getConfig(_req, res, next) {
  try {
    const launch = getLaunchConfigPublic();
    return res.json({
      success: true,
      launch,
      plans: getPublicPlanCatalog(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/onboarding/bootstrap
 */
async function bootstrap(req, res, next) {
  try {
    const result = await onboardingService.bootstrapOrganization(
      req.user.id,
      req.body || {},
    );
    // Keep session in sync after org bootstrap
    try {
      await onboardingSessionService.patchSession(req.user.id, {
        draft: {
          tenantId: result.tenant?.id,
          facilityId: result.facility?.id,
          orgName: result.tenant?.name,
          orgSlug: result.tenant?.slug,
        },
        currentStep: "path",
      });
    } catch (syncErr) {
      console.error("[onboarding.bootstrap] session sync:", syncErr?.message);
    }

    if (!result.alreadyExists) {
      await auditService.createAuditLog({
        action: "ONBOARDING_ORG_BOOTSTRAPPED",
        resource: "onboarding_session",
        resourceId: result.tenant?.id,
        req,
        statusCode: 201,
        metadata: {
          tenantId: result.tenant?.id,
          facilityId: result.facility?.id,
          orgSlug: result.tenant?.slug,
        },
      });
    }

    return res.status(result.alreadyExists ? 200 : 201).json({
      success: true,
      message: result.alreadyExists
        ? "Organization already set up"
        : "Organization created successfully",
      ...result,
    });
  } catch (err) {
    if (err.status) {
      // express error handler reads err.status
    }
    next(err);
  }
}

/**
 * GET /api/onboarding/session
 */
async function getSession(req, res, next) {
  try {
    const result = await onboardingSessionService.getSessionState(req.user.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/onboarding/session
 */
async function patchSession(req, res, next) {
  try {
    const before = await onboardingSessionService.getSessionState(req.user.id);
    const prevDraft = before?.session?.draft || {};
    const result = await onboardingSessionService.patchSession(
      req.user.id,
      req.body || {},
    );
    const nextDraft = result?.session?.draft || {};

    if (!prevDraft.planConfirmed && nextDraft.planConfirmed) {
      await auditService.createAuditLog({
        action: "ONBOARDING_PLAN_CONFIRMED",
        resource: "onboarding_session",
        resourceId: result?.session?.id,
        req,
        metadata: {
          planKey: nextDraft.planKey,
          billingPeriod: nextDraft.billingPeriod,
          origin: result?.session?.origin,
        },
      });
    }

    if (req.body?.skipInvite === true) {
      await auditService.createAuditLog({
        action: "ONBOARDING_INVITE_SKIPPED",
        resource: "onboarding_session",
        resourceId: result?.session?.id,
        req,
      });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/onboarding/session/complete
 */
async function completeSession(req, res, next) {
  try {
    const result = await onboardingSessionService.completeSession(req.user.id);
    await auditService.createAuditLog({
      action: "ONBOARDING_COMPLETED",
      resource: "onboarding_session",
      resourceId: result?.session?.id,
      req,
      metadata: {
        origin: result?.session?.origin,
        planKey: result?.progress?.planKey,
      },
    });
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/onboarding/confirm-assisted
 * Assisted path: activate plan without Stripe Checkout.
 */
async function confirmAssisted(req, res, next) {
  try {
    const result = await assistedActivationService.confirmAssistedPlan(
      req.user.id,
      req.body || {},
    );
    await auditService.createAuditLog({
      action: "ONBOARDING_PLAN_CONFIRMED",
      resource: "onboarding_session",
      resourceId: result?.session?.id,
      req,
      metadata: {
        planKey: result?.subscription?.planKey,
        billingPeriod: result?.subscription?.billingPeriod,
        provisioningMode: "assisted",
      },
    });

    try {
      const user = req.user;
      await sendPlanConfirmedEmail(
        user.email,
        user.name,
        result?.subscription?.planKey,
        result?.subscription?.billingPeriod || "monthly",
        "assisted",
      );
    } catch (emailErr) {
      console.error("[onboarding.confirmAssisted] email:", emailErr?.message);
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getConfig,
  bootstrap,
  getSession,
  patchSession,
  completeSession,
  confirmAssisted,
};
