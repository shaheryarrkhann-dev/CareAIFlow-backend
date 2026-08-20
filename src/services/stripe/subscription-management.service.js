const { getStripe } = require("../../config/stripe");
const {
  STRIPE_CATALOG,
  getStripePriceId,
} = require("../../config/stripeCatalog");
const {
  getPlanEntitlement,
  includedFacilityLimit,
  maxResidentsPerFacility,
  normalizePlanKey,
} = require("../../config/planEntitlements");
const {
  normalizeResidentCapacityLimit,
} = require("../../lib/residentCapacity");
const saasSubscriptionService = require("./saas-subscription.service");
const prisma = require("../../lib/prisma");

const PLAN_KEYS = new Set(["starter", "professional", "multi-home"]);
const PERIODS = new Set(["monthly", "annual"]);

/** Short window so double-clicks reuse the same Stripe mutation. */
const IDEMPOTENCY_WINDOW_MS = 30 * 1000;

function stripeIdempotencyKey(...parts) {
  const bucket = Math.floor(Date.now() / IDEMPOTENCY_WINDOW_MS);
  return [...parts, String(bucket)]
    .map((p) => String(p).replace(/[^a-zA-Z0-9_-]/g, "_"))
    .join("_")
    .slice(0, 255);
}

function collectCatalogPriceIds() {
  const ids = new Set();
  for (const entry of Object.values(STRIPE_CATALOG.prices)) {
    if (entry.monthly) ids.add(entry.monthly);
    if (entry.annual) ids.add(entry.annual);
  }
  return ids;
}

function isExtraFacilityPriceId(priceId) {
  const extra = STRIPE_CATALOG.prices.extraFacility;
  return (
    priceId === extra.monthly ||
    priceId === extra.annual ||
    priceId === getStripePriceId("extra-facility", "monthly") ||
    priceId === getStripePriceId("extra-facility", "annual")
  );
}

function isPlanPriceId(priceId) {
  if (!priceId || isExtraFacilityPriceId(priceId)) return false;
  return collectCatalogPriceIds().has(priceId);
}

/**
 * Load SaaS subscription + live Stripe extras + tenant facility usage.
 */
async function countFacilitiesForUser(userId) {
  const userTenants = await prisma.userTenant.findMany({
    where: { userId },
    select: { tenantId: true },
  });
  const tenantIds = userTenants.map((ut) => ut.tenantId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  if (user?.tenantId && !tenantIds.includes(user.tenantId)) {
    tenantIds.push(user.tenantId);
  }

  if (tenantIds.length === 0) return 0;

  return prisma.facility.count({
    where: { tenantId: { in: tenantIds } },
  });
}

const PAID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Ensure the account has a paid plan and an unused facility slot.
 * Call before creating another facility.
 */
async function assertCanAddFacility(userId, { userRole } = {}) {
  if (userRole === "SUPER_ADMIN") return;

  const overview = await getSubscriptionOverview(userId);
  const status = overview.subscription?.status;

  if (!overview.subscription) {
    throw Object.assign(
      new Error(
        "No CareAIFlow subscription found. Complete billing before adding a facility.",
      ),
      { status: 403 },
    );
  }

  if (!PAID_SUBSCRIPTION_STATUSES.has(status)) {
    throw Object.assign(
      new Error(
        "Subscription payment is not confirmed yet. Finish checkout or update billing, then add a facility.",
      ),
      { status: 403 },
    );
  }

  if (overview.facilityCount >= overview.facilityLimit) {
    throw Object.assign(
      new Error(
        `Facility limit reached (${overview.facilityCount}/${overview.facilityLimit}). Upgrade your plan or add paid extras on Subscription, then try again.`,
      ),
      { status: 403 },
    );
  }
}

/**
 * Resolve the SaaS plan for a facility tenant (owner subscription, then tenant link).
 */
async function resolvePlanKeyForTenant(tenantId, userId) {
  if (userId) {
    const mine = await saasSubscriptionService.getLatestForUser(userId);
    if (mine?.planKey) return normalizePlanKey(mine.planKey);
  }

  const linked = await prisma.saasSubscription.findFirst({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    select: { planKey: true },
  });
  if (linked?.planKey) return normalizePlanKey(linked.planKey);

  const admins = await prisma.userTenant.findMany({
    where: {
      tenantId,
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
    },
    select: { userId: true },
  });
  for (const row of admins) {
    const sub = await saasSubscriptionService.getLatestForUser(row.userId);
    if (sub?.planKey) return normalizePlanKey(sub.planKey);
  }

  return null;
}

/**
 * Resolve which facility to apply the resident enrollment cap against.
 * Prefer explicit facilityId; if omitted and the tenant has exactly one
 * facility, use that; otherwise require facilityId.
 * @returns {Promise<{ id: string, name: string, residentCapacityLimit: number }>}
 */
async function resolveFacilityForResidentCap(tenantId, facilityId) {
  if (facilityId) {
    const facility = await prisma.facility.findFirst({
      where: { id: facilityId, tenantId },
      select: {
        id: true,
        name: true,
        residentCapacityLimit: true,
      },
    });
    if (!facility) {
      throw Object.assign(
        new Error("Facility not found for this organization"),
        { status: 400 },
      );
    }
    return facility;
  }

  const facilities = await prisma.facility.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      residentCapacityLimit: true,
    },
  });

  if (facilities.length === 0) {
    throw Object.assign(
      new Error("Create a facility before adding residents"),
      { status: 400 },
    );
  }
  if (facilities.length > 1) {
    throw Object.assign(
      new Error(
        "facilityId is required when the organization has more than one facility",
      ),
      { status: 400 },
    );
  }
  return facilities[0];
}

