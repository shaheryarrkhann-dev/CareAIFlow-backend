const prisma = require("../../lib/prisma");
const { getTenantIdFilter } = require("../../middlewares/tenant.middleware");

/**
 * Create new tenant/organization
 * Only SUPER_ADMIN can create tenants
 */
async function createTenant({ name, slug }) {
  // Check if slug already exists
  const existing = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existing) {
    throw new Error("Organization slug already exists");
  }

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      isActive: true,
    },
  });

  return tenant;
}

/**
 * Get all tenants (with filtering)
 */
async function getTenants(user, { page = 1, limit = 10, search = "", status }) {
  const skip = (page - 1) * limit;
  const tenantFilter = getTenantIdFilter(user);

  // Handle status filter (active/inactive)
  let isActiveFilter = undefined;
  if (status === "active") {
    isActiveFilter = true;
  } else if (status === "inactive") {
    isActiveFilter = false;
  }

  const where = {
    ...tenantFilter,
    ...(isActiveFilter !== undefined && { isActive: isActiveFilter }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    tenants,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get tenant by ID
 */
async function getTenantById(tenantId, user) {
  const tenantFilter = getTenantIdFilter(user);

  const tenant = await prisma.tenant.findFirst({
    where: {
      id: tenantId,
      ...tenantFilter,
    },
    include: {
      _count: {
        select: {
          users: true,
          refreshTokens: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new Error("Organization not found or access denied");
  }

  return tenant;
}

/**
 * Update tenant
 */
async function updateTenant(tenantId, updateData, user) {
  // Check access
  const existing = await getTenantById(tenantId, user);

  // Check slug uniqueness if being updated
  if (updateData.slug && updateData.slug !== existing.slug) {
    const slugExists = await prisma.tenant.findUnique({
      where: { slug: updateData.slug },
    });

    if (slugExists) {
      throw new Error("Organization slug already exists");
    }
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: updateData,
  });

  return tenant;
}

/**
 * Deactivate tenant
 */
async function deactivateTenant(tenantId, user) {
  // Only SUPER_ADMIN can deactivate tenants
  if (user.role !== "SUPER_ADMIN") {
    throw new Error("Only system administrators can deactivate organizations");
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: false },
  });

  return tenant;
}

/**
 * Activate tenant
 */
async function activateTenant(tenantId, user) {
  // Only SUPER_ADMIN can activate tenants
  if (user.role !== "SUPER_ADMIN") {
    throw new Error("Only system administrators can activate organizations");
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: true },
  });

  return tenant;
}

/**
 * Get tenant users
 */
async function getTenantUsers(tenantId, user, { page = 1, limit = 10 }) {
  // Ensure user has access to this tenant
  await getTenantById(tenantId, user);

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get tenant statistics
 */
async function getTenantStats(tenantId, user) {
  // Ensure user has access to this tenant
  await getTenantById(tenantId, user);

  const [
    totalUsers,
    activeUsers,
    adminUsers,
    staffUsers,
    guardianUsers,
    recentLogins,
  ] = await Promise.all([
    prisma.user.count({
      where: { tenantId },
    }),
    prisma.user.count({
      where: {
        tenantId,
        isActive: true,
      },
    }),
    prisma.user.count({
      where: { tenantId, role: "ADMIN" },
    }),
    prisma.user.count({
      where: { tenantId, role: "STAFF" },
    }),
    prisma.user.count({
      where: { tenantId, role: "GUARDIAN" },
    }),
    prisma.refreshToken.count({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    }),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
      byRole: {
        admin: adminUsers,
        staff: staffUsers,
        guardian: guardianUsers,
      },
    },
    activity: {
      loginsLast24Hours: recentLogins,
    },
  };
}

/**
 * Delete tenant/organization
 * Only SUPER_ADMIN can delete tenants
 * This will cascade delete all related data (users, tokens, embeddings, forms, etc.)
 */
async function deleteTenant(tenantId, user) {
  // Only SUPER_ADMIN can delete tenants
  if (user.role !== "SUPER_ADMIN") {
    throw new Error("Only system administrators can delete organizations");
  }

  // Check if tenant exists (basic query without counting to avoid missing table errors)
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error("Organization not found");
  }

  // Try to get counts of related data (will gracefully handle missing tables)
  let userCount = 0;
  let pdfEmbeddingsCount = 0;
  let formSchemasCount = 0;
  let formDraftsCount = 0;
  let pdfTemplatesCount = 0;

  try {
    userCount = await prisma.user.count({ where: { tenantId } });
  } catch (e) {
    // Table doesn't exist or other error - gracefully continue with 0 count
    console.log("Could not count users:", e.message);
  }

  try {
    pdfEmbeddingsCount = await prisma.pdfEmbedding.count({
      where: { tenantId },
    });
  } catch (e) {
    // Table doesn't exist or other error - gracefully continue with 0 count
    console.log("Could not count pdfEmbeddings:", e.message);
  }

  try {
    formSchemasCount = await prisma.formSchema.count({ where: { tenantId } });
  } catch (e) {
    // Table doesn't exist or other error - gracefully continue with 0 count
    console.log("Could not count formSchemas:", e.message);
  }

  try {
    formDraftsCount = await prisma.formDraft.count({ where: { tenantId } });
  } catch (e) {
    // Table doesn't exist or other error - gracefully continue with 0 count
    console.log("Could not count formDrafts:", e.message);
  }

  try {
    pdfTemplatesCount = await prisma.pdfTemplate.count({ where: { tenantId } });
  } catch (e) {
    // Table doesn't exist or other error - gracefully continue with 0 count
    console.log("Could not count pdfTemplates:", e.message);
  }

  // Delete the tenant (cascade delete will handle related records)
  await prisma.tenant.delete({
    where: { id: tenantId },
  });

  return {
    deletedTenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    },
    deletedRelatedData: {
      users: userCount,
      pdfEmbeddings: pdfEmbeddingsCount,
      formSchemas: formSchemasCount,
      formDrafts: formDraftsCount,
      pdfTemplates: pdfTemplatesCount,
    },
  };
}

module.exports = {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  deactivateTenant,
  activateTenant,
  getTenantUsers,
  getTenantStats,
  deleteTenant,
};
