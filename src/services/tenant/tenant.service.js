const prisma = require("../../lib/prisma");
const { getTenantIdFilter } = require("../../middlewares/tenant.middleware");
const facilityFolderService = require("../facility/facility-folder.service");
const facilityService = require("../facility/facility.service");
const { buildPublicS3ObjectUrl } = require("../../utils/s3.util");

function attachFacilityDisplayUrl(facility) {
  if (!facility) return null;
  const profilePhotoDisplayUrl =
    (facility.profilePhotoUrl && facility.profilePhotoUrl.trim()) ||
    buildPublicS3ObjectUrl(facility.profilePhotoS3Key) ||
    null;
  return { ...facility, profilePhotoDisplayUrl };
}

/**
 * Create new tenant/organization and its first facility (same profile fields as facility create).
 * Only SUPER_ADMIN can create tenants.
 * @param {Object} input - name, slug, plus optional facilityName, licenseNumber, address, capacity, licenseExpirationDate, contactInformation, contactEmail, website, profilePhotoUrl
 */
async function createTenant(input) {
  const name = String(input.name || "").trim();
  const slug = String(input.slug || "").trim();
  if (!name || !slug) {
    throw new Error("Organization name and slug are required");
  }

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

  const facilityDisplayName =
    (input.facilityName && String(input.facilityName).trim()) || name;

  const cap = input.capacity;
  let capacityVal = null;
  if (cap !== undefined && cap !== null && cap !== "") {
    const n = parseInt(String(cap), 10);
    if (Number.isFinite(n)) capacityVal = n;
  }

  const facility = await prisma.facility.create({
    data: {
      tenantId: tenant.id,
      name: facilityDisplayName,
      licenseNumber: input.licenseNumber?.trim() || null,
      address: input.address?.trim() || null,
      capacity: capacityVal,
      licenseExpirationDate: input.licenseExpirationDate
        ? new Date(input.licenseExpirationDate)
        : null,
      profilePhotoUrl: input.profilePhotoUrl?.trim() || null,
      contactInformation: input.contactInformation?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      website: input.website?.trim() || null,
    },
  });

  try {
    await facilityFolderService.ensureDefaultFacilityFolders(facility.id);
  } catch (folderErr) {
    console.error(
      "[createTenant] Failed to create default facility folders:",
      folderErr?.message
    );
  }

  return { tenant, facility };
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

  const row = await prisma.tenant.findFirst({
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
      facilities: {
        orderBy: { createdAt: "asc" },
        take: 1,
        select: {
          id: true,
          name: true,
          licenseNumber: true,
          address: true,
          capacity: true,
          licenseExpirationDate: true,
          profilePhotoUrl: true,
          profilePhotoS3Key: true,
          contactInformation: true,
          contactEmail: true,
          website: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!row) {
    throw new Error("Organization not found or access denied");
  }

  const { facilities = [], ...rest } = row;
  const primaryFacility = facilities[0]
    ? attachFacilityDisplayUrl(facilities[0])
    : null;

  return { ...rest, primaryFacility };
}

/**
 * Update tenant
 */
async function updateTenant(tenantId, updateData, user) {
  const existing = await getTenantById(tenantId, user);

  const nextSlug =
    updateData.slug !== undefined
      ? String(updateData.slug).trim()
      : existing.slug;
  if (nextSlug && nextSlug !== existing.slug) {
    const slugExists = await prisma.tenant.findUnique({
      where: { slug: nextSlug },
    });

    if (slugExists) {
      throw new Error("Organization slug already exists");
    }
  }

  const tenantData = {};
  if (updateData.name !== undefined) {
    tenantData.name = String(updateData.name).trim();
  }
  if (updateData.slug !== undefined) {
    tenantData.slug = String(updateData.slug).trim();
  }

  let tenantRow = null;
  if (Object.keys(tenantData).length > 0) {
    tenantRow = await prisma.tenant.update({
      where: { id: tenantId },
      data: tenantData,
    });
  }

  const effectiveTenantName = tenantRow?.name ?? existing.name;

  const facilityFieldKeys = [
    "facilityName",
    "licenseNumber",
    "address",
    "capacity",
    "licenseExpirationDate",
    "contactInformation",
    "contactEmail",
    "website",
    "profilePhotoUrl",
  ];
  const hasFacilityUpdate = facilityFieldKeys.some(
    (k) => Object.prototype.hasOwnProperty.call(updateData, k)
  );

  let facility = null;
  if (hasFacilityUpdate && existing.primaryFacility) {
    const fu = {};
    if (Object.prototype.hasOwnProperty.call(updateData, "facilityName")) {
      const fn =
        updateData.facilityName != null &&
        String(updateData.facilityName).trim();
      fu.name = fn || effectiveTenantName;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "licenseNumber")) {
      fu.licenseNumber =
        updateData.licenseNumber != null &&
        String(updateData.licenseNumber).trim()
          ? String(updateData.licenseNumber).trim()
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "address")) {
      fu.address =
        updateData.address != null && String(updateData.address).trim()
          ? String(updateData.address).trim()
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "capacity")) {
      const cap = updateData.capacity;
      if (cap === null || cap === undefined || cap === "") {
        fu.capacity = null;
      } else {
        const n = parseInt(String(cap), 10);
        fu.capacity = Number.isFinite(n) ? n : null;
      }
    }
    if (
      Object.prototype.hasOwnProperty.call(updateData, "licenseExpirationDate")
    ) {
      const led = updateData.licenseExpirationDate;
      fu.licenseExpirationDate =
        led == null || led === ""
          ? null
          : String(led).trim() || null;
    }
    if (
      Object.prototype.hasOwnProperty.call(updateData, "contactInformation")
    ) {
      fu.contactInformation =
        updateData.contactInformation != null &&
        String(updateData.contactInformation).trim()
          ? String(updateData.contactInformation).trim()
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "contactEmail")) {
      fu.contactEmail =
        updateData.contactEmail != null &&
        String(updateData.contactEmail).trim()
          ? String(updateData.contactEmail).trim()
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "website")) {
      fu.website =
        updateData.website != null && String(updateData.website).trim()
          ? String(updateData.website).trim()
          : null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "profilePhotoUrl")) {
      fu.profilePhotoUrl =
        updateData.profilePhotoUrl != null &&
        String(updateData.profilePhotoUrl).trim()
          ? String(updateData.profilePhotoUrl).trim()
          : null;
    }

    if (Object.keys(fu).length > 0) {
      facility = await facilityService.updateFacility(
        tenantId,
        existing.primaryFacility.id,
        fu
      );
    }
  }

  const refreshed = await getTenantById(tenantId, user);
  return { tenant: refreshed, facility };
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