/**
 * Ensure a facility is under its resident enrollment cap.
 * Default 6 per facility; Super Admin may raise a facility to 7 or 8.
 * Counts ACTIVE residents on that facility (not the whole tenant).
 */
async function assertCanAddResident(
  tenantId,
  { userId, userRole, facilityId } = {},
) {
  if (userRole === "SUPER_ADMIN") return;

  if (!tenantId) {
    throw Object.assign(new Error("tenantId is required"), { status: 400 });
  }

  const facility = await resolveFacilityForResidentCap(tenantId, facilityId);
  const limit = normalizeResidentCapacityLimit(facility.residentCapacityLimit);

  const activeCount = await prisma.resident.count({
    where: {
      facilityId: facility.id,
      deletedAt: null,
      status: "ACTIVE",
    },
  });

  if (activeCount >= limit) {
    const planKey = await resolvePlanKeyForTenant(tenantId, userId);
    const planLabel = planKey || "current plan";
    throw Object.assign(
      new Error(
        `Resident limit reached for ${facility.name || "this facility"} (${activeCount}/${limit} on ${planLabel}). Archive a resident or ask a Super Admin to raise this facility’s capacity (up to 8).`,
      ),
      { status: 403 },
    );
  }

  return facility;
}

async function getSubscriptionOverview(userId) {
  const subscription = await saasSubscriptionService.getLatestForUser(userId);
  const facilityCount = await countFacilitiesForUser(userId);

  let extraFacilityQuantity = 0;
  let stripeStatus = subscription?.status || null;
  let currentPeriodEnd = subscription?.currentPeriodEnd || null;
  let cancelAtPeriodEnd = Boolean(subscription?.cancelAtPeriodEnd);

  if (subscription?.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      const stripeSub = await stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );
      stripeStatus = stripeSub.status;
      currentPeriodEnd = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : currentPeriodEnd;
      cancelAtPeriodEnd = Boolean(stripeSub.cancel_at_period_end);

      for (const item of stripeSub.items?.data || []) {
        const priceId = item.price?.id;
        if (isExtraFacilityPriceId(priceId)) {
          extraFacilityQuantity += item.quantity || 0;
        }
      }
    } catch (err) {
      console.error(
        "[subscription-management] Failed to refresh Stripe subscription:",
        err.message,
      );
    }
  }

  const planKey = subscription?.planKey || null;
  const entitlement = getPlanEntitlement(planKey);
  const included = planKey ? includedFacilityLimit(planKey) : 0;
  const facilityLimit = included + extraFacilityQuantity;
  const maxResidents = entitlement
    ? entitlement.maxResidentsPerFacility
    : maxResidentsPerFacility(planKey);

  const effectiveStatus = stripeStatus || subscription?.status || null;
  const GRACE_DAYS = Number(process.env.BILLING_GRACE_DAYS || 7);
  let billingAlert = null;
  if (effectiveStatus === "past_due" && subscription) {
    const failedAt = subscription.lastPaymentFailedAt
      ? new Date(subscription.lastPaymentFailedAt)
      : new Date();
    const graceEndsAt = new Date(
      failedAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
    );
    const inGrace = Date.now() < graceEndsAt.getTime();
    billingAlert = {
      type: "past_due",
      inGrace,
      graceEndsAt: graceEndsAt.toISOString(),
      lastPaymentFailedAt: failedAt.toISOString(),
      message: inGrace
        ? `Payment failed. Update your card by ${graceEndsAt.toLocaleDateString()} to avoid interruption. Adding facilities is paused until payment succeeds.`
        : "Payment is still past due. Update your card to restore full billing access. Adding facilities stays locked until payment succeeds.",
    };
  }

  return {
    subscription: subscription
      ? {
          ...subscription,
          status: effectiveStatus,
          currentPeriodEnd,
          cancelAtPeriodEnd,
        }
      : null,
    facilityCount,
    includedFacilities: included,
    extraFacilityQuantity,
    facilityLimit,
    maxResidentsPerFacility: maxResidents,
    entitlement: entitlement
      ? {
          planKey: entitlement.planKey,
          facilityLimit: included,
          maxResidentsPerFacility: entitlement.maxResidentsPerFacility,
          extraFacilityAllowed: entitlement.extraFacilityAllowed,
          moduleFlags: entitlement.moduleFlags,
        }
      : null,
    billingAlert,
  };
}

