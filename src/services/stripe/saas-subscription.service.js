const prisma = require("../../lib/prisma");
const { getStripe } = require("../../config/stripe");
const { getStripePriceId } = require("../../config/stripeCatalog");

/**
 * Upsert SaaS subscription from Stripe Checkout Session (completed).
 * Idempotent on stripeCheckoutSessionId / stripeSubscriptionId.
 */
async function upsertFromCheckoutSession(session) {
  const userId =
    session.metadata?.userId || session.client_reference_id || null;
  if (!userId) {
    console.warn(
      "[SaaSSubscription] checkout.session.completed missing userId",
      session.id,
    );
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true },
  });
  if (!user) {
    console.warn("[SaaSSubscription] user not found for checkout", userId);
    return null;
  }

  const planKey = session.metadata?.planKey || "professional";
  const billingPeriod = session.metadata?.billingPeriod || "monthly";
  const priceId = getStripePriceId(planKey, billingPeriod);

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || null;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || null;

  let status = "incomplete";
  let currentPeriodEnd = null;
  let cancelAtPeriodEnd = false;
  let resolvedPriceId = priceId;

  if (subscriptionId) {
    try {
      const stripeSub = await getStripe().subscriptions.retrieve(subscriptionId);
      status = stripeSub.status || status;
      currentPeriodEnd = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null;
      cancelAtPeriodEnd = Boolean(stripeSub.cancel_at_period_end);
      const itemPrice = stripeSub.items?.data?.[0]?.price?.id;
      if (itemPrice) resolvedPriceId = itemPrice;
    } catch (err) {
      console.warn(
        "[SaaSSubscription] could not retrieve Stripe subscription",
        subscriptionId,
        err.message,
      );
      if (session.payment_status === "paid") status = "active";
    }
  } else if (session.payment_status === "paid") {
    status = "active";
  }

  return upsertSubscriptionRecord({
    userId: user.id,
    tenantId: user.tenantId || null,
    planKey,
    billingPeriod,
    status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeCheckoutSessionId: session.id,
    stripePriceId: resolvedPriceId,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  });
}

/**
 * Upsert from Stripe Subscription object.
 */
async function upsertFromStripeSubscription(subscription) {
  const userId = subscription.metadata?.userId || null;
  const planKey = subscription.metadata?.planKey || null;
  const billingPeriod = subscription.metadata?.billingPeriod || "monthly";

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const existing = await prisma.saasSubscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      select: { userId: true, planKey: true },
    });
    if (existing) {
      resolvedUserId = existing.userId;
    }
  }

  if (!resolvedUserId) {
    console.warn(
      "[SaaSSubscription] subscription event missing userId",
      subscription.id,
    );
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: resolvedUserId },
    select: { id: true, tenantId: true },
  });
  if (!user) return null;

  const itemPrice = subscription.items?.data?.[0]?.price?.id || null;
  const resolvedPlan =
    planKey ||
    (await prisma.saasSubscription
      .findUnique({
        where: { stripeSubscriptionId: subscription.id },
        select: { planKey: true },
      })
      .then((r) => r?.planKey)) ||
    "professional";

  return upsertSubscriptionRecord({
    userId: user.id,
    tenantId: user.tenantId || null,
    planKey: resolvedPlan,
    billingPeriod,
    status: subscription.status,
    stripeCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id || null,
    stripeSubscriptionId: subscription.id,
    stripeCheckoutSessionId: null,
    stripePriceId: itemPrice,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });
}

async function markCanceledFromStripeSubscription(subscription) {
  const existing = await prisma.saasSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!existing) {
    return upsertFromStripeSubscription({
      ...subscription,
      status: "canceled",
    });
  }

  return prisma.saasSubscription.update({
    where: { id: existing.id },
    data: {
      status: "canceled",
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : existing.currentPeriodEnd,
    },
  });
}

async function markStatusFromInvoice(invoice, statusHint) {
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id || null;
  if (!subscriptionId) return null;

  const existing = await prisma.saasSubscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!existing) return null;

  const data = { status: statusHint };
  if (statusHint === "active") {
    data.lastPaymentFailedAt = null;
  }

  return prisma.saasSubscription.update({
    where: { id: existing.id },
    data,
  });
}

const DUNNING_COOLDOWN_MS = 24 * 60 * 60 * 1000; // one email per day max

/**
 * invoice.payment_failed — mark past_due + send throttled dunning email.
 */
