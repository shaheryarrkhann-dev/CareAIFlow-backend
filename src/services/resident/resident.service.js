const prisma = require("../../lib/prisma");
const {
  normalizeResidentCapacityLimit,
} = require("../../lib/residentCapacity");

const RESIDENT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
};

/**
 * Base filter: exclude legacy soft-deleted rows
 */
function nonDeletedResidentWhere() {
  return { deletedAt: null };
}

/**
 * Filter for residents available in day-to-day workflows (dropdowns, new records)
 */
function activeResidentWhere() {
  return {
    deletedAt: null,
    status: RESIDENT_STATUS.ACTIVE,
  };
}

/**
 * Normalize status query param to enum value
 * @param {string|undefined|null} status
 * @returns {'ACTIVE'|'INACTIVE'|null}
 */
function normalizeResidentStatusFilter(status) {
  if (!status) return null;
  const normalized = String(status).trim().toUpperCase();
  if (normalized === RESIDENT_STATUS.ACTIVE) return RESIDENT_STATUS.ACTIVE;
  if (normalized === RESIDENT_STATUS.INACTIVE) return RESIDENT_STATUS.INACTIVE;
  return null;
}

/**
 * Extract resident name from Resident model
 * @param {Object} resident - Resident model object
 * @returns {string} Resident name
 */
function extractResidentNameFromModel(resident) {
  if (!resident) {
    return "Unknown Resident";
  }

  // Priority: preferred name > full legal name (support both old and new schema)
  const preferred =
    resident.residentIdentificationPreferredName ||
    resident.residentPreferredName;
  const fullLegal =
    resident.residentIdentificationFullLegalName ||
    resident.residentFullLegalName;
  if (preferred) return preferred;
  if (fullLegal) return fullLegal;

  return "Unknown Resident";
}

/**
 * Validate that a residentId exists, belongs to the tenant, and is active
 * @param {string} residentId - Resident UUID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<boolean>} True if resident exists and belongs to tenant
 */
async function validateResidentId(residentId, tenantId) {
  if (!residentId || !tenantId) {
    return false;
  }

  try {
    const resident = await prisma.resident.findFirst({
      where: {
        id: residentId,
        tenantId: tenantId,
        ...activeResidentWhere(),
      },
      select: {
        id: true,
      },
    });

    return !!resident;
  } catch (error) {
    console.error("[validateResidentId] Error:", error);
    return false;
  }
}

/**
 * Get all residents for tenant
 * Returns residents from the static Resident model
 *
 * @param {Object} user - Current user
 * @param {Object} options - Query options
 * @param {number} options.limit - Limit results
 * @param {number} options.offset - Offset for pagination
 * @param {string} options.tenantIdFromQuery - Optional tenantId for SUPER_ADMIN
 * @param {string} options.statusFromQuery - Optional ACTIVE | INACTIVE filter
 * @returns {Promise<Object>} Formatted residents list
 */
