const prisma = require("../../lib/prisma");

const EXPIRING_SOON_DAYS = 30;

/**
 * Check staff document alerts for a tenant
 * Returns staff with expired or expiring-soon documents
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} { staffWithAlerts, hasExpired, hasExpiringSoon }
 */
async function checkStaffDocumentAlerts(tenantId, restrictToStaffMemberId = null) {
  const where = { tenantId };
  if (restrictToStaffMemberId) {
    where.id = restrictToStaffMemberId;
  }

  const staffMembers = await prisma.staffMember.findMany({
    where,
    include: {
      user: { select: { name: true, email: true } },
      documents: { select: { id: true, fileName: true, expirationDate: true } },
    },
  });

  const now = new Date();
  const thirtyDaysFromNow = new Date(
    now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  );

  const staffWithAlerts = [];

  for (const staff of staffMembers) {
    const expired = [];
    const expiringSoon = [];

    for (const doc of staff.documents) {
      if (doc.expirationDate) {
        const exp = new Date(doc.expirationDate);
        if (exp < now) {
          expired.push({
            id: doc.id,
            fileName: doc.fileName,
            expirationDate: doc.expirationDate,
          });
        } else if (exp <= thirtyDaysFromNow) {
          expiringSoon.push({
            id: doc.id,
            fileName: doc.fileName,
            expirationDate: doc.expirationDate,
          });
        }
      }
    }

    if (expired.length > 0 || expiringSoon.length > 0) {
      staffWithAlerts.push({
        staffId: staff.id,
        staffName: staff.user?.name ?? "Unknown",
        staffEmail: staff.user?.email ?? null,
        expired,
        expiringSoon,
      });
    }
  }

  const hasExpired = staffWithAlerts.some((s) => s.expired.length > 0);
  const hasExpiringSoon = staffWithAlerts.some((s) => s.expiringSoon.length > 0);

  return {
    staffWithAlerts,
    hasExpired,
    hasExpiringSoon,
  };
}

/**
 * Check staff document alerts for all tenants
 * Used by cron job
 * @returns {Promise<Array>} Array of { tenantId, tenantName, staffWithAlerts }
 */
async function checkAllStaffDocumentAlerts() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });

  const results = [];

  for (const tenant of tenants) {
    const { staffWithAlerts, hasExpired, hasExpiringSoon } =
      await checkStaffDocumentAlerts(tenant.id);

    if (staffWithAlerts.length > 0) {
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        staffCount: staffWithAlerts.length,
        hasExpired,
        hasExpiringSoon,
        staffWithAlerts,
      });
    }
  }

  return results;
}

module.exports = {
  checkStaffDocumentAlerts,
  checkAllStaffDocumentAlerts,
};
