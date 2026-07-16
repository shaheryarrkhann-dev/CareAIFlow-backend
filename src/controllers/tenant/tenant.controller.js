const { validationResult } = require("express-validator");
const tenantService = require("../../services/tenant/tenant.service");

/**
 * Handle validation errors
 */
function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const msg = first.msg || "Validation error";
    const field = first.param;
    const error = new Error(`${msg}${field ? ` (${field})` : ""}`);
    error.status = 400;
    throw error;
  }
}

/**
 * POST /api/tenants
 * Create new tenant (SUPER_ADMIN only)
 */
exports.createTenant = async (req, res, next) => {
  try {
    handleValidation(req);
    const { name, slug } = req.body;
    const tenant = await tenantService.createTenant({ name, slug });
    return res.status(201).json({
      success: true,
      tenant,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tenants
 * Get all tenants (with pagination and search)
 */
exports.getTenants = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;
    const result = await tenantService.getTenants(req.user, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      status,
    });
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tenants/:id
 * Get tenant by ID
 */
exports.getTenantById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenant = await tenantService.getTenantById(id, req.user);
    return res.json({
      success: true,
      tenant,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/tenants/:id
 * Update tenant
 */
exports.updateTenant = async (req, res, next) => {
  try {
    handleValidation(req);
    const { id } = req.params;
    const tenant = await tenantService.updateTenant(id, req.body, req.user);
    return res.json({
      success: true,
      tenant,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tenants/:id/deactivate
 * Deactivate tenant (SUPER_ADMIN only)
 */
exports.deactivateTenant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenant = await tenantService.deactivateTenant(id, req.user);
    return res.json({
      success: true,
      message: "Organization deactivated successfully",
      tenant,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tenants/:id/activate
 * Activate tenant (SUPER_ADMIN only)
 */
exports.activateTenant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenant = await tenantService.activateTenant(id, req.user);
    return res.json({
      success: true,
      message: "Organization activated successfully",
      tenant,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tenants/:id/users
 * Get tenant users
 */
exports.getTenantUsers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const result = await tenantService.getTenantUsers(id, req.user, {
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tenants/:id/stats
 * Get tenant statistics
 */
exports.getTenantStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stats = await tenantService.getTenantStats(id, req.user);
    return res.json({
      success: true,
      stats,
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteTenant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await tenantService.deleteTenant(id, req.user);
    return res.json({
      success: true,
      message: "Organization deleted successfully",
      ...result,
    });
  } catch (err) {
    next(err);
  }
};
