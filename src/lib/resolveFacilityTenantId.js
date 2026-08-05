const prisma = require("./prisma");
const { userHasAccessToTenant } = require("./tenantAccess");

function facilityIdFromRequest(req) {
  return (
    req.query.facilityId ||
    req.body?.facilityId ||
    req.params.facilityId ||
    req.params.id
  );
}

/**
 * Resolve tenant for facility-scoped APIs.
 * When facilityId is present, use that facility's tenant if the user may access it
 * (matches listAllMyFacilities / document-compliance scope).
 */
async function resolveFacilityTenantId(req) {
  let tenantId = req.user.tenantId;
  if (
    req.user.role === "SUPER_ADMIN" &&
    (req.body?.tenantId || req.query.tenantId)
  ) {
    tenantId = req.body.tenantId || req.query.tenantId;
  }

  const facilityId = facilityIdFromRequest(req);
  if (!facilityId) return tenantId;

  const facility = await prisma.facility.findFirst({
    where: { id: facilityId },
    select: { tenantId: true },
  });
  if (!facility?.tenantId) return tenantId;

  const mayUse =
    req.user.role === "SUPER_ADMIN" ||
    (await userHasAccessToTenant(
      req.user.id,
      req.user.tenantId,
      facility.tenantId
    ));

  if (mayUse) {
    tenantId = facility.tenantId;
  }

  const explicitTenantId = req.query.tenantId || req.body?.tenantId;
  if (
    explicitTenantId &&
    explicitTenantId === facility.tenantId &&
    mayUse
  ) {
    tenantId = explicitTenantId;
  }

  return tenantId;
}

module.exports = { resolveFacilityTenantId, facilityIdFromRequest };