async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id || null;
  if (!subscriptionId) return null;

  const existing = await prisma.saasSubscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!existing) return null;

  const now = new Date();
  const updated = await prisma.saasSubscription.update({
    where: { id: existing.id },
    data: {
      status: "past_due",
      lastPaymentFailedAt: existing.lastPaymentFailedAt || now,
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  const lastEmail = updated.lastDunningEmailAt
    ? new Date(updated.lastDunningEmailAt).getTime()
    : 0;
  const canEmail = Date.now() - lastEmail >= DUNNING_COOLDOWN_MS;

  if (canEmail && updated.user?.email) {
    try {
      const {
        sendPaymentFailedDunningEmail,
      } = require("../../utils/email.util");
      const frontendUrl = (
        process.env.FRONTEND_URL || "http://localhost:5173"
      ).replace(/\/$/, "");
      await sendPaymentFailedDunningEmail(
        updated.user.email,
        updated.user.name,
        {
          updateBillingUrl: `${frontendUrl}/settings?tab=billing`,
          attemptCount: invoice.attempt_count || 1,
          amountDue: invoice.amount_due,
          currency: invoice.currency,
        },
      );
      await prisma.saasSubscription.update({
        where: { id: updated.id },
        data: { lastDunningEmailAt: now },
      });
    } catch (err) {
      console.error(
        "[SaaSSubscription] Dunning email failed:",
        err.message,
      );
    }
  }

  return updated;
}

/**
 * invoice.paid — restore active and clear failure markers.
 */
async function handleInvoicePaid(invoice) {
  return markStatusFromInvoice(invoice, "active");
}

/**
 * Core upsert — prefers stripeSubscriptionId, then checkout session id, then active row for user.
 */
async function upsertSubscriptionRecord(data) {
  const {
    userId,
    tenantId,
    planKey,
    billingPeriod,
    status,
    stripeCustomerId,
    stripeSubscriptionId,
    stripeCheckoutSessionId,
    stripePriceId,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  } = data;

  let existing = null;
  if (stripeSubscriptionId) {
    existing = await prisma.saasSubscription.findUnique({
      where: { stripeSubscriptionId },
    });
  }
  if (!existing && stripeCheckoutSessionId) {
    existing = await prisma.saasSubscription.findUnique({
      where: { stripeCheckoutSessionId },
    });
  }

  const payload = {
    userId,
    tenantId: tenantId ?? undefined,
    planKey,
    billingPeriod,
    status,
    stripeCustomerId: stripeCustomerId ?? undefined,
    stripeSubscriptionId: stripeSubscriptionId ?? undefined,
    stripeCheckoutSessionId: stripeCheckoutSessionId ?? undefined,
    stripePriceId: stripePriceId ?? undefined,
    currentPeriodEnd: currentPeriodEnd ?? undefined,
    cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
  };

  if (existing) {
    return prisma.saasSubscription.update({
      where: { id: existing.id },
      data: {
        ...payload,
        stripeSubscriptionId:
          stripeSubscriptionId || existing.stripeSubscriptionId,
        stripeCheckoutSessionId:
          stripeCheckoutSessionId || existing.stripeCheckoutSessionId,
        tenantId: tenantId ?? existing.tenantId,
      },
    });
  }

  return prisma.saasSubscription.create({ data: payload });
}

async function getLatestForUser(userId) {
  return prisma.saasSubscription.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Create or refresh an active SaaS subscription without Stripe (assisted / internal provision).
 * Idempotent when the user already has an active assisted (or paid) subscription on the same plan.
 */
async function createAssistedSubscription({
  userId,
  planKey,
  billingPeriod = "monthly",
  tenantId = null,
}) {
  const normalizedPlan = String(planKey || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (!["starter", "professional", "multi-home"].includes(normalizedPlan)) {
    throw Object.assign(new Error("Invalid plan key"), { status: 400 });
  }
  const period =
    billingPeriod === "annual" || billingPeriod === "monthly"
      ? billingPeriod
      : "monthly";

  const latest = await getLatestForUser(userId);
  if (latest && ACTIVE_SUB_STATUSES.has(latest.status)) {
    return prisma.saasSubscription.update({
      where: { id: latest.id },
      data: {
        planKey: normalizedPlan,
        billingPeriod: period,
        status: "active",
        tenantId: tenantId ?? latest.tenantId,
      },
    });
  }

  return prisma.saasSubscription.create({
    data: {
      userId,
      tenantId: tenantId || null,
      planKey: normalizedPlan,
      billingPeriod: period,
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeCheckoutSessionId: null,
      stripePriceId: null,
      cancelAtPeriodEnd: false,
    },
  });
}

/**
 * Attach tenantId after org bootstrap (Step 4).
 */
async function attachTenant(userId, tenantId) {
  return prisma.saasSubscription.updateMany({
    where: { userId, tenantId: null },
    data: { tenantId },
  });
}

module.exports = {
  upsertFromCheckoutSession,
  upsertFromStripeSubscription,
  markCanceledFromStripeSubscription,
  markStatusFromInvoice,
  handleInvoicePaymentFailed,
  handleInvoicePaid,
  getLatestForUser,
  attachTenant,
  createAssistedSubscription,
};
