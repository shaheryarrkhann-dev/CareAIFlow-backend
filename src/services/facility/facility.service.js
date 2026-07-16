const prisma = require("../../lib/prisma");
const { nanoid } = require("nanoid");
const {
  uploadFacilityProfilePhotoToS3,
  deleteFileFromS3,
} = require("../../utils/s3.util");

/**
 * Get or resolve facility for tenant.
 * - When facilityId provided: return that facility (verify tenant ownership)
 * - When facilityId not provided: return first facility, or create one if none exists (backward compat)
 * @param {string} tenantId - Tenant ID
 * @param {string} [facilityId] - Optional facility ID (from query/body)
 * @returns {Promise<Object>} Facility record
 */
async function getOrCreateFacility(tenantId, facilityId) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  if (facilityId) {
    const facility = await prisma.facility.findFirst({
      where: { id: facilityId, tenantId },
    });
    if (!facility) throw new Error("Facility not found");
    return facility;
  }

  // No facilityId: get first facility or create one (backward compat)
  let facility = await prisma.facility.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  if (!facility) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    if (!tenant) {
      throw new Error("Tenant not found");
    }

    facility = await prisma.facility.create({
      data: {
        tenantId,
        name: tenant.name,
      },
    });
  }

  return facility;
}

/**
 * List all facilities for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Facility records
 */
async function listFacilities(tenantId) {
  if (!tenantId) throw new Error("tenantId is required");
  return prisma.facility.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });
}

/**
 * List facilities across all tenants the user can access (for facility/tenant switcher).
 * Uses UserTenant and fallback to user.tenantId; SUPER_ADMIN gets all tenants.
 * @param {string} userId - User ID
 * @param {string} [userRole] - User role (SUPER_ADMIN gets all)
 * @returns {Promise<Array>} Facility records with tenantId
 */