async function requireManageableSubscription(userId) {
  const subscription = await saasSubscriptionService.getLatestForUser(userId);
  if (!subscription?.stripeSubscriptionId) {
    throw Object.assign(
      new Error("No active Stripe subscription found for this account"),
      { status: 404 },
    );
  }
  if (!["active", "trialing", "past_due"].includes(subscription.status)) {
    throw Object.assign(
      new Error("Subscription is not active. Complete billing first."),
      { status: 403 },
    );
  }
  return subscription;
}

function summarizeInvoice(invoice) {
  if (!invoice || typeof invoice !== "object") {
    return {
      amountDueCents: 0,
      amountPaidCents: 0,
      currency: "usd",
      status: null,
      invoiceId: null,
      lines: [],
    };
  }
  const lines = (invoice.lines?.data || []).map((line) => ({
    description: line.description || "Line item",
    amountCents: line.amount || 0,
    proration: Boolean(line.proration),
  }));
  return {
    amountDueCents: invoice.amount_due ?? invoice.total ?? 0,
    amountPaidCents: invoice.amount_paid ?? 0,
    currency: invoice.currency || "usd",
    status: invoice.status || null,
    invoiceId: invoice.id || null,
    lines,
  };
}

/** Lines that are mid-cycle prorations (credit unused / charge remaining). */
function isProrationLine(line) {
  if (!line) return false;
  if (line.proration) return true;
  const desc = String(line.description || "");
  return /unused time|remaining time/i.test(desc);
}

/**
 * "Due now" for a plan/extras change = prorations only.
 * Exclude next full-period subscription lines (e.g. "1 × Multi-Home at $399/mo").
 */
function summarizeDueNowFromPreview(invoice) {
  if (!invoice || typeof invoice !== "object") {
    return {
      amountDueCents: 0,
      amountPaidCents: 0,
      currency: "usd",
      status: null,
      invoiceId: null,
      lines: [],
    };
  }
  const raw = invoice.lines?.data || [];
  const prorationRaw = raw.filter(isProrationLine);
  const useLines = prorationRaw.length > 0 ? prorationRaw : [];
  const lines = useLines.map((line) => ({
    description: line.description || "Line item",
    amountCents: line.amount || 0,
    proration: true,
  }));
  const amountDueCents = lines.reduce((sum, l) => sum + (l.amountCents || 0), 0);
  return {
    amountDueCents,
    amountPaidCents: 0,
    currency: invoice.currency || "usd",
    status: invoice.status || null,
    invoiceId: invoice.id || null,
    lines,
  };
}

/**
 * Remove stale pending proration invoice items left from earlier
 * create_prorations updates (otherwise previews/charges stack duplicates).
 */
