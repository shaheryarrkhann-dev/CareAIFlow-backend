const prisma = require("./prisma");

/**
 * True if the user may act in `requestedTenantId` (primary tenant or UserTenant link).
 * Used for multi-organization admins (e.g. independent facility create adds UserTenant).
 */
async function userHasAccessToTenant(userId, primaryTenantId, requestedTenantId) {
  if (!userId || !requestedTenantId) return false;
  if (primaryTenantId && primaryTenantId === requestedTenantId) return true;
  const row = await prisma.userTenant.findFirst({
    where: { userId, tenantId: requestedTenantId },
    select: { id: true },
  });
  return Boolean(row);
}

module.exports = { userHasAccessToTenant };
