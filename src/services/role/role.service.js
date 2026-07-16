const prisma = require("../../lib/prisma");
const { validatePermissionIds } = require("./permission.service");

/**
 * Resolve tenantId for role operations. SUPER_ADMIN can pass tenantId in body/query.
 * @param {{ tenantId?: string, role?: string }} user - req.user
 * @param {{ tenantId?: string }} bodyOrQuery
 * @returns {string|null}
 */
function resolveTenantId(user, bodyOrQuery = {}) {
  if (user.role === "SUPER_ADMIN" && bodyOrQuery.tenantId) {
    return bodyOrQuery.tenantId;
  }
  return user.tenantId || null;
}

/**
 * List roles for a tenant (custom roles only; system templates are listed via getTemplates).
 * @param {string} tenantId
 * @param {{ isActive?: boolean }} options
 * @returns {Promise<Array>}
 */
async function listRoles(tenantId, options = {}) {
  const where = { tenantId, isSystemTemplate: false };
  if (options.isActive !== undefined) {
    where.isActive = options.isActive;
  }
  return prisma.customRole.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { rolePermissions: true, userRoleAssignments: true } },
    },
  });
}

/**
 * List all tenant custom roles (SUPER_ADMIN: no single-tenant scope).
 * @param {{ isActive?: boolean }} options
 */
async function listAllCustomRolesForSuperAdmin(options = {}) {
  const where = { isSystemTemplate: false };
  if (options.isActive !== undefined) {
    where.isActive = options.isActive;
  }
  return prisma.customRole.findMany({
    where,
    orderBy: [{ tenantId: "asc" }, { name: "asc" }],
    include: {
      tenant: { select: { id: true, name: true } },
      _count: { select: { rolePermissions: true, userRoleAssignments: true } },
    },
  });
}

/**
 * Get role by ID with permissions. Ensures role belongs to tenant (or is system template).
 * @param {string} roleId
 * @param {string} tenantId - caller's tenant (for tenant-scoped roles)
 * @param {{ superAdmin?: boolean }} options - When true, tenantId check is skipped except optional filter tenantId
 * @returns {Promise<object|null>}
 */
async function getRoleById(roleId, tenantId, options = {}) {
  const { superAdmin = false } = options;
  const role = await prisma.customRole.findUnique({
    where: { id: roleId },
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { userRoleAssignments: true } },
    },
  });
  if (!role) return null;
  // Tenant-scoped role must belong to caller's tenant; system template is readable by all
  if (!role.isSystemTemplate) {
    if (!superAdmin) {
      if (!tenantId || role.tenantId !== tenantId) return null;
    } else if (tenantId != null && role.tenantId !== tenantId) {
      return null;
    }
  }
  // Normalize to permissions array for response
  const permissions = (role.rolePermissions || []).map((rp) => rp.permission);
  return { ...role, permissions };
}

/**
 * Create a tenant-scoped role.
 * @param {string} tenantId
 * @param {{ name: string, description?: string }} data
 * @returns {Promise<object>}
 */
async function createRole(tenantId, data) {
  const existing = await prisma.customRole.findFirst({
    where: { tenantId, name: data.name.trim(), isSystemTemplate: false },
  });
  if (existing) {
    throw new Error("A role with this name already exists for this organization");
  }
  return prisma.customRole.create({
    data: {
      tenantId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      isSystemTemplate: false,
      isActive: true,
    },
    include: { _count: { select: { rolePermissions: true } } },
  });
}

/**
 * Update role name/description. Cannot update system templates.
 * @param {string} roleId
 * @param {string} tenantId
 * @param {{ name?: string, description?: string, isActive?: boolean }} data
 * @param {{ superAdmin?: boolean }} options
 * @returns {Promise<object>}
 */
async function updateRole(roleId, tenantId, data, options = {}) {
  const { superAdmin = false } = options;
  const role = await prisma.customRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { userRoleAssignments: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role.isSystemTemplate) throw new Error("System template roles cannot be updated");
  if (!superAdmin) {
    if (!tenantId || role.tenantId !== tenantId) throw new Error("Access denied to this role");
  } else if (tenantId != null && role.tenantId !== tenantId) {
    throw new Error("Access denied to this role");
  }
  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  return prisma.customRole.update({
    where: { id: roleId },
    data: updateData,
    include: { _count: { select: { rolePermissions: true, userRoleAssignments: true } } },
  });
}

