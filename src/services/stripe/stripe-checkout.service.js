const { getStripe, isStripeConfigured } = require("../../config/stripe");
const { getStripePriceId } = require("../../config/stripeCatalog");
const saasSubscriptionService = require("./saas-subscription.service");

const PLAN_KEYS = new Set(["starter", "professional", "multi-home"]);
const PERIODS = new Set(["monthly", "annual"]);

/**
 * Create a Stripe Checkout Session for CareAIFlow SaaS subscription.
 * @param {{ user: { id: string, email: string, name: string, isEmailVerified: boolean }, planKey: string, billingPeriod?: string }} input
 */
async function createCheckoutSession({ user, planKey, billingPeriod = "monthly" }) {
  if (!isStripeConfigured()) {
    throw Object.assign(new Error("Stripe is not configured"), { status: 503 });
  }

  if (!user?.isEmailVerified) {
    throw Object.assign(new Error("Verify your email before checkout"), {
      status: 403,
    });
  }

  const normalizedPlan = String(planKey || "").toLowerCase();
  const period = String(billingPeriod || "monthly").toLowerCase();

  if (!PLAN_KEYS.has(normalizedPlan)) {
    throw Object.assign(new Error("Invalid plan"), { status: 400 });
  }
  if (!PERIODS.has(period)) {
    throw Object.assign(new Error("Invalid billing period"), { status: 400 });
  }

  const priceId = getStripePriceId(normalizedPlan, period);
  if (!priceId) {
    throw Object.assign(new Error("Price not found for plan"), { status: 400 });
  }

  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:5173"
  ).replace(/\/$/, "");

  const stripe = getStripe();
  // 10-minute idempotency window: double-clicks reuse the same Checkout Session
  const idempotencyBucket = Math.floor(Date.now() / (10 * 60 * 1000));
  const idempotencyKey = `careaiflow_checkout_${user.id}_${normalizedPlan}_${period}_${idempotencyBucket}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/onboarding/confirm`,
      allow_promotion_codes: true,
      metadata: {
        userId: user.id,
        planKey: normalizedPlan,
        billingPeriod: period,
        product: "careaiflow",
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planKey: normalizedPlan,
          billingPeriod: period,
          product: "careaiflow",
        },
      },
    },
    { idempotencyKey },
  );

  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Retrieve a Checkout Session (for success-page confirmation).
 */
async function getCheckoutSession(sessionId, requestingUserId) {
  if (!isStripeConfigured()) {
    throw Object.assign(new Error("Stripe is not configured"), { status: 503 });
  }
  if (!sessionId) {
    throw Object.assign(new Error("session_id is required"), { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (
    session.metadata?.userId &&
    session.metadata.userId !== requestingUserId &&
    session.client_reference_id !== requestingUserId
  ) {
    throw Object.assign(new Error("Checkout session does not belong to you"), {
      status: 403,
    });
  }

  return {
    id: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    customerEmail: session.customer_details?.email || session.customer_email,
    planKey: session.metadata?.planKey || null,
    billingPeriod: session.metadata?.billingPeriod || null,
    subscriptionId:
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null,
  };
}

/**
 * Confirm checkout and persist subscription if webhook has not landed yet.
 */
async function confirmCheckoutAndPersist(sessionId, requestingUserId) {
  const details = await getCheckoutSession(sessionId, requestingUserId);
  const paid =
    details.paymentStatus === "paid" || details.status === "complete";

  let subscription = await saasSubscriptionService.getLatestForUser(
    requestingUserId,
  );
  const wasActive =
    subscription &&
    ["active", "trialing", "past_due"].includes(subscription.status);

  if (paid) {
    const stripe = getStripe();
    const full = await stripe.checkout.sessions.retrieve(sessionId);
    await saasSubscriptionService.upsertFromCheckoutSession(full);
  }

  subscription = await saasSubscriptionService.getLatestForUser(
    requestingUserId,
  );

  const nowActive =
    subscription &&
    ["active", "trialing", "past_due"].includes(subscription.status);

  if (paid && nowActive && !wasActive) {
    try {
      const prisma = require("../../lib/prisma");
      const { sendPlanConfirmedEmail } = require("../../utils/email.util");
      const user = await prisma.user.findUnique({
        where: { id: requestingUserId },
        select: { email: true, name: true },
      });
      if (user?.email) {
        await sendPlanConfirmedEmail(
          user.email,
          user.name,
          subscription.planKey || details.planKey,
          subscription.billingPeriod || details.billingPeriod || "monthly",
          "self_serve",
        );
      }
    } catch (emailErr) {
      console.error(
        "[stripe.confirmCheckout] plan confirmed email:",
        emailErr.message,
      );
    }
  }

  return { session: details, subscription, paid };
}

module.exports = {
  createCheckoutSession,
  getCheckoutSession,
  confirmCheckoutAndPersist,
};
