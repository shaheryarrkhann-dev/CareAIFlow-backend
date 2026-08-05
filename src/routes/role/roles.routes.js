const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const {
  attachTenantContext,
  enforceTenantIsolation,
} = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const roleController = require("../../controllers/role/role.controller");
const {
  roleIdParam,
  createRoleValidator,
  updateRoleValidator,
  setPermissionsValidator,
  listRolesQuery,
  fromTemplateValidator,
} = require("../../validators/role.validators");

router.use(authenticate());
router.use(attachTenantContext);
// Permission-based: only require manage_roles (replaces role enum check)
router.use(requirePermission("ADMINISTRATION", "manage_roles"));

/**
 * GET /api/roles/templates
 * List system role templates (Admin, Nurse, Caregiver, Billing, Read-only)
 */
router.get("/templates", roleController.listTemplates);

/**
 * POST /api/roles/from-template
 * Create a tenant role by cloning a template. Body: { templateRoleId, name?, tenantId? }
 */
router.post(
  "/from-template",
  enforceTenantIsolation("tenantId"),
  validate(fromTemplateValidator),
  roleController.createRoleFromTemplate
);

/**
 * GET /api/roles
 * List roles for tenant. Query: tenantId (SUPER_ADMIN), isActive
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(listRolesQuery),
  roleController.listRoles
);

/**
 * POST /api/roles
 * Create role. Body: name, description?, tenantId? (SUPER_ADMIN)
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(createRoleValidator),
  roleController.createRole
);

/**
 * GET /api/roles/:id
 * Get role by ID with permissions
 */
router.get(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(roleIdParam),
  roleController.getRoleById
);

/**
 * PATCH /api/roles/:id
 * Update role name/description/isActive
 */
router.patch(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(updateRoleValidator),
  roleController.updateRole
);

/**
 * DELETE /api/roles/:id
 * Delete role (fails if any user assigned)
 */
router.delete(
  "/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(roleIdParam),
  roleController.deleteRole
);

/**
 * PUT /api/roles/:id/permissions
 * Set permissions for role (replace full set). Body: { permissionIds: string[] }
 */
router.put(
  "/:id/permissions",
  enforceTenantIsolation("tenantId"),
  validate(setPermissionsValidator),
  roleController.setRolePermissions
);

module.exports = router;
