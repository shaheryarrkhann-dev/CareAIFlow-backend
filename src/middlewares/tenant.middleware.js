const prisma = require('../lib/prisma');
const { userHasAccessToTenant } = require('../lib/tenantAccess');

/**
 * Tenant Context Middleware
 * Attaches tenant information to request object
 * Must be used after authentication middleware
 */
const attachTenantContext = async (req, res, next) => {
  try {
    // Skip if no user (public routes)
    if (!req.user || !req.user.tenantId) {
      return next();
    }

    // Fetch tenant information
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true
      }
    });

    if (!tenant) {
      return res.status(403).json({
        success: false,
        message: 'Organization not found'
      });
    }

    if (!tenant.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Organization is inactive. Please contact support.'
      });
    }

    // Attach tenant to request
    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('Tenant context error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load organization context'
    });
  }
};

/**
 * Enforce Tenant Isolation
 * Ensures users can only access resources from tenants they belong to
 * Checks tenantId in request body, params, or query
 */
const enforceTenantIsolation = (paramName = 'tenantId') => {
  return async (req, res, next) => {
    try {
      // SUPER_ADMIN can access all tenants
      if (req.user && req.user.role === 'SUPER_ADMIN') {
        return next();
      }

      // Get requested tenantId from various sources
      const requestedTenantId =
        req.body?.[paramName] ||
        req.params?.[paramName] ||
        req.query?.[paramName];

      // If no tenantId in request, allow (will use user's current tenant)
      if (!requestedTenantId) {
        return next();
      }

      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const allowed = await userHasAccessToTenant(
        req.user.id,
        req.user.tenantId || null,
        requestedTenantId,
      );

      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have access to this organization.',
        });
      }

      return next();
    } catch (error) {
      console.error('enforceTenantIsolation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify organization access',
      });
    }
  };
};

/**
 * Ensure Tenant Scope
 * Automatically adds tenantId to request body if not present
 * Useful for create/update operations
 */
const ensureTenantScope = (req, res, next) => {
  // Skip for SUPER_ADMIN creating resources for other tenants
  if (req.user.role === 'SUPER_ADMIN' && req.body.tenantId) {
    return next();
  }

  // Automatically set tenantId to user's tenant
  if (req.user && req.user.tenantId) {
    req.body.tenantId = req.user.tenantId;
  }

  next();
};

/**
 * Validate Tenant Exists
 * Checks if tenant exists and is active
 */
const validateTenantExists = async (req, res, next) => {
  try {
    const tenantId = req.body.tenantId || req.params.tenantId || req.query.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required'
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    if (!tenant.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Organization is inactive'
      });
    }

    req.validatedTenant = tenant;
    next();
  } catch (error) {
    console.error('Tenant validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate organization'
    });
  }
};

/**
 * Tenant Admin Only
 * Ensures user is admin of the target tenant
 */
const tenantAdminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // SUPER_ADMIN can manage all tenants
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // Get target tenant ID
  const targetTenantId = req.body.tenantId || req.params.tenantId || req.user.tenantId;

  // Check if user is ADMIN in the target tenant
  if (req.user.role !== 'ADMIN' || req.user.tenantId !== targetTenantId) {
    return res.status(403).json({
      success: false,
      message: 'Administrator access required for this organization'
    });
  }

  next();
};

/**
 * Get Tenant Filter for Users
 * Returns Prisma where clause for filtering users by tenant
 * SUPER_ADMIN can see all users
 * Others can only see users from their own tenant
 */
const getTenantFilter = (user) => {
  // SUPER_ADMIN can see all users
  if (user.role === 'SUPER_ADMIN' || !user.tenantId) {
    return {};
  }

  // Others can only see users from their own tenant
  return { tenantId: user.tenantId };
};

/**
 * Get Tenant Filter for Tenants table
 * Returns Prisma where clause for filtering tenants
 * SUPER_ADMIN can see all tenants
 * Others can only see their own tenant
 */
const getTenantIdFilter = (user) => {
  // SUPER_ADMIN can see all tenants
  if (user.role === 'SUPER_ADMIN' || !user.tenantId) {
    return {};
  }

  // Others can only see their own tenant (filter by tenant id)
  return { id: user.tenantId };
};

module.exports = {
  attachTenantContext,
  enforceTenantIsolation,
  ensureTenantScope,
  validateTenantExists,
  tenantAdminOnly,
  getTenantFilter,
  getTenantIdFilter
};

