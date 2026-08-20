const prisma = require("../../lib/prisma");
const onboardingSessionService = require("../onboarding/onboarding-session.service");

/**
 * SUPER_ADMIN support surface — onboarding status without PHI / payment secrets.
 */
async function getOnboardingStatusByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) {
    throw Object.assign(new Error("email is required"), { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      isEmailVerified: true,
      tenantId: true,
      createdAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      },
    },
  });

  if (!user) {
    return {
      found: false,
      email: normalized,
      message: "No user found for this email",
    };
  }

  const subscription = await prisma.saasSubscription.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      planKey: true,
      billingPeriod: true,
      status: true,
      stripeSubscriptionId: true,
      stripeCheckoutSessionId: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  let facilityCount = 0;
  let facilities = [];
  if (user.tenantId) {
    facilities = await prisma.facility.findMany({
      where: { tenantId: user.tenantId },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
    facilityCount = facilities.length;
  }

  let sessionState = null;
  try {
    if (user.role !== "SUPER_ADMIN") {
      sessionState = await onboardingSessionService.getSessionState(user.id);
    }
  } catch (err) {
    sessionState = { error: err.message };
  }

  const recentAudits = await prisma.auditLog.findMany({
    where: {
      OR: [
        { userId: user.id },
        ...(user.tenantId ? [{ tenantId: user.tenantId }] : []),
      ],
      action: {
        in: [
          "ONBOARDING_PLAN_CONFIRMED",
          "ONBOARDING_ORG_BOOTSTRAPPED",
          "ONBOARDING_COMPLETED",
          "ONBOARDING_INVITE_SKIPPED",
          "ASSISTED_ACTIVATION_CREATED",
          "FACILITY_PROFILE_CREATED",
          "USER_ACTIVATED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      action: true,
      resource: true,
      statusCode: true,
      createdAt: true,
      metadata: true,
    },
  });

  const provisioningSource =
    subscription && !subscription.stripeSubscriptionId
      ? "assisted_or_admin"
      : subscription?.stripeSubscriptionId
        ? "stripe"
        : null;

  return {
    found: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    },
    organization: user.tenant
      ? {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          status: user.tenant.isActive ? "active" : "inactive",
        }
      : null,
    subscription: subscription
      ? {
          planKey: subscription.planKey,
          billingPeriod: subscription.billingPeriod,
          status: subscription.status,
          provisioningSource,
          hasStripeSubscription: Boolean(subscription.stripeSubscriptionId),
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          updatedAt: subscription.updatedAt,
        }
      : null,
    facilities: {
      count: facilityCount,
      items: facilities.map((f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt,
      })),
    },
    onboarding: sessionState
      ? {
          status: sessionState.session?.status,
          currentStep: sessionState.session?.currentStep,
          origin: sessionState.session?.origin,
          startingPath: sessionState.session?.startingPath,
          nextStep: sessionState.progress?.nextStep,
          nextRoute: sessionState.progress?.nextRoute,
          minimumComplete: sessionState.progress?.minimumComplete,
          gates: sessionState.progress?.gates,
          inviteSkippedAt: sessionState.session?.inviteSkippedAt,
          completedAt: sessionState.session?.completedAt,
          updatedAt: sessionState.session?.updatedAt,
          error: sessionState.error || null,
        }
      : null,
    recentOnboardingAudits: recentAudits,
  };
}

module.exports = {
  getOnboardingStatusByEmail,
};
