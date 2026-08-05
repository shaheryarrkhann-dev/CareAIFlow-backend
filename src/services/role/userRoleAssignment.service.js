const prisma = require("../../lib/prisma");

/**
 * Resolve tenantId for the target user (must be in caller's tenant unless SUPER_ADMIN).
 * @param {{ role: string, tenantId?: string }} caller
 * @param {string} targetUserTenantId
 * @returns {string|null}
 */
function resolveTenantId(caller, targetUserTenantId) {
  if (caller.role === "SUPER_ADMIN") return targetUserTenantId;
  if (caller.tenantId !== targetUserTenantId) return null;
  return targetUserTenantId;
}

/**
 * List role assignments for a user.
 * @param {string} userId
 * @param {string} tenantId - caller's tenant (user must belong to this tenant)
 * @returns {Promise<Array>}
 */
async function listAssignments(userId, tenantId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true },
  });
  if (!user || user.tenantId !== tenantId) return null;
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId, tenantId },
    include: {
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          isSystemTemplate: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ isPrimary: "desc" }, { assignedAt: "asc" }],
  });
  return assignments;
}

/**
 * Assign a role to a user. Role must be tenant-scoped and in the same tenant as the user.
 * @param {string} userId
 * @param {string} tenantId
 * @param {{ roleId: string, isPrimary?: boolean }} data
 * @param {string} assignedBy - caller user id
 * @returns {Promise<object>}
 */
async function assignRole(userId, tenantId, data, assignedBy) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true },
  });
  if (!user || user.tenantId !== tenantId) {
    throw new Error("User not found or access denied");
  }
  const role = await prisma.customRole.findUnique({
    where: { id: data.roleId },
    select: { id: true, tenantId: true, name: true, isSystemTemplate: true },
  });
  if (!role) throw new Error("Role not found");
  // System templates are global roles — allow assignment to any tenant's users
  if (!role.isSystemTemplate && role.tenantId !== tenantId) {
    throw new Error("Role does not belong to this organization");
  }
  const existing = await prisma.userRoleAssignment.findUnique({
    where: { userId_roleId: { userId, roleId: data.roleId } },
  });
  if (existing) throw new Error("User already has this role");
  const isPrimary = Boolean(data.isPrimary);
  if (isPrimary) {
    await prisma.userRoleAssignment.updateMany({
      where: { userId },
      data: { isPrimary: false },
    });
  }
  const assignment = await prisma.userRoleAssignment.create({
    data: {
      userId,
      roleId: data.roleId,
      tenantId,
      isPrimary,
      assignedBy,
    },
    include: {
      role: {
        select: { id: true, name: true, description: true, isSystemTemplate: true },
      },
    },
  });
  return assignment;
}

/**
 * Unassign a role from a user.
 * @param {string} userId
 * @param {string} roleId
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
async function unassignRole(userId, roleId, tenantId) {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: { userId, roleId, tenantId },
    include: { role: { select: { name: true } } },
  });
  if (!assignment) throw new Error("Assignment not found");
  await prisma.userRoleAssignment.delete({
    where: { id: assignment.id },
  });
  return { roleName: assignment.role?.name };
}

/**
 * Set primary role for a user.
 * @param {string} userId
 * @param {string} tenantId
 * @param {string} roleId
 * @returns {Promise<object>}
 */
async function setPrimaryRole(userId, tenantId, roleId) {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: { userId, roleId, tenantId },
    include: { role: { select: { id: true, name: true } } },
  });
  if (!assignment) throw new Error("User does not have this role assigned");
  await prisma.userRoleAssignment.updateMany({
    where: { userId },
    data: { isPrimary: false },
  });
  await prisma.userRoleAssignment.update({
    where: { id: assignment.id },
    data: { isPrimary: true },
  });
  return assignment;
}

module.exports = {
  resolveTenantId,
  listAssignments,
  assignRole,
  unassignRole,
  setPrimaryRole,
};