async function clearPendingProrationInvoiceItems(customerId) {
  if (!customerId) return 0;
  const stripe = getStripe();
  let deleted = 0;
  let startingAfter;
  for (let page = 0; page < 5; page += 1) {
    const list = await stripe.invoiceItems.list({
      customer: customerId,
      pending: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const item of list.data || []) {
      const desc = String(item.description || "");
      const looksProration =
        item.proration || /unused time|remaining time/i.test(desc);
      if (!looksProration) continue;
      try {
        await stripe.invoiceItems.del(item.id);
        deleted += 1;
      } catch (err) {
        console.error(
          "[subscription] clear pending invoice item failed:",
          item.id,
          err.message,
        );
      }
    }
    if (!list.has_more || !(list.data || []).length) break;
    startingAfter = list.data[list.data.length - 1].id;
  }
  if (deleted > 0) {
    console.log(
      `[subscription] cleared ${deleted} pending proration invoice item(s) for ${customerId}`,
    );
  }
  return deleted;
}

async function buildPlanChangeItems(stripeSub, normalizedPlan, period) {
  const newPriceId = getStripePriceId(normalizedPlan, period);
  if (!newPriceId) {
    throw Object.assign(new Error("Price not found for plan"), { status: 400 });
  }

  const planItems = (stripeSub.items?.data || []).filter((item) =>
    isPlanPriceId(item.price?.id),
  );
  const extraItems = (stripeSub.items?.data || []).filter((item) =>
    isExtraFacilityPriceId(item.price?.id),
  );

  const primaryItem =
    planItems[0] ||
    (stripeSub.items?.data || []).find(
      (item) => !isExtraFacilityPriceId(item.price?.id),
    );

  if (!primaryItem) {
    throw Object.assign(
      new Error("Could not find the base plan item on this subscription"),
      { status: 400 },
    );
  }

  const itemsUpdate = [{ id: primaryItem.id, price: newPriceId }];
  if (normalizedPlan !== "multi-home") {
    for (const item of extraItems) {
      itemsUpdate.push({ id: item.id, deleted: true });
    }
  }
  return itemsUpdate;
}

async function buildExtraFacilityItems(stripeSub, quantity, period) {
  const extraPriceId = getStripePriceId("extra-facility", period);
  if (!extraPriceId) {
    throw Object.assign(new Error("Extra facility price not configured"), {
      status: 500,
    });
  }
  const extraItem = (stripeSub.items?.data || []).find((item) =>
    isExtraFacilityPriceId(item.price?.id),
  );

  if (quantity === 0) {
    if (!extraItem) return null;
    return [{ id: extraItem.id, deleted: true }];
  }
  if (extraItem) {
    return [{ id: extraItem.id, quantity }];
  }
  return [{ price: extraPriceId, quantity }];
}

async function previewSubscriptionItemsUpdate(local, itemsUpdate) {
  const stripe = getStripe();
  const customerId = await resolveStripeCustomerId(local);
  if (!customerId) {
    throw Object.assign(new Error("Stripe customer not found"), {
      status: 400,
    });
  }

  // Drop leftover pending prorations from earlier create_prorations updates
  await clearPendingProrationInvoiceItems(customerId);

  try {
    const preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: local.stripeSubscriptionId,
      subscription_details: {
        items: itemsUpdate,
        proration_behavior: "create_prorations",
      },
    });
    const dueNow = summarizeDueNowFromPreview(preview);
    // If Stripe didn't mark proration flags, fall back to invoice amount_due
    // only when we found no proration-looking lines (avoid full next-cycle total).
    const summary =
      dueNow.lines.length > 0
        ? dueNow
        : {
            ...summarizeInvoice(preview),
            // Prefer amount_due but drop huge next-cycle-only previews without proration lines
            lines: (preview.lines?.data || [])
              .filter((line) => isProrationLine(line))
              .map((line) => ({
                description: line.description || "Line item",
                amountCents: line.amount || 0,
                proration: true,
              })),
          };

    if (summary.lines.length === 0 && typeof preview.amount_due === "number") {
      // Last resort: show Stripe's amount_due with all lines for transparency
      Object.assign(summary, summarizeInvoice(preview));
    }

    return {
      success: true,
      immediateCharge: true,
      ...summary,
      message:
        (summary.amountDueCents || 0) > 0
          ? "Your card on file will be charged this amount now (prorated for the rest of the period)."
          : (summary.amountDueCents || 0) < 0
            ? "You will receive a credit for unused time on your current plan."
            : "No immediate charge for this change.",
    };
  } catch (err) {
    console.error("[subscription] preview failed:", err.message);
    return {
      success: true,
      immediateCharge: true,
      amountDueCents: null,
      amountPaidCents: null,
      currency: "usd",
      status: null,
      invoiceId: null,
      lines: [],
      message:
        "Stripe will prorate unused time and charge or credit the difference on your card now.",
      previewUnavailable: true,
    };
  }
}

/**
 * Preview plan change amount before confirming (proration on card).
 */
