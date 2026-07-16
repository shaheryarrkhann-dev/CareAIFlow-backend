const prisma = require("../lib/prisma");

/**
 * Users who may view and manage all staff documents in a tenant (API-level).
 */
function isStaffDocumentsAdmin(user) {
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

function resolveStaffRouteTenantId(req) {
  let tenantId = req.user?.tenantId;
  if (
    req.user?.role === "SUPER_ADMIN" &&
    (req.body?.tenantId || req.query?.tenantId)
  ) {
    tenantId = req.body.tenantId || req.query.tenantId;
  }
  return tenantId;
}

/**
 * ADMIN/SUPER_ADMIN: any staff member in tenant.
 * Others: only their own StaffMember row (userId must match).
 */
function assertOwnStaffMemberOrAdmin(paramName = "staffId") {
  return async (req, res, next) => {
    try {
      if (isStaffDocumentsAdmin(req.user)) {
        return next();
      }

      const staffMemberId = req.params[paramName];
      if (!staffMemberId) {
        const err = new Error("Staff member ID is required");
        err.status = 400;
        throw err;
      }

      const tenantId = resolveStaffRouteTenantId(req);
      if (!tenantId) {
        const err = new Error(
          "tenantId is required. Ensure you are associated with an organization.",
        );
        err.status = 400;
        throw err;
      }

      const member = await prisma.staffMember.findFirst({
        where: { id: staffMemberId, tenantId },
        select: { userId: true },
      });

      if (!member) {
        const err = new Error("Staff member not found");
        err.status = 404;
        throw err;
      }

      if (member.userId !== req.user.id) {
        const err = new Error("You can only access your own staff documents");
        err.status = 403;
        throw err;
      }

      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Strict admin-only actions (create/delete staff rows, facility assignment, audit list, etc.)
 */
function requireStaffDocumentsAdmin(req, res, next) {
  if (isStaffDocumentsAdmin(req.user)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Only administrators can perform this action",
  });
}

module.exports = {
  isStaffDocumentsAdmin,
  assertOwnStaffMemberOrAdmin,
  requireStaffDocumentsAdmin,
  resolveStaffRouteTenantId,
};
