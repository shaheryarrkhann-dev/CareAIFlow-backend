/**
 * Role-Based Access Control (RBAC) Middleware
 * Checks if user has required role(s)
 */

const { userHasAccessToTenant } = require("../lib/tenantAccess");

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (allowedRoles.length === 0) {
      return next();
    }

    const hasRole = allowedRoles.includes(req.user.role);

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * Check if user may act for the tenant in body/params (primary tenant or UserTenant link).
 */
const checkTenantAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role === "SUPER_ADMIN") {
      return next();
    }

    const requestedTenantId = req.body.tenantId || req.params.tenantId;
    if (!requestedTenantId) {
      return next();
    }

    const allowed = await userHasAccessToTenant(
      req.user.id,
      req.user.tenantId || null,
      requestedTenantId,
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this organization",
      });
    }

    return next();
  } catch (err) {
    console.error("checkTenantAccess error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to verify organization access",
    });
  }
};

module.exports = {
  authorize,
  checkTenantAccess
};

