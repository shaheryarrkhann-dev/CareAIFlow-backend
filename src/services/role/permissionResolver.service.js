const prisma = require("../../lib/prisma");

/**
 * Compute effective permissions for a user in a tenant.
 *
 * Resolution order:
 * 1. SUPER_ADMIN → all permissions (no tenant restriction).
 * 2. If user has any UserRoleAssignment in the tenant → union of permissions from assigned (non-template) roles.
 * 3. Else (no custom roles) → fallback by User.role enum:
 *    - ADMIN → all permissions; STAFF → Caregiver-like set; GUARDIAN → Read-only-like set.
 * See docs/MIGRATION_DEFAULT_PERMISSIONS.md for the full default mapping and optional migration.
 *
 * @param {string} userId
 * @param {string|null} tenantId
 * @param {"SUPER_ADMIN"|"ADMIN"|"STAFF"|"GUARDIAN"} roleEnum
 * @returns {Promise<Array<{ module: string, action: string }>>}
 */
async function getEffectivePermissions(userId, tenantId, roleEnum) {
  if (!userId) return [];

  // SUPER_ADMIN has all permissions; no tenant restriction
  if (roleEnum === "SUPER_ADMIN") {
    try {
      if (!prisma.permission) {
        console.warn(
          "[PermissionResolver] Permission model not found in Prisma client. Returning empty permissions.",
        );
        return [];
      }
      const all = await prisma.permission.findMany({
        select: { module: true, action: true },
      });
      return dedupeModuleActions(all);
    } catch (error) {
      console.error(
        "[PermissionResolver] Error fetching SUPER_ADMIN permissions:",
        error,
      );
      return [];
    }
  }

  // Resolve tenantId from user if not provided (e.g. token missing tenantId); ADMIN/STAFF/GUARDIAN are tenant-scoped
  if (!tenantId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });
    tenantId = user?.tenantId ?? null;
  }
  if (!tenantId) {
    return [];
  }

  // 1) Custom roles via UserRoleAssignment
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      userId,
      tenantId,
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  const directPermissions = [];
  let hasCustomRoleAssignment = false;

  for (const a of assignments) {
    if (!a.role || a.role.isSystemTemplate) continue;
    hasCustomRoleAssignment = true;
    for (const rp of a.role.rolePermissions || []) {
      if (rp.permission) {
        directPermissions.push({
          module: rp.permission.module,
          action: rp.permission.action,
        });
      }
    }
  }

  if (directPermissions.length > 0) {
    return dedupeModuleActions(directPermissions);
  }

  // If the user has a custom role assigned with zero permissions:
  // - ADMIN/STAFF: still grant enum fallback (full access). Admin/Staff type means full access
  //   by default; a role with no permissions configured should not lock them out.
  // - GUARDIAN/other: return [] (explicit restricted role = no access).
  if (hasCustomRoleAssignment) {
    if (roleEnum === "ADMIN") return await getAdminFallbackPermissions();
    if (roleEnum === "STAFF") return await getStaffFallbackPermissions();
    return [];
  }

  // 2) No custom roles at all → fallback to enum-based defaults (backward compat
  //    for users that pre-date the custom-roles system).
  switch (roleEnum) {
    case "ADMIN":
      return await getAdminFallbackPermissions();
    case "STAFF":
      return await getStaffFallbackPermissions();
    case "GUARDIAN":
      return getGuardianFallbackPermissions();
    default:
      return [];
  }
}

function dedupeModuleActions(entries) {
  const seen = new Set();
  const result = [];
  for (const e of entries) {
    const key = `${e.module}:${e.action}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ module: e.module, action: e.action });
  }
  return result;
}

/**
 * ADMIN fallback: effectively full tenant-level access.
 * Map to all permissions.
 */
async function getAdminFallbackPermissions() {
  try {
    // Check if permission model exists
    if (!prisma.permission) {
      console.warn(
        "[PermissionResolver] Permission model not found in Prisma client. Returning empty permissions.",
      );
      return [];
    }
    const all = await prisma.permission.findMany({
      select: { module: true, action: true },
    });
    return dedupeModuleActions(all);
  } catch (error) {
    console.error(
      "[PermissionResolver] Error fetching admin permissions:",
      error,
    );
    // Return empty array on error - this will cause permission checks to fail
    // but won't crash the server
    return [];
  }
}

/**
 * STAFF fallback: full access (same as ADMIN) to maintain backward compatibility.
 * Previously STAFF had full access, so we maintain that behavior.
 */
async function getStaffFallbackPermissions() {
  // Return all permissions (same as ADMIN) to maintain backward compatibility
  try {
    if (!prisma.permission) {
      console.warn(
        "[PermissionResolver] Permission model not found in Prisma client. Returning empty permissions.",
      );
      return [];
    }
    const all = await prisma.permission.findMany({
      select: { module: true, action: true },
    });
    return dedupeModuleActions(all);
  } catch (error) {
    console.error(
      "[PermissionResolver] Error fetching staff permissions:",
      error,
    );
    return [];
  }
}

/**
 * GUARDIAN fallback: align with Read-only template.
 */
function getGuardianFallbackPermissions() {
  const keys = [
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
    "ADMINISTRATION:view_users",
    "ADMINISTRATION:view_audit",
    "FORMS:view",
    "COMPLIANCE:view",
  ];
  return keys.map((k) => {
    const [module, action] = k.split(":");
    return { module, action };
  });
}

module.exports = {
  getEffectivePermissions,
};
