const prisma = require("../../lib/prisma");
const { invalidateTenant } = require("./document-compliance-cache.service");

async function getSettings(tenantId) {
  let row = await prisma.tenantDocumentComplianceSettings.findUnique({
    where: { tenantId },
  });
  if (!row) {
    row = await prisma.tenantDocumentComplianceSettings.create({
      data: { tenantId },
    });
  }
  return {
    tenantId: row.tenantId,
    catalogOverrides: row.catalogOverrides || {},
    emailDigestEnabled: row.emailDigestEnabled,
    lastEmailDigestAt: row.lastEmailDigestAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function updateSettings(tenantId, payload) {
  const data = {};
  if (payload.catalogOverrides !== undefined) {
    data.catalogOverrides =
      payload.catalogOverrides && typeof payload.catalogOverrides === "object"
        ? payload.catalogOverrides
        : {};
  }
  if (payload.emailDigestEnabled !== undefined) {
    data.emailDigestEnabled = Boolean(payload.emailDigestEnabled);
  }

  const row = await prisma.tenantDocumentComplianceSettings.upsert({
    where: { tenantId },
    create: {
      tenantId,
      ...data,
    },
    update: data,
  });

  if (payload.catalogOverrides !== undefined) {
    await invalidateTenant(tenantId);
  }

  return {
    tenantId: row.tenantId,
    catalogOverrides: row.catalogOverrides || {},
    emailDigestEnabled: row.emailDigestEnabled,
    lastEmailDigestAt: row.lastEmailDigestAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function markDigestSent(tenantId) {
  await prisma.tenantDocumentComplianceSettings.upsert({
    where: { tenantId },
    create: { tenantId, lastEmailDigestAt: new Date(), emailDigestEnabled: true },
    update: { lastEmailDigestAt: new Date() },
  });
}

async function listTenantsWithDigestEnabled() {
  return prisma.tenantDocumentComplianceSettings.findMany({
    where: { emailDigestEnabled: true },
    include: { tenant: { select: { id: true, name: true, isActive: true } } },
  });
}

module.exports = {
  getSettings,
  updateSettings,
  markDigestSent,
  listTenantsWithDigestEnabled,
};
