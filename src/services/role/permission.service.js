const prisma = require("../../lib/prisma");

/**
 * List permissions, optionally filtered by module.
 * @param {{ module?: string }} options
 * @returns {Promise<Array<{ id: string, module: string, action: string, name: string | null }>>}
 */
async function listPermissions(options = {}) {
  const where = {};
  if (options.module) {
    where.module = options.module;
  }
  const list = await prisma.permission.findMany({
    where,
    orderBy: [{ module: "asc" }, { action: "asc" }],
    select: { id: true, module: true, action: true, name: true },
  });
  return list;
}

/**
 * Get permission by ID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getPermissionById(id) {
  return prisma.permission.findUnique({
    where: { id },
  });
}

/**
 * Validate that all permission IDs exist.
 * @param {string[]} permissionIds
 * @returns {Promise<{ valid: boolean, missing: string[] }>}
 */
async function validatePermissionIds(permissionIds) {
  if (!permissionIds || permissionIds.length === 0) {
    return { valid: true, missing: [] };
  }
  const found = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((p) => p.id));
  const missing = permissionIds.filter((id) => !foundIds.has(id));
  return { valid: missing.length === 0, missing };
}

module.exports = {
  listPermissions,
  getPermissionById,
  validatePermissionIds,
};