async function previewPlanChange(userId, { planKey, billingPeriod }) {
  const normalizedPlan = String(planKey || "").toLowerCase();
  const period = String(billingPeriod || "monthly").toLowerCase();

  if (!PLAN_KEYS.has(normalizedPlan)) {
    throw Object.assign(new Error("Invalid plan"), { status: 400 });
  }
  if (!PERIODS.has(period)) {
    throw Object.assign(new Error("Invalid billing period"), { status: 400 });
  }

  const local = await requireManageableSubscription(userId);
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(
    local.stripeSubscriptionId,
  );
  const itemsUpdate = await buildPlanChangeItems(
    stripeSub,
    normalizedPlan,
    period,
  );
  return previewSubscriptionItemsUpdate(local, itemsUpdate);
}

/**
 * Preview extra-facility quantity change.
 */
async function previewExtraFacilities(userId, { quantity }) {
  const qty = Number.parseInt(String(quantity), 10);
  if (!Number.isFinite(qty) || qty < 0 || qty > 50) {
    throw Object.assign(
      new Error("Extra facility quantity must be between 0 and 50"),
      { status: 400 },
    );
  }

  const local = await requireManageableSubscription(userId);
  if (local.planKey !== "multi-home") {
    throw Object.assign(
      new Error("Extra facilities are only available on Multi-Home"),
      { status: 400 },
    );
  }

  const period = local.billingPeriod === "annual" ? "annual" : "monthly";
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(
    local.stripeSubscriptionId,
  );
  const itemsUpdate = await buildExtraFacilityItems(stripeSub, qty, period);
  if (!itemsUpdate) {
    return {
      success: true,
      immediateCharge: true,
      amountDueCents: 0,
      amountPaidCents: 0,
      currency: "usd",
      status: null,
      invoiceId: null,
      lines: [],
      message: "No change — extras already at 0.",
    };
  }
  return previewSubscriptionItemsUpdate(local, itemsUpdate);
}

/**
 * Change SaaS plan (upgrade / downgrade) with immediate prorated invoice.
 */
async function changePlan(userId, { planKey, billingPeriod }) {
  const normalizedPlan = String(planKey || "").toLowerCase();
  const period = String(billingPeriod || "monthly").toLowerCase();

  if (!PLAN_KEYS.has(normalizedPlan)) {
    throw Object.assign(new Error("Invalid plan"), { status: 400 });
  }
  if (!PERIODS.has(period)) {
    throw Object.assign(new Error("Invalid billing period"), { status: 400 });
  }

  const local = await requireManageableSubscription(userId);
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(
    local.stripeSubscriptionId,
  );
  const itemsUpdate = await buildPlanChangeItems(
    stripeSub,
    normalizedPlan,
    period,
  );

  const customerId = await resolveStripeCustomerId(local);
  await clearPendingProrationInvoiceItems(customerId);

  const updated = await stripe.subscriptions.update(
    local.stripeSubscriptionId,
    {
      items: itemsUpdate,
      // Invoice + attempt payment now (not wait until renewal)
      proration_behavior: "always_invoice",
      metadata: {
        ...(stripeSub.metadata || {}),
        userId,
        planKey: normalizedPlan,
        billingPeriod: period,
        product: "careaiflow",
      },
    },
    {
      idempotencyKey: stripeIdempotencyKey(
        "careaiflow_change_plan",
        userId,
        local.stripeSubscriptionId,
        normalizedPlan,
        period,
      ),
    },
  );

  await saasSubscriptionService.upsertFromStripeSubscription(updated);

  let charge = null;
  const latestId =
    typeof updated.latest_invoice === "string"
      ? updated.latest_invoice
      : updated.latest_invoice?.id;
  if (latestId) {
    try {
      const invoice = await stripe.invoices.retrieve(latestId);
      // Prefer paid amount on the invoice Stripe just created
      charge = summarizeInvoice(invoice);
      const dueNow = summarizeDueNowFromPreview(invoice);
      if (dueNow.lines.length > 0) {
        charge = {
          ...charge,
          lines: dueNow.lines,
          amountDueCents: dueNow.amountDueCents,
        };
      }
    } catch (err) {
      console.error("[subscription] fetch latest invoice:", err.message);
    }
  }

  const overview = await getSubscriptionOverview(userId);
  return { ...overview, charge };
}

/**
 * Set paid extra facilities (+$170) with immediate prorated invoice.
 * quantity is the total paid extras (not including the 2 included homes).
 */