async function getResidents(
  user,
  {
    limit = 1000,
    offset = 0,
    tenantIdFromQuery = null,
    statusFromQuery = null,
  } = {}
) {
  // Determine tenantId
  let tenantId = null;

  if (user.role === "SUPER_ADMIN") {
    // SUPER_ADMIN can filter by tenantId from query or see all tenants
    tenantId = tenantIdFromQuery || null; // null means all tenants
  } else {
    // Others: use their tenant
    tenantId = user.tenantId;
    if (!tenantId) {
      return {
        residents: [],
        count: 0,
        pagination: {
          limit,
          offset,
          total: 0,
          totalPages: 0,
        },
      };
    }
  }

  const statusFilter = normalizeResidentStatusFilter(statusFromQuery);

  // Build where clause
  const where = {
    ...nonDeletedResidentWhere(),
  };
  if (statusFilter) {
    where.status = statusFilter;
  } else {
    // Default list: active residents only (dropdowns and main roster)
    where.status = RESIDENT_STATUS.ACTIVE;
  }
  if (tenantId) {
    where.tenantId = tenantId;
  }

  // Guardians are limited to their own created residents
  if (user.role === "GUARDIAN") {
    where.userId = user.id;
  }

  // Get total count
  const count = await prisma.resident.count({ where });

  // Get residents with pagination - fetch all columns so new schema fields are included
  const residentsData = await prisma.resident.findMany({
    where,
    take: limit,
    skip: offset,
    orderBy: {
      createdAt: "desc",
    },
  });

  // Format residents for response - pass full resident as residentData so frontend gets all fields (old + new schema)
  const residents = residentsData.map((resident) => {
    const name = extractResidentNameFromModel(resident);

    // Exclude internal/relation fields from residentData; include all scalar resident fields
    const { deletedAt, ...residentFields } = resident;

    return {
      id: resident.id,
      name: name,
      status: resident.status,
      tenantId: resident.tenantId,
      userId: resident.userId,
      residentPhoto:
        resident.residentPhoto ||
        resident.residentIdentificationProfilePicture ||
        null,
      eSignature: resident.eSignatureUrl || null,
      createdAt: resident.createdAt,
      updatedAt: resident.updatedAt,
      // Include full resident data so frontend gets both old and new schema fields
      residentData: residentFields,
      formData: residentFields,
    };
  });

  return {
    residents,
    count,
    pagination: {
      limit,
      offset,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}

/**
 * Capacity status for a facility (active residents vs limit).
 * Used to disable "create resident" UI when the home is full.
 *
 * @param {Object} user
 * @param {string} facilityId
 * @returns {Promise<{
 *   facilityId: string,
 *   facilityName: string,
 *   limit: number,
 *   activeCount: number,
 *   atLimit: boolean,
 *   canAdd: boolean,
 *   message: string | null,
 * }>}
 */
async function getResidentCapacityStatus(user, facilityId) {
  if (!facilityId) {
    const err = new Error("facilityId is required");
    err.status = 400;
    throw err;
  }

  const facilityWhere =
    user.role === "SUPER_ADMIN"
      ? { id: facilityId }
      : { id: facilityId, tenantId: user.tenantId || undefined };

  if (user.role !== "SUPER_ADMIN" && !user.tenantId) {
    const err = new Error("No organization on your account");
    err.status = 400;
    throw err;
  }

  const facility = await prisma.facility.findFirst({
    where: facilityWhere,
    select: {
      id: true,
      name: true,
      residentCapacityLimit: true,
      tenantId: true,
    },
  });

  if (!facility) {
    const err = new Error("Facility not found or access denied");
    err.status = 404;
    throw err;
  }

  const limit = normalizeResidentCapacityLimit(facility.residentCapacityLimit);
  const activeCount = await prisma.resident.count({
    where: {
      facilityId: facility.id,
      deletedAt: null,
      status: RESIDENT_STATUS.ACTIVE,
    },
  });

  const atLimit = activeCount >= limit;
  const canAdd = !atLimit;
  const message = atLimit
    ? `Resident limit reached for ${facility.name || "this facility"} (${activeCount}/${limit}). Archive a resident or ask a Super Admin to raise this facility’s capacity (up to 8).`
    : null;

  return {
    facilityId: facility.id,
    facilityName: facility.name,
    limit,
    activeCount,
    atLimit,
    canAdd,
    message,
  };
}

/**
 * Get resident by ID
 * @param {string} residentId - Resident UUID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Resident data
 */
async function getResidentById(residentId, user) {
  if (!residentId) {
    throw new Error("Resident ID is required");
  }

  // Determine tenantId for access control
  let tenantId = null;

  if (user.role === "SUPER_ADMIN") {
    // SUPER_ADMIN can access any tenant, but we need tenantId to query
    // If not provided, we'll check all tenants (less efficient)
    tenantId = user.tenantIdFromQuery || user.tenantId;
  } else {
    tenantId = user.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to access residents");
    }
  }

  // Build where clause — inactive residents remain viewable for history/compliance
  const where = {
    id: residentId,
    ...nonDeletedResidentWhere(),
  };
  if (tenantId) {
    where.tenantId = tenantId;
  }

  // For GUARDIAN role, also check userId
  if (user.role === "GUARDIAN") {
    where.userId = user.id;
  }

  // Get resident from database
  const resident = await prisma.resident.findFirst({
    where,
  });

  if (!resident) {
    throw new Error("Resident not found or access denied");
  }

  // Format resident for response
  const name = extractResidentNameFromModel(resident);

  // Extract email(s) if they exist
  const email = resident.emergencyPrimaryContactEmail || null;
  const secondaryEmail = resident.emergencySecondaryContactEmail || null;

  return {
    id: resident.id,
    name: name,
    status: resident.status,
    email: email, // Primary emergency contact email
    secondaryEmail: secondaryEmail, // Secondary emergency contact email
    tenantId: resident.tenantId,
    userId: resident.userId,
    createdAt: resident.createdAt,
    updatedAt: resident.updatedAt,
    // Include all resident fields for backward compatibility
    residentData: resident,
    // Legacy field for compatibility (maps to residentData)
    formData: resident,
  };
}

/**
 * Set resident status (Active / Inactive)
 * Inactive residents are retained in the database for audit and history.
 * @param {string} residentId - Resident UUID
 * @param {'ACTIVE'|'INACTIVE'} status - Target status
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated resident
 */
async function updateResidentStatus(residentId, status, requestingUser) {
  if (!residentId) {
    throw new Error("Resident ID is required");
  }

  const normalizedStatus = normalizeResidentStatusFilter(status);
  if (!normalizedStatus) {
    throw new Error("Status must be ACTIVE or INACTIVE");
  }

  const existing = await getResidentById(residentId, requestingUser);

  if (
    requestingUser.role !== "ADMIN" &&
    requestingUser.role !== "SUPER_ADMIN"
  ) {
    throw new Error("Only an administrator can change resident status.");
  }

  if (
    normalizedStatus === RESIDENT_STATUS.ACTIVE &&
    existing.status !== RESIDENT_STATUS.ACTIVE
  ) {
    const subscriptionManagement = require("../stripe/subscription-management.service");
    await subscriptionManagement.assertCanAddResident(existing.tenantId, {
      userId: requestingUser.id,
      userRole: requestingUser.role,
      facilityId: existing.facilityId || null,
    });
  }

  const updatedResident = await prisma.resident.update({
    where: { id: residentId },
    data: {
      status: normalizedStatus,
    },
  });

  return updatedResident;
}

/**
 * Deactivate resident (sets status to INACTIVE; record is preserved)
 * Only tenant administrators can deactivate residents.
 * @param {string} residentId - Resident UUID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Deactivated resident data
 */
async function deleteResident(residentId, requestingUser) {
  return updateResidentStatus(
    residentId,
    RESIDENT_STATUS.INACTIVE,
    requestingUser
  );
}

module.exports = {
  RESIDENT_STATUS,
  activeResidentWhere,
  nonDeletedResidentWhere,
  normalizeResidentStatusFilter,
  validateResidentId,
  getResidents,
  getResidentCapacityStatus,
  getResidentById,
  updateResidentStatus,
  deleteResident,
  extractResidentNameFromModel, // Export for use in other services
};
