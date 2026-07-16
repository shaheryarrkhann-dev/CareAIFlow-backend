const express = require("express");
const router = express.Router();

const tenantController = require("../../controllers/tenant/tenant.controller");
const authenticate = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");
const { attachTenantContext } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const { apiLimiter } = require("../../middlewares/rateLimit.middleware");
const {
  createTenantValidator,
  updateTenantValidator,
  tenantIdValidator,
  paginationValidator,
} = require("../../validators/tenant.validators");

// All tenant routes require authentication
router.use(authenticate());
router.use(attachTenantContext);

/**
 * POST /api/tenants
 * Create new tenant
 * Requires: SUPER_ADMIN
 */
router.post(
  "/",
  apiLimiter,
  authorize("SUPER_ADMIN"),
  validate(createTenantValidator),
  tenantController.createTenant
);

/**
 * GET /api/tenants
 * Get all tenants (filtered by role)
 * SUPER_ADMIN: sees all
 * ADMIN: sees only their tenant
 * STAFF/GUARDIAN: sees only their tenant
 */
router.get("/", validate(paginationValidator), tenantController.getTenants);

/**
 * GET /api/tenants/:id
 * Get tenant by ID
 */
router.get("/:id", validate(tenantIdValidator), tenantController.getTenantById);

/**
 * PATCH /api/tenants/:id
 * Update tenant
 * Requires: SUPER_ADMIN or ADMIN (own tenant)
 */
router.patch(
  "/:id",
  apiLimiter,
  authorize("SUPER_ADMIN", "ADMIN"),
  validate([...tenantIdValidator, ...updateTenantValidator]),
  tenantController.updateTenant
);

/**
 * POST /api/tenants/:id/deactivate
 * Deactivate tenant
 * Requires: SUPER_ADMIN
 */
router.post(
  "/:id/deactivate",
  apiLimiter,
  authorize("SUPER_ADMIN"),
  validate(tenantIdValidator),
  tenantController.deactivateTenant
);

/**
 * POST /api/tenants/:id/activate
 * Activate tenant
 * Requires: SUPER_ADMIN
 */
router.post(
  "/:id/activate",
  apiLimiter,
  authorize("SUPER_ADMIN"),
  validate(tenantIdValidator),
  tenantController.activateTenant
);

/**
 * GET /api/tenants/:id/users
 * Get users in tenant
 * Requires: SUPER_ADMIN or ADMIN (own tenant)
 */
router.get(
  "/:id/users",
  authorize("SUPER_ADMIN", "ADMIN"),
  validate([...tenantIdValidator, ...paginationValidator]),
  tenantController.getTenantUsers
);

/**
 * GET /api/tenants/:id/stats
 * Get tenant statistics
 * Requires: SUPER_ADMIN or ADMIN (own tenant)
 */
router.get(
  "/:id/stats",
  authorize("SUPER_ADMIN", "ADMIN"),
  validate(tenantIdValidator),
  tenantController.getTenantStats
);

/**
 * DELETE /api/tenants/:id
 * Delete tenant/organization
 * Requires: SUPER_ADMIN
 * WARNING: This will permanently delete the tenant and all associated data
 */
router.delete(
  "/:id",
  apiLimiter,
  authorize("SUPER_ADMIN"),
  validate(tenantIdValidator),
  tenantController.deleteTenant
);

module.exports = router;
