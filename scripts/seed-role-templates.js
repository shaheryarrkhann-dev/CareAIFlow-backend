/**
 * Seed system role templates (Nurse, Caregiver, Billing, Read-only).
 * Does not seed an "Admin" custom role — org admins use legacy User.role = ADMIN at invite.
 * Run after seed-permissions.js. From project root: node scripts/seed-role-templates.js
 */
const { PrismaClient } = require("@prisma/client");
const { SYSTEM_ROLE_TEMPLATES } = require("../src/services/seed/rolePermissionCatalog.data");
const prisma = new PrismaClient();

/** Retire deprecated Admin system template from older seeds. */
async function retireAdminSystemTemplate() {
  const adminTemplate = await prisma.customRole.findFirst({
    where: { isSystemTemplate: true, name: "Admin", tenantId: null },
    include: { _count: { select: { userRoleAssignments: true } } },
  });
  if (!adminTemplate) return;

  if (adminTemplate._count.userRoleAssignments > 0) {
    await prisma.customRole.update({
      where: { id: adminTemplate.id },
      data: { isActive: false },
    });
    console.log(
      'Deprecated "Admin" template deactivated (still assigned to users — use legacy ADMIN or reassign).'
    );
    return;
  }

  await prisma.rolePermission.deleteMany({ where: { roleId: adminTemplate.id } });
  await prisma.customRole.delete({ where: { id: adminTemplate.id } });
  console.log('Removed deprecated "Admin" system template.');
}

async function main() {
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
        : t.permissionKeys
            .map((k) => keyToId.get(k))
            .filter(Boolean);
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
    console.log(`Template "${t.name}": ${permissionIds.length} permissions`);
  }

  await retireAdminSystemTemplate();
  console.log("Role templates seeded.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
