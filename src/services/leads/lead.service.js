const prisma = require("../../lib/prisma");
const { sendLeadNotificationEmail } = require("../../utils/email.util");

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function coercePrivacyAccepted(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

/**
 * Persist a marketing lead and notify the super-admin owner.
 */
async function createLeadInquiry(payload) {
  const privacyAccepted = coercePrivacyAccepted(payload.privacyAccepted);
  if (!privacyAccepted) {
    const err = new Error("Privacy policy consent is required");
    err.status = 400;
    throw err;
  }

  const lead = await prisma.leadInquiry.create({
    data: {
      fullName: String(payload.fullName).trim(),
      email: String(payload.email).trim().toLowerCase(),
      organization: String(payload.organization).trim(),
      role: String(payload.role).trim(),
      facilities: String(payload.facilities).trim(),
      population: String(payload.population).trim(),
      phone: normalizeOptional(payload.phone),
      currentSystem: normalizeOptional(payload.currentSystem),
      message: String(payload.message).trim(),
      privacyAccepted: true,
      source: normalizeOptional(payload.source) || "landing_contact",
      status: "new",
    },
  });

  try {
    await sendLeadNotificationEmail(lead);
  } catch (err) {
    console.error("[Lead] Notification email failed (lead saved):", err?.message || err);
  }

  return {
    id: lead.id,
    createdAt: lead.createdAt,
  };
}

/**
 * SUPER_ADMIN list - newest first.
 */
async function listLeadInquiries({ page = 1, pageSize = 25, status } = {}) {
  const take = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
  const where = status ? { status: String(status) } : {};

  const [items, total] = await Promise.all([
    prisma.leadInquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.leadInquiry.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: Math.max(Number(page) || 1, 1),
      pageSize: take,
      total,
      totalPages: Math.max(1, Math.ceil(total / take)),
    },
  };
}

module.exports = {
  createLeadInquiry,
  listLeadInquiries,
};
