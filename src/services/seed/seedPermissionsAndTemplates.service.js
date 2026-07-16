/**
 * Seed permissions and system role templates (from rolePermissionCatalog.data.js).
 * Used by GET|POST /api/seed/permissions-and-templates.
 */
const prisma = require("../../lib/prisma");
const {
  PERMISSIONS,
  SYSTEM_ROLE_TEMPLATES,
} = require("./rolePermissionCatalog.data");

/**
 * Seed permissions and role templates.
 * @param {{ dryRun?: boolean }} options - dryRun: if true, no DB writes; returns what would be done.
 * @returns {{ success: boolean, dryRun: boolean, permissions: { wouldUpsert: number }, templates: { wouldCreateOrUpdate: string[], templatePermissionCounts: Record<string, number> }, error?: string }}
 */
async function seedPermissionsAndTemplates(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const result = {
    success: true,
    dryRun,
    permissions: { wouldUpsert: PERMISSIONS.length },
    templates: { wouldCreateOrUpdate: [], templatePermissionCounts: {} },
  };

  try {
    if (dryRun) {
      result.permissions.message = `${PERMISSIONS.length} permissions would be upserted`;
      const allPerms = await prisma.permission.findMany({ select: { id: true, module: true, action: true } });
      const keyToId = new Map();
      for (const p of allPerms) keyToId.set(`${p.module}:${p.action}`, p.id);
      for (const t of SYSTEM_ROLE_TEMPLATES) {
        result.templates.wouldCreateOrUpdate.push(t.name);
        const permissionIds = t.permissionKeys === "ALL"
          ? allPerms.map((p) => p.id)
          : t.permissionKeys.map((k) => keyToId.get(k)).filter(Boolean);
        result.templates.templatePermissionCounts[t.name] = permissionIds.length;
        if (t.permissionKeys !== "ALL" && permissionIds.length !== t.permissionKeys.length) {
          const missing = t.permissionKeys.filter((k) => !keyToId.has(k));
          result.templates.missingPermissions = result.templates.missingPermissions || {};
          result.templates.missingPermissions[t.name] = missing;
        }
      }
      return result;
    }

    let permissionsUpserted = 0;
    for (const p of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { module_action: { module: p.module, action: p.action } },
        create: { module: p.module, action: p.action, name: p.name },
        update: { name: p.name },
      });
      permissionsUpserted++;
    }
    result.permissions.upserted = permissionsUpserted;

    const allPermissions = await prisma.permission.findMany({
      select: { id: true, module: true, action: true },
    });
    const keyToId = new Map();
    for (const p of allPermissions) {
      keyToId.set(`${p.module}:${p.action}`, p.id);
    }

    for (const t of SYSTEM_ROLE_TEMPLATES) {
      const permissionIds =
        t.permissionKeys === "ALL"
          ? allPermissions.map((p) => p.id)
          : t.permissionKeys.map((k) => keyToId.get(k)).filter(Boolean);

      if (t.permissionKeys !== "ALL" && permissionIds.length !== t.permissionKeys.length) {
        const missing = t.permissionKeys.filter((k) => !keyToId.has(k));
        console.warn(`Template "${t.name}": missing permissions: ${missing.join(", ")}`);
      }

      let role = await prisma.customRole.findFirst({
        where: { isSystemTemplate: true, name: t.name, tenantId: null },
        include: { rolePermissions: { select: { id: true } } },
      });
      if (role) {
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (t.description != null) {
          await prisma.customRole.update({
            where: { id: role.id },
            data: { description: t.description },
          });
        }
      } else {
        role = await prisma.customRole.create({
          data: {
            tenantId: null,
            name: t.name,
            description: t.description || null,
            isSystemTemplate: true,
            isActive: true,
          },
        });
      }
      if (permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
      result.templates.createdOrUpdated = result.templates.createdOrUpdated || [];
      result.templates.createdOrUpdated.push(t.name);
      result.templates.templatePermissionCounts = result.templates.templatePermissionCounts || {};
      result.templates.templatePermissionCounts[t.name] = permissionIds.length;
    }

    return result;
  } catch (error) {
    result.success = false;
    result.error = error.message;
    return result;
  }
}

module.exports = {
  seedPermissionsAndTemplates,
};
