/**
 * Optional one-time migration: assign existing users (with no custom role assignments)
 * to tenant-scoped roles cloned from system templates, based on User.role enum.
 *
 * Mapping: ADMIN → Admin, STAFF → Caregiver, GUARDIAN → Read-only.
 * SUPER_ADMIN and users without tenantId are skipped.
 *
 * Run after seed-permissions.js and seed-role-templates.js.
 * From project root: node scripts/migrate-users-to-template-roles.js [--dry-run]
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

// Template names we need for mapping (must match seed-role-templates.js)
const TEMPLATE_NAMES = {
  ADMIN: "Admin",
  STAFF: "Caregiver", // or "Nurse" if you prefer
  GUARDIAN: "Read-only",
};

/**
 * Get system template by name.
 */
async function getSystemTemplateByName(name) {
  return prisma.customRole.findFirst({
    where: { name, isSystemTemplate: true, tenantId: null },
    include: { rolePermissions: { select: { permissionId: true } } },
  });
}

/**
 * Find or create a tenant-scoped role cloned from the given system template.
 * Returns the tenant role (existing or newly created).
 */
async function getOrCreateTenantRoleFromTemplate(tenantId, template, dryRun) {
  const existing = await prisma.customRole.findFirst({
    where: { tenantId, name: template.name, isSystemTemplate: false },
  });
  if (existing) return existing;

  if (dryRun) {
    return { id: "(would create)", name: template.name, tenantId };
  }

  const permissionIds = template.rolePermissions.map((rp) => rp.permissionId);
  const role = await prisma.customRole.create({
    data: {
      tenantId,
      name: template.name,
      description: template.description ? `Based on ${template.name} template` : null,
      isSystemTemplate: false,
      isActive: true,
    },
  });
  if (permissionIds.length > 0) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
  return prisma.customRole.findUnique({ where: { id: role.id } });
}

async function main() {
  if (DRY_RUN) {
    console.log("--- DRY RUN (no changes will be written) ---\n");
  }

  const templates = {
    Admin: await getSystemTemplateByName(TEMPLATE_NAMES.ADMIN),
    Caregiver: await getSystemTemplateByName(TEMPLATE_NAMES.STAFF),
    ReadOnly: await getSystemTemplateByName(TEMPLATE_NAMES.GUARDIAN),
  };

  if (!templates.Admin || !templates.Caregiver || !templates.ReadOnly) {
    console.error("Missing system templates. Run: node scripts/seed-role-templates.js");
    process.exit(1);
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    where: { isActive: true },
  });
  console.log(`Found ${tenants.length} active tenant(s).\n`);

  let totalAssigned = 0;

  for (const tenant of tenants) {
    const tenantId = tenant.id;
    const adminRole = await getOrCreateTenantRoleFromTemplate(tenantId, templates.Admin, DRY_RUN);
    const caregiverRole = await getOrCreateTenantRoleFromTemplate(tenantId, templates.Caregiver, DRY_RUN);
    const readOnlyRole = await getOrCreateTenantRoleFromTemplate(tenantId, templates.ReadOnly, DRY_RUN);

    const usersInTenant = await prisma.user.findMany({
      where: { tenantId, role: { in: ["ADMIN", "STAFF", "GUARDIAN"] } },
      select: { id: true, email: true, name: true, role: true },
    });

    for (const user of usersInTenant) {
      const existingCount = await prisma.userRoleAssignment.count({
        where: { userId: user.id, tenantId },
      });
      if (existingCount > 0) continue;

      let roleId;
      let roleLabel;
      if (user.role === "ADMIN") {
        roleId = adminRole.id;
        roleLabel = TEMPLATE_NAMES.ADMIN;
      } else if (user.role === "STAFF") {
        roleId = caregiverRole.id;
        roleLabel = TEMPLATE_NAMES.STAFF;
      } else if (user.role === "GUARDIAN") {
        roleId = readOnlyRole.id;
        roleLabel = TEMPLATE_NAMES.GUARDIAN;
      } else continue;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would assign ${user.email} (${user.role}) → ${roleLabel}`);
        totalAssigned++;
        continue;
      }

      await prisma.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId,
          tenantId,
          isPrimary: true,
          assignedBy: null,
        },
      });
      console.log(`Assigned ${user.email} (${user.role}) to tenant role.`);
      totalAssigned++;
    }
  }

  console.log(`\nDone. Total users assigned to a template-based role: ${totalAssigned}`);
  if (DRY_RUN) {
    console.log("Re-run without --dry-run to apply changes.");
  }
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
