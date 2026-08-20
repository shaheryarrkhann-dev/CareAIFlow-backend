const prisma = require("./prisma");

/**
 * True if the user may act in `requestedTenantId`.
 * Matches facility list scope: JWT/active tenant, User.tenantId (home org), or UserTenant.
 */
async function userHasAccessToTenant(userId, primaryTenantId, requestedTenantId) {
  if (!userId || !requestedTenantId) return false;
  if (primaryTenantId && primaryTenantId === requestedTenantId) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  if (user?.tenantId === requestedTenantId) return true;

  const row = await prisma.userTenant.findFirst({
    where: { userId, tenantId: requestedTenantId },
    select: { id: true },
  });
  return Boolean(row);
}

module.exports = { userHasAccessToTenant };