/**
 * Delete role. Fails if any user is assigned. Cannot delete system templates.
 * @param {string} roleId
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
async function deleteRole(roleId, tenantId, options = {}) {
  const { superAdmin = false } = options;
  const role = await prisma.customRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { userRoleAssignments: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role.isSystemTemplate) throw new Error("System template roles cannot be deleted");
  if (!superAdmin) {
    if (!tenantId || role.tenantId !== tenantId) throw new Error("Access denied to this role");
  } else if (tenantId != null && role.tenantId !== tenantId) {
    throw new Error("Access denied to this role");
  }
  if (role._count.userRoleAssignments > 0) {
    throw new Error("Cannot delete role: one or more users are assigned to this role");
  }
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  return prisma.customRole.delete({ where: { id: roleId } });
}

/**
 * Set permissions for a role (replace full set). Cannot modify system template permissions via this API (only tenant copies).
 * @param {string} roleId
 * @param {string} tenantId
 * @param {string[]} permissionIds
 * @returns {Promise<{ role: object, added: number, removed: number }>}
 */
async function setRolePermissions(roleId, tenantId, permissionIds, options = {}) {
  const { superAdmin = false } = options;
  const role = await prisma.customRole.findUnique({
    where: { id: roleId },
    include: { rolePermissions: { select: { permissionId: true } } },
  });
  if (!role) throw new Error("Role not found");
  if (role.isSystemTemplate) throw new Error("Cannot change permissions on a system template; create a copy first");
  if (!superAdmin) {
    if (!tenantId || role.tenantId !== tenantId) throw new Error("Access denied to this role");
  } else if (tenantId != null && role.tenantId !== tenantId) {
    throw new Error("Access denied to this role");
  }
  const { valid, missing } = await validatePermissionIds(permissionIds);
  if (!valid) throw new Error(`Invalid permission IDs: ${missing.join(", ")}`);
  const currentIds = new Set(role.rolePermissions.map((rp) => rp.permissionId));
  const newIds = new Set(permissionIds);
  const toAdd = [...newIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !newIds.has(id));
  if (toRemove.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: { roleId, permissionId: { in: toRemove } },
    });
  }
  if (toAdd.length > 0) {
    await prisma.rolePermission.createMany({
      data: toAdd.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }
  const updated = await prisma.customRole.findUnique({
    where: { id: roleId },
    include: { rolePermissions: { include: { permission: true } } },
  });
  return {
    role: updated,
    added: toAdd.length,
    removed: toRemove.length,
  };
}

/**
 * List system role templates (isSystemTemplate = true, tenantId = null).
 * @returns {Promise<Array>}
 */
async function getTemplates() {
  return prisma.customRole.findMany({
    where: { isSystemTemplate: true, tenantId: null },
    orderBy: { name: "asc" },
    include: {
      rolePermissions: { include: { permission: true } },
      _count: { select: { rolePermissions: true } },
    },
  });
}

/**
 * Create a tenant-scoped role by cloning a system template's permissions.
 * @param {string} tenantId
 * @param {{ templateRoleId: string, name?: string }} data
 * @returns {Promise<object>} Created role with permissions
 */
async function createRoleFromTemplate(tenantId, data) {
  const template = await prisma.customRole.findUnique({
    where: { id: data.templateRoleId },
    include: { rolePermissions: { select: { permissionId: true } } },
  });
  if (!template) throw new Error("Template role not found");
  if (!template.isSystemTemplate) {
    throw new Error("Source role is not a system template");
  }
  const name = (data.name && data.name.trim()) || template.name;
  const existing = await prisma.customRole.findFirst({
    where: { tenantId, name, isSystemTemplate: false },
  });
  if (existing) {
    throw new Error("A role with this name already exists for this organization");
  }
  const permissionIds = template.rolePermissions.map((rp) => rp.permissionId);
  const role = await prisma.customRole.create({
    data: {
      tenantId,
      name,
      description: template.description ? `Based on ${template.name} template` : null,
      isSystemTemplate: false,
      isActive: true,
    },
    include: { _count: { select: { rolePermissions: true } } },
  });
  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
  const withPerms = await prisma.customRole.findUnique({
    where: { id: role.id },
    include: { rolePermissions: { include: { permission: true } } },
  });
  return { ...withPerms, permissions: withPerms.rolePermissions.map((rp) => rp.permission) };
}

module.exports = {
  resolveTenantId,
  listRoles,
  listAllCustomRolesForSuperAdmin,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  setRolePermissions,
  getTemplates,
  createRoleFromTemplate,
};
