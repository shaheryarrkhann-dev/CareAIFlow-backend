/**
 * Role-Based Access Control (RBAC) Middleware
 * Checks if user has required role(s)
 */

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
 * Check if user is in the same tenant (for multi-tenancy)
 */
const checkTenantAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // SUPER_ADMIN can access all tenants
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // Get tenantId from request body or params
  const requestedTenantId = req.body.tenantId || req.params.tenantId;

  if (requestedTenantId && requestedTenantId !== req.user.tenantId) {
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this organization'
    });
  }

  next();
};

module.exports = {
  authorize,
  checkTenantAccess
};

