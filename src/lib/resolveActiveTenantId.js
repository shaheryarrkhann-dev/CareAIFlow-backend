/**
 * Active tenant for the current request (JWT + optional super-admin override).
 * @param {import("express").Request} req
 */
function resolveActiveTenantId(req) {
  if (req.user?.role === "SUPER_ADMIN") {
    return (
      req.body?.tenantId ||
      req.query?.tenantId ||
      req.user?.tenantId ||
      null
    );
  }
  return req.user?.tenantId || null;
}

module.exports = { resolveActiveTenantId };
