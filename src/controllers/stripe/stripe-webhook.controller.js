const prisma = require("../../lib/prisma");
const { getStripe, isStripeConfigured } = require("../../config/stripe");
const saasSubscriptionService = require("../../services/stripe/saas-subscription.service");

/**
 * Stripe webhook handler with event-id idempotency.
 * Requires raw body (Buffer) for signature verification.
 */
async function handleStripeWebhook(req, res) {
  if (!isStripeConfigured()) {
    return res.status(503).json({ message: "Stripe is not configured" });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not set");
    return res.status(503).json({ message: "Webhook secret not configured" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ message: "Missing stripe-signature header" });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error(
      "[Stripe Webhook] Signature verification failed:",
      err.message,
    );
    return res.status(400).json({ message: `Webhook Error: ${err.message}` });
  }

  console.log(`[Stripe Webhook] ${event.type} (${event.id})`);

  const already = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
  });
  if (already) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await saasSubscriptionService.upsertFromCheckoutSession(
          event.data.object,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await saasSubscriptionService.upsertFromStripeSubscription(
          event.data.object,
        );
        break;
      case "customer.subscription.deleted":
        await saasSubscriptionService.markCanceledFromStripeSubscription(
          event.data.object,
        );
        break;
      case "invoice.paid":
        await saasSubscriptionService.handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await saasSubscriptionService.handleInvoicePaymentFailed(
          event.data.object,
        );
        break;
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    try {
      await prisma.stripeWebhookEvent.create({
        data: { id: event.id, type: event.type },
      });
    } catch (err) {
      // Another worker finished the same event — safe
      if (err.code !== "P2002") throw err;
      return res.json({ received: true, duplicate: true });
    }

    return res.json({ received: true });
  } catch (err) {
    console.error(`[Stripe Webhook] Handler error for ${event.type}:`, err);
    return res.status(500).json({ message: "Webhook handler failed" });
  }
}

module.exports = {
  handleStripeWebhook,
};