async function listFacilitiesForAllUserTenants(userId, userRole) {
  if (userRole === "SUPER_ADMIN") {
    return prisma.facility.findMany({
      orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
  }

  const userTenants = await prisma.userTenant.findMany({
    where: { userId },
    select: { tenantId: true },
  });
  const tenantIds = userTenants.map((ut) => ut.tenantId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  if (user?.tenantId && !tenantIds.includes(user.tenantId)) {
    tenantIds.push(user.tenantId);
  }

  if (tenantIds.length === 0) return [];

  return prisma.facility.findMany({
    where: { tenantId: { in: tenantIds } },
    orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });
}

/**
 * Create a new facility for tenant
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - Facility create fields
 * @returns {Promise<Object>} Created facility
 */
async function createFacility(tenantId, data) {
  if (!tenantId) throw new Error("tenantId is required");
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  return prisma.facility.create({
    data: {
      tenantId,
      name: (data.name || "").trim(),
      licenseNumber: data.licenseNumber?.trim() || null,
      address: data.address?.trim() || null,
      capacity: data.capacity != null ? parseInt(data.capacity, 10) : null,
      licenseExpirationDate: data.licenseExpirationDate
        ? new Date(data.licenseExpirationDate)
        : null,
      profilePhotoUrl: data.profilePhotoUrl?.trim() || null,
      contactInformation: data.contactInformation?.trim() || null,
    },
  });
}

/**
 * Get facility by ID (verify tenant ownership)
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object|null>} Facility or null
 */
async function getFacility(tenantId, facilityId) {
  if (!tenantId || !facilityId) return null;
  return prisma.facility.findFirst({
    where: { id: facilityId, tenantId },
  });
}

/**
 * Update facility profile
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @param {Object} data - Facility update data
 * @returns {Promise<Object>} Updated facility record
 */
async function updateFacility(tenantId, facilityId, data) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  const facility = await getOrCreateFacility(tenantId, facilityId);
  if (!facility) throw new Error("Facility not found");

  const {
    name,
    licenseNumber,
    address,
    capacity,
    licenseExpirationDate,
    profilePhotoUrl,
    contactInformation,
  } = data;

  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (licenseNumber !== undefined)
    updateData.licenseNumber = licenseNumber?.trim() || null;
  if (address !== undefined) updateData.address = address?.trim() || null;
  if (capacity !== undefined)
    updateData.capacity = capacity != null ? parseInt(capacity, 10) : null;
  if (licenseExpirationDate !== undefined) {
    updateData.licenseExpirationDate = licenseExpirationDate
      ? new Date(licenseExpirationDate)
      : null;
  }
  if (contactInformation !== undefined) {
    updateData.contactInformation = contactInformation?.trim() || null;
  }

  let oldPhotoKeyToDelete = null;
  if (profilePhotoUrl !== undefined) {
    const nextUrl = profilePhotoUrl?.trim() || null;
    updateData.profilePhotoUrl = nextUrl;
    if (facility.profilePhotoS3Key) {
      oldPhotoKeyToDelete = facility.profilePhotoS3Key;
      updateData.profilePhotoS3Key = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return facility;
  }

  const updated = await prisma.facility.update({
    where: { id: facility.id },
    data: updateData,
  });

  if (oldPhotoKeyToDelete) {
    try {
      await deleteFileFromS3(oldPhotoKeyToDelete);
    } catch (e) {
      console.error(
        "[Facility] Failed to delete old profile photo from S3:",
        e?.message
      );
    }
  }

  return updated;
}

/**
 * Upload facility profile photo; replaces any previous S3 photo. Clears profilePhotoUrl.
 * @param {string} tenantId
 * @param {string} facilityId
 * @param {Object} file - Multer file
 * @returns {Promise<Object>} Updated facility
 */
async function uploadProfilePhoto(tenantId, facilityId, file) {
  if (!file?.buffer) throw new Error("File is required");
  const facility = await getFacility(tenantId, facilityId);
  if (!facility) throw new Error("Facility not found");

  const { s3Key, s3Url } = await uploadFacilityProfilePhotoToS3({
    tenantId,
    facilityId,
    buffer: file.buffer,
    mimeType: file.mimetype || "image/png",
    fileName: file.originalname || "photo.png",
  });

  const prevKey = facility.profilePhotoS3Key;
  const updated = await prisma.facility.update({
    where: { id: facility.id },
    data: {
      profilePhotoS3Key: s3Key,
      profilePhotoUrl: s3Url || null,
    },
  });

  if (prevKey && prevKey !== s3Key) {
    try {
      await deleteFileFromS3(prevKey);
    } catch (e) {
      console.error(
        "[Facility] Failed to delete previous profile photo from S3:",
        e?.message
      );
    }
  }

  return updated;
}

/**
 * Delete a facility (cascades to folders, documents, drills, visitor logs, staff assignments)
 * @param {string} tenantId - Tenant ID
 * @param {string} facilityId - Facility ID
 * @returns {Promise<Object>} Deleted facility
 */
async function deleteFacility(tenantId, facilityId) {
  const facility = await getFacility(tenantId, facilityId);
  if (!facility) throw new Error("Facility not found");

  await prisma.facility.delete({
    where: { id: facilityId },
  });
  return facility;
}

/**
 * Create an independent account: new Tenant + one Facility, and link the user to that tenant.
 * Used for "Create new facility" = completely independent account (only login shared).
 * @param {string} userId - User creating the facility
 * @param {string} userRole - User's role (e.g. ADMIN, STAFF) to assign in the new tenant
 * @param {Object} data - { name, licenseNumber?, address?, capacity?, licenseExpirationDate? }
 * @returns {Promise<{ tenant: Object, facility: Object }>}
 */
async function createIndependentFacility(userId, userRole, data) {
  const name = (data.name || "").trim();
  if (!name) throw new Error("Facility name is required");

  const baseSlug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50) || "facility";
  let slug = baseSlug;
  let attempts = 0;
  const maxAttempts = 20;
  while (attempts < maxAttempts) {
    const exists = await prisma.tenant.findUnique({ where: { slug } });
    if (!exists) break;
    slug = `${baseSlug}-${nanoid(6)}`;
    attempts++;
  }
  if (attempts >= maxAttempts) {
    slug = `${baseSlug}-${nanoid(10)}`;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      isActive: true,
    },
  });

  const facility = await prisma.facility.create({
    data: {
      tenantId: tenant.id,
      name,
      licenseNumber: data.licenseNumber?.trim() || null,
      address: data.address?.trim() || null,
      capacity: data.capacity != null ? parseInt(data.capacity, 10) : null,
      licenseExpirationDate: data.licenseExpirationDate
        ? new Date(data.licenseExpirationDate)
        : null,
      profilePhotoUrl: data.profilePhotoUrl?.trim() || null,
      contactInformation: data.contactInformation?.trim() || null,
    },
  });

  const roleForNewTenant = userRole === "SUPER_ADMIN" ? "ADMIN" : userRole;
  await prisma.userTenant.create({
    data: {
      userId,
      tenantId: tenant.id,
      role: roleForNewTenant,
      isPrimary: false,
    },
  });

  return { tenant, facility };
}

module.exports = {
  getOrCreateFacility,
  listFacilities,
  listFacilitiesForAllUserTenants,
  createFacility,
  createIndependentFacility,
  getFacility,
  updateFacility,
  uploadProfilePhoto,
  deleteFacility,
};
