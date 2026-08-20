const { getEffectivePermissions } = require("../services/role/permissionResolver.service");

const DELETE_ROLE_DENIED_MESSAGE =
  "Only an administrator can delete this.";

/**
 * HTTP DELETE handlers that only use e.g. requirePermission(module, "view") must stack
 * this middleware so STAFF and custom roles cannot remove data.
 */
function requireAdminOrSuperAdminForDelete() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    if (req.user.role === "SUPER_ADMIN" || req.user.role === "ADMIN") {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: DELETE_ROLE_DENIED_MESSAGE,
    });
  };
}

/**
 * requirePermission(module, action)
 * - SUPER_ADMIN: always allowed
 * - ADMIN: always allowed
 * - action "delete": only ADMIN and SUPER_ADMIN (custom roles cannot grant delete)
 * - Others: must have (module, action) in effective permissions
 */
function requirePermission(module, action) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // SUPER_ADMIN and ADMIN bypass (both have full access)
      if (req.user.role === "SUPER_ADMIN" || req.user.role === "ADMIN") {
        return next();
      }

      // Destructive deletes: never granted via custom-role permissions
      if (action === "delete") {
        return res.status(403).json({
          success: false,
          message: DELETE_ROLE_DENIED_MESSAGE,
        });
      }

      // Load permissions once per request
      if (!req.user.permissions) {
        try {
          const perms = await getEffectivePermissions(
            req.user.id,
            req.user.tenantId || null,
            req.user.role
          );
          req.user.permissions = perms;
        } catch (error) {
          console.error("[PermissionMiddleware] Error loading permissions:", error);
          // For ADMIN/STAFF, if permission loading fails, still allow (they have full access)
          // For other roles, deny access if permissions can't be loaded
          if (req.user.role !== "ADMIN" && req.user.role !== "STAFF") {
            return res.status(403).json({
              success: false,
              message: "Insufficient permissions",
            });
          }
          // ADMIN/STAFF: set empty array; STAFF will be allowed below via empty-permissions bypass
          req.user.permissions = [];
        }
      }

      // STAFF with no permissions (legacy) → full access (delete already blocked above)
      if (req.user.role === "STAFF" && (!req.user.permissions || req.user.permissions.length === 0)) {
        return next();
      }

      // STAFF can always use Appointments for view/create/update; delete requires explicit APPOINTMENTS:delete
      if (req.user.role === "STAFF" && module === "APPOINTMENTS" && action !== "delete") {
        return next();
      }

      const hasPermission =
        Array.isArray(req.user.permissions) &&
        req.user.permissions.some(
          (p) => p.module === module && p.action === action
        );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions",
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
};