async function setExtraFacilities(userId, { quantity }) {
  const qty = Number.parseInt(String(quantity), 10);
  if (!Number.isFinite(qty) || qty < 0 || qty > 50) {
    throw Object.assign(
      new Error("Extra facility quantity must be between 0 and 50"),
      { status: 400 },
    );
  }

  const local = await requireManageableSubscription(userId);
  if (local.planKey !== "multi-home") {
    throw Object.assign(
      new Error("Extra facilities are only available on Multi-Home"),
      { status: 400 },
    );
  }

  const period = local.billingPeriod === "annual" ? "annual" : "monthly";
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(
    local.stripeSubscriptionId,
  );
  const itemsUpdate = await buildExtraFacilityItems(stripeSub, qty, period);
  if (!itemsUpdate) {
    return { ...(await getSubscriptionOverview(userId)), charge: null };
  }

  const customerId = await resolveStripeCustomerId(local);
  await clearPendingProrationInvoiceItems(customerId);

  const idempotencyKey = stripeIdempotencyKey(
    "careaiflow_extra_facilities",
    userId,
    local.stripeSubscriptionId,
    String(qty),
  );

  const updated = await stripe.subscriptions.update(
    local.stripeSubscriptionId,
    {
      items: itemsUpdate,
      proration_behavior: "always_invoice",
    },
    { idempotencyKey },
  );

  await saasSubscriptionService.upsertFromStripeSubscription(updated);

  let charge = null;
  const latestId =
    typeof updated.latest_invoice === "string"
      ? updated.latest_invoice
      : updated.latest_invoice?.id;
  if (latestId) {
    try {
      const invoice = await stripe.invoices.retrieve(latestId);
      charge = summarizeInvoice(invoice);
      const dueNow = summarizeDueNowFromPreview(invoice);
      if (dueNow.lines.length > 0) {
        charge = {
          ...charge,
          lines: dueNow.lines,
          amountDueCents: dueNow.amountDueCents,
        };
      }
    } catch (err) {
      console.error("[subscription] fetch latest invoice:", err.message);
    }
  }

  const overview = await getSubscriptionOverview(userId);
  return { ...overview, charge };
}

/**
 * Resolve Stripe customer id from DB or live subscription.
 */
async function resolveStripeCustomerId(local) {
  if (local.stripeCustomerId) return local.stripeCustomerId;
  if (!local.stripeSubscriptionId) return null;

  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(
    local.stripeSubscriptionId,
  );
  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer?.id || null;

  if (customerId) {
    await prisma.saasSubscription.update({
      where: { id: local.id },
      data: { stripeCustomerId: customerId },
    });
  }
  return customerId;
}

/**
 * Cancel at period end (keeps access until renew date) or resume.
 */
async function setCancelAtPeriodEnd(userId, cancelAtPeriodEnd) {
  const local = await requireManageableSubscription(userId);
  const stripe = getStripe();

  const updated = await stripe.subscriptions.update(
    local.stripeSubscriptionId,
    { cancel_at_period_end: Boolean(cancelAtPeriodEnd) },
    {
      idempotencyKey: stripeIdempotencyKey(
        "careaiflow_cancel_at_period_end",
        userId,
        local.stripeSubscriptionId,
        cancelAtPeriodEnd ? "1" : "0",
      ),
    },
  );

  await saasSubscriptionService.upsertFromStripeSubscription(updated);
  return getSubscriptionOverview(userId);
}

/**
 * Stripe Customer Portal — update card, view invoices (and portal cancel if enabled).
 */
async function ensureBillingPortalConfiguration(stripe) {
  const existing = await stripe.billingPortal.configurations.list({
    limit: 1,
    active: true,
  });
  if (existing.data.length > 0) return existing.data[0].id;

  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Manage your CareAIFlow subscription",
    },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "phone", "tax_id"],
      },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
      },
    },
  });
  return created.id;
}

async function createBillingPortalSession(userId) {
  const local = await requireManageableSubscription(userId);
  const customerId = await resolveStripeCustomerId(local);
  if (!customerId) {
    throw Object.assign(
      new Error("No Stripe customer on file for this subscription"),
      { status: 400 },
    );
  }

  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:5173"
  ).replace(/\/$/, "");

  const stripe = getStripe();
  const configuration = await ensureBillingPortalConfiguration(stripe);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${frontendUrl}/subscription`,
    configuration,
  });

  return { url: session.url };
}

module.exports = {
  getSubscriptionOverview,
  assertCanAddFacility,
  assertCanAddResident,
  resolveFacilityForResidentCap,
  changePlan,
  setExtraFacilities,
  previewPlanChange,
  previewExtraFacilities,
  setCancelAtPeriodEnd,
  createBillingPortalSession,
  includedFacilityLimit,
};
