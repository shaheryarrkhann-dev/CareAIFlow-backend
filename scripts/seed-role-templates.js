/**
 * Seed system role templates (Admin, Nurse, Caregiver, Billing, Read-only / auditor).
 * Run after seed-permissions.js. From project root: node scripts/seed-role-templates.js
 */
const { PrismaClient } = require("@prisma/client");
const { SYSTEM_ROLE_TEMPLATES } = require("../src/services/seed/rolePermissionCatalog.data");
const prisma = new PrismaClient();

// Permission keys: "module:action". Use "ALL" for Admin to mean all permissions.
const TEMPLATES = [
  {
    name: "Admin",
    description: "Full access to all modules and settings for the organization",
    permissionKeys: "ALL",
  },
  {
    name: "Nurse",
    description: "Clinical and care documentation; no billing or role management",
    permissionKeys: [
      "RESIDENTS:view", "RESIDENTS:create", "RESIDENTS:update", "RESIDENTS:manage_documents",
      "PROGRESS_NOTES:view", "PROGRESS_NOTES:create", "PROGRESS_NOTES:update", "PROGRESS_NOTES:delete", "PROGRESS_NOTES:export",
      "INCIDENT_REPORTS:view", "INCIDENT_REPORTS:create", "INCIDENT_REPORTS:update", "INCIDENT_REPORTS:delete", "INCIDENT_REPORTS:export",
      "EMAR:view", "EMAR:create", "EMAR:update", "EMAR:delete", "EMAR:export",
      "BEHAVIORAL:view", "BEHAVIORAL:create", "BEHAVIORAL:update", "BEHAVIORAL:delete", "BEHAVIORAL:export",
      "NCP:view", "NCP:create", "NCP:update", "NCP:delete", "NCP:download_docx",
      "CARE_PLANS:view", "CARE_PLANS:create", "CARE_PLANS:update", "CARE_PLANS:approve", "CARE_PLANS:export",
      "FACILITY:view", "FACILITY:manage_documents",
      "STAFF:view",
      "ORGANIZATION:view", "ORGANIZATION:update",
      "ADMINISTRATION:view_users", "ADMINISTRATION:view_audit",
      "FORMS:view", "FORMS:create", "FORMS:update", "FORMS:submit",
      "COMPLIANCE:view",
    ],
  },
  {
    name: "Caregiver",
    description: "Direct care and documentation; limited to view/create in key modules",
    permissionKeys: [
      "RESIDENTS:view", "RESIDENTS:update", "RESIDENTS:manage_documents",
      "PROGRESS_NOTES:view", "PROGRESS_NOTES:create",
      "INCIDENT_REPORTS:view", "INCIDENT_REPORTS:create",
      "EMAR:view", "EMAR:create",
      "BEHAVIORAL:view", "BEHAVIORAL:create",
      "FACILITY:view",
      "STAFF:view",
      "ORGANIZATION:view",
      "ADMINISTRATION:view_audit",
      "FORMS:view", "FORMS:submit",
      "COMPLIANCE:view",
    ],
  },
  {
    name: "Billing",
    description: "Billing and claims; view residents and audit only",
    permissionKeys: [
      "RESIDENTS:view",
      "BILLING:view", "BILLING:create", "BILLING:update", "BILLING:delete",
      "CLAIMS_BILLING:view", "CLAIMS_BILLING:create", "CLAIMS_BILLING:update", "CLAIMS_BILLING:delete", "CLAIMS_BILLING:export", "CLAIMS_BILLING:manage_provider",
      "ORGANIZATION:view",
      "ADMINISTRATION:view_users", "ADMINISTRATION:view_audit",
      "COMPLIANCE:view",
    ],
  },
  {
    name: "Read-only",
    description: "View-only access across all modules; audit and user list",
    permissionKeys: [
      "RESIDENTS:view",
      "PROGRESS_NOTES:view",
      "INCIDENT_REPORTS:view",
      "EMAR:view",
      "BEHAVIORAL:view",
      "NCP:view",
      "CARE_PLANS:view",
      "BILLING:view",
      "CLAIMS_BILLING:view",
      "FACILITY:view",
      "STAFF:view",
      "ORGANIZATION:view",
      "ADMINISTRATION:view_users", "ADMINISTRATION:view_audit",
      "FORMS:view",
      "COMPLIANCE:view",
    ],
  },
];

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
  console.log("Role templates seeded.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
