const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const prisma = require("../../lib/prisma");
const saasSubscriptionService = require("../stripe/saas-subscription.service");
const onboardingSessionService = require("../onboarding/onboarding-session.service");
const {
  signResetPasswordToken,
  verifyResetPasswordToken,
} = require("../../utils/jwt.util");
const { sendAssistedActivationEmail } = require("../../utils/email.util");
const { storeAuthToken } = require("../../utils/token-hash.util");

const PLAN_KEYS = new Set(["starter", "professional", "multi-home"]);
const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

function frontendBaseUrl() {
  return String(process.env.FRONTEND_URL || "http://localhost:5173").replace(
    /\/$/,
    "",
  );
}

async function sendSetPasswordEmail(user) {
  const resetToken = signResetPasswordToken({
    sub: user.id,
    email: user.email,
    type: "password-reset",
  });
  const decoded = verifyResetPasswordToken(resetToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await storeAuthToken(prisma, {
    rawToken: resetToken,
    userId: user.id,
    expiresAt,
  });

  await sendAssistedActivationEmail(user.email, user.name, resetToken);
  return `${frontendBaseUrl()}/reset-password?token=${encodeURIComponent(resetToken)}&assisted=1`;
}

/**
 * SUPER_ADMIN: provision an assisted customer (active plan, no Stripe) and
 * prepare onboarding so they continue at org/facility after set-password + login.
 */
async function createAssistedActivation(
  {
    email,
    name,
    phone,
    planKey,
    billingPeriod = "monthly",
  },
  actor,
) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const trimmedName = String(name || "").trim();
  const normalizedPlan = String(planKey || "")
    .toLowerCase()
    .replace(/_/g, "-");
  const period =
    billingPeriod === "annual" || billingPeriod === "monthly"
      ? billingPeriod
      : "monthly";

  if (!normalizedEmail || !trimmedName) {
    throw Object.assign(new Error("Name and email are required"), {
      status: 400,
    });
  }
  if (!PLAN_KEYS.has(normalizedPlan)) {
    throw Object.assign(
      new Error("planKey must be starter, professional, or multi-home"),
      { status: 400 },
    );
  }

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  let createdUser = false;
  let setPasswordUrl = null;

  if (user) {
    if (user.role === "SUPER_ADMIN") {
      throw Object.assign(
        new Error("Cannot provision assisted activation for a SUPER_ADMIN"),
        { status: 400 },
      );
    }
    if (!user.isActive) {
      throw Object.assign(new Error("User account is inactive"), {
        status: 400,
      });
    }

    const latest = await saasSubscriptionService.getLatestForUser(user.id);
    if (
      latest &&
      ACTIVE_SUB_STATUSES.has(latest.status) &&
      latest.stripeSubscriptionId
    ) {
      throw Object.assign(
        new Error(
          "This user already has an active Stripe subscription. Adjust billing in Stripe or Subscription settings.",
        ),
        { status: 409 },
      );
    }
  } else {
    const temporaryPassword = nanoid(16);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: trimmedName,
        phone: phone?.trim() || null,
        role: "ADMIN",
        tenantId: null,
        isActive: true,
        // Admin confirmed this email during assisted provision
        isEmailVerified: true,
      },
    });
    createdUser = true;
    setPasswordUrl = await sendSetPasswordEmail(user);
  }

  const subscription = await saasSubscriptionService.createAssistedSubscription({
    userId: user.id,
    planKey: normalizedPlan,
    billingPeriod: period,
    tenantId: user.tenantId || null,
  });

  await onboardingSessionService.ensureSession(user.id, {
    origin: "assisted",
  });

  await prisma.onboardingSession.update({
    where: { userId: user.id },
    data: {
      origin: "assisted",
      status: "in_progress",
      draftJson: {
        origin: "assisted",
        planKey: normalizedPlan,
        billingPeriod: period,
        planConfirmed: true,
        provisioningMode: "assisted",
        email: user.email,
        firstName: trimmedName.split(/\s+/)[0] || trimmedName,
        lastName: trimmedName.split(/\s+/).slice(1).join(" ") || undefined,
        phone: phone?.trim() || undefined,
      },
    },
  });

  const activationUrl = setPasswordUrl || `${frontendBaseUrl()}/login`;

  return {
    success: true,
    message: createdUser
      ? "Assisted activation created. Customer should set their password from the email link, then sign in to finish facility setup."
      : "Assisted plan activated. Customer can sign in to continue onboarding.",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isEmailVerified: user.isEmailVerified,
    },
    subscription: {
      id: subscription.id,
      planKey: subscription.planKey,
      billingPeriod: subscription.billingPeriod,
      status: subscription.status,
    },
    createdUser,
    activationUrl,
    setPasswordEmailSent: Boolean(setPasswordUrl),
    provisionedBy: actor?.email || null,
  };
}

/**
 * Authenticated owner with origin=assisted confirms plan without Stripe.
 */
async function confirmAssistedPlan(userId, { planKey, billingPeriod }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw Object.assign(new Error("Authentication required"), { status: 401 });
  }
  if (user.role === "SUPER_ADMIN") {
    throw Object.assign(
      new Error("SUPER_ADMIN does not use assisted customer activation"),
      { status: 400 },
    );
  }
  if (!user.isEmailVerified) {
    throw Object.assign(new Error("Verify your email before confirming a plan"), {
      status: 403,
    });
  }

  const session = await onboardingSessionService.ensureSession(userId, {
    origin: "assisted",
  });
  const draft =
    session.draftJson &&
    typeof session.draftJson === "object" &&
    !Array.isArray(session.draftJson)
      ? session.draftJson
      : {};

  const resolvedPlan = String(
    planKey || draft.planKey || "",
  )
    .toLowerCase()
    .replace(/_/g, "-");
  if (!PLAN_KEYS.has(resolvedPlan)) {
    throw Object.assign(new Error("Select a valid plan before confirming"), {
      status: 400,
    });
  }

  const period =
    billingPeriod === "annual" || billingPeriod === "monthly"
      ? billingPeriod
      : draft.billingPeriod === "annual"
        ? "annual"
        : "monthly";

  const subscription = await saasSubscriptionService.createAssistedSubscription({
    userId,
    planKey: resolvedPlan,
    billingPeriod: period,
    tenantId: user.tenantId || null,
  });

  await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      origin: "assisted",
      draftJson: {
        ...draft,
        origin: "assisted",
        planKey: resolvedPlan,
        billingPeriod: period,
        planConfirmed: true,
        provisioningMode: "assisted",
      },
    },
  });

  const state = await onboardingSessionService.getSessionState(userId);

  return {
    success: true,
    message: "Plan confirmed. Continue with organization setup.",
    subscription: {
      id: subscription.id,
      planKey: subscription.planKey,
      billingPeriod: subscription.billingPeriod,
      status: subscription.status,
    },
    ...state,
  };
}

module.exports = {
  createAssistedActivation,
  confirmAssistedPlan,
};
