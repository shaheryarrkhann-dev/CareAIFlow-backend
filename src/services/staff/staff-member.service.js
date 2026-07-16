const prisma = require("../../lib/prisma");
const {
  uploadStaffProfilePhotoToS3,
  deleteFileFromS3,
} = require("../../utils/s3.util");

/**
 * List staff members for a tenant (paginated)
 * StaffMember links to User (role STAFF) - admin creates staff via User invite
 * @param {string} tenantId - Tenant ID
 * @param {Object} options - { page?, limit?, facilityId?, search? }
 * @returns {Promise<Object>} { staffMembers, pagination }
 */
async function listStaffMembers(tenantId, options = {}) {
  const { page = 1, limit = 20, facilityId, search, restrictToUserId, employmentStatus } = options;

  // When filtering by facilityId, scope by assignment instead of tenantId
  // so cross-tenant staff assignments are visible under the correct facility
  const where = facilityId
    ? { facilityAssignments: { some: { facilityId } } }
    : { tenantId };

  if (employmentStatus) {
    where.employmentStatus = employmentStatus.toUpperCase();
  }

  if (restrictToUserId) {
    where.userId = restrictToUserId;
  }

  if (search) {
    where.AND = [
      {
        OR: [
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          { fullLegalName: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const [staffMembers, total] = await Promise.all([
    prisma.staffMember.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        facilityAssignments: {
          include: {
            facility: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.staffMember.count({ where }),
  ]);

  return {
    staffMembers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Create StaffMember by linking to existing User (role STAFF)
 * Admin creates Users with role STAFF via invite; this enables document management for that user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID (must have role STAFF and belong to tenant)
 * @returns {Promise<Object>} Created StaffMember
 */
async function createStaffMember(tenantId, userId) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      role: "STAFF",
    },
  });

  if (!user) {
    throw new Error(
      "User not found, or user is not STAFF role, or user does not belong to this organization"
    );
  }

  const existing = await prisma.staffMember.findUnique({
    where: { userId },
  });

  if (existing) {
    throw new Error("This user is already a staff member with document management");
  }

  return prisma.staffMember.create({
    data: {
      tenantId,
      userId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

/**
 * Get staff member by ID (tenant-scoped)
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - StaffMember ID
 * @returns {Promise<Object>} StaffMember with user and facility assignments
 */
async function getStaffMemberById(tenantId, staffId) {
  const staffMember = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
      tenantId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
      facilityAssignments: {
        include: {
          facility: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!staffMember) {
    throw new Error("Staff member not found");
  }

  return staffMember;
}

function parseOptionalDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid date");
    err.status = 400;
    throw err;
  }
  return d;
}

/**
 * Update employee profile fields (admin-maintained).
 * @param {string} tenantId
 * @param {string} staffId
 * @param {Object} payload
 */
async function updateStaffProfile(tenantId, staffId, payload) {
  await getStaffMemberById(tenantId, staffId);

  const prevRow = await prisma.staffMember.findFirst({
    where: { id: staffId, tenantId },
    select: { profilePhotoS3Key: true },
  });
  const prevPhotoKey = prevRow?.profilePhotoS3Key || null;

  const data = {};

  if (payload.fullLegalName !== undefined) {
    data.fullLegalName =
      payload.fullLegalName == null || String(payload.fullLegalName).trim() === ""
        ? null
        : String(payload.fullLegalName).trim();
  }
  if (payload.profilePhone !== undefined) {
    data.profilePhone =
      payload.profilePhone == null || String(payload.profilePhone).trim() === ""
        ? null
        : String(payload.profilePhone).trim();
  }
  if (payload.profileEmail !== undefined) {
    data.profileEmail =
      payload.profileEmail == null || String(payload.profileEmail).trim() === ""
        ? null
        : String(payload.profileEmail).trim();
  }
  if (payload.address !== undefined) {
    data.address =
      payload.address == null || String(payload.address).trim() === ""
        ? null
        : String(payload.address).trim();
  }
  if (payload.jobTitle !== undefined) {
    data.jobTitle =
      payload.jobTitle == null || String(payload.jobTitle).trim() === ""
        ? null
        : String(payload.jobTitle).trim();
  }
  if (payload.hireDate !== undefined) {
    data.hireDate = parseOptionalDate(payload.hireDate);
  }
  if (payload.emergencyContact !== undefined) {
    data.emergencyContact =
      payload.emergencyContact == null || String(payload.emergencyContact).trim() === ""
        ? null
        : String(payload.emergencyContact).trim();
  }
  if (payload.employmentStatus !== undefined) {
    const s = String(payload.employmentStatus).toUpperCase();
    if (s !== "ACTIVE" && s !== "INACTIVE") {
      const err = new Error("employmentStatus must be ACTIVE or INACTIVE");
      err.status = 400;
      throw err;
    }
    data.employmentStatus = s;
  }
  if (payload.separationTerminationRecord !== undefined) {
    data.separationTerminationRecord =
      payload.separationTerminationRecord == null ||
      String(payload.separationTerminationRecord).trim() === ""
        ? null
        : String(payload.separationTerminationRecord).trim();
  }
  if (payload.separationTerminationDate !== undefined) {
    data.separationTerminationDate = parseOptionalDate(payload.separationTerminationDate);
  }
  if (payload.separationExitNotes !== undefined) {
    data.separationExitNotes =
      payload.separationExitNotes == null || String(payload.separationExitNotes).trim() === ""
        ? null
        : String(payload.separationExitNotes).trim();
  }
  if (payload.separationArchivedPersonnelNote !== undefined) {
    data.separationArchivedPersonnelNote =
      payload.separationArchivedPersonnelNote == null ||
      String(payload.separationArchivedPersonnelNote).trim() === ""
        ? null
        : String(payload.separationArchivedPersonnelNote).trim();
  }
  if (payload.profilePhotoUrl !== undefined) {
    const nextUrl =
      payload.profilePhotoUrl == null || String(payload.profilePhotoUrl).trim() === ""
        ? null
        : String(payload.profilePhotoUrl).trim();
    data.profilePhotoUrl = nextUrl;
    if (prevPhotoKey) {
      data.profilePhotoS3Key = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return getStaffMemberById(tenantId, staffId);
  }

  const updated = await prisma.staffMember.update({
    where: { id: staffId },
    data,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
      facilityAssignments: {
        include: {
          facility: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (
    payload.profilePhotoUrl !== undefined &&
    prevPhotoKey &&
    data.profilePhotoS3Key === null
  ) {
    try {
      await deleteFileFromS3(prevPhotoKey);
    } catch (e) {
      console.error("[Staff] Failed to delete previous profile photo from S3:", e?.message);
    }
  }

  return updated;
}

/**
 * Upload employee profile photo (S3); replaces previous upload.
 * @param {string} tenantId
 * @param {string} staffId
 * @param {Object} file - multer file
 */
async function uploadStaffProfilePhoto(tenantId, staffId, file) {
  if (!file?.buffer) throw new Error("File is required");
  await getStaffMemberById(tenantId, staffId);

  const { s3Key, s3Url } = await uploadStaffProfilePhotoToS3({
    tenantId,
    staffMemberId: staffId,
    buffer: file.buffer,
    mimeType: file.mimetype || "image/png",
    fileName: file.originalname || "photo.png",
  });

  const prev = await prisma.staffMember.findFirst({
    where: { id: staffId, tenantId },
    select: { profilePhotoS3Key: true },
  });

  const updated = await prisma.staffMember.update({
    where: { id: staffId },
    data: {
      profilePhotoS3Key: s3Key,
      profilePhotoUrl: s3Url || null,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
      facilityAssignments: {
        include: {
          facility: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (prev?.profilePhotoS3Key && prev.profilePhotoS3Key !== s3Key) {
    try {
      await deleteFileFromS3(prev.profilePhotoS3Key);
    } catch (e) {
      console.error("[Staff] Failed to delete previous profile photo from S3:", e?.message);
    }
  }

  return updated;
}

/**
 * Delete staff member (cascades to folders, documents, facility assignments)
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - StaffMember ID
 * @returns {Promise<Object>} Deleted StaffMember
 */
async function deleteStaffMember(tenantId, staffId) {
  const staffMember = await getStaffMemberById(tenantId, staffId);
  await prisma.staffMember.delete({
    where: { id: staffId },
  });
  return staffMember;
}

/**
 * Get users with role STAFF who are not yet StaffMembers (for dropdown when creating)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Users available to add as staff
 */
async function getAvailableStaffUsers(tenantId) {
  const staffUserIds = await prisma.staffMember.findMany({
    where: { tenantId },
    select: { userId: true },
  });
  const ids = staffUserIds.map((s) => s.userId);

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      role: "STAFF",
      isActive: true,
      id: { notIn: ids },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: { name: "asc" },
  });

  return users;
}

/**
 * StaffMember.id for a user in a tenant (for self-service scoping).
 * @param {string} tenantId
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function findStaffMemberIdForUser(tenantId, userId) {
  const row = await prisma.staffMember.findFirst({
    where: { tenantId, userId },
    select: { id: true },
  });
  return row?.id ?? null;
}

module.exports = {
  listStaffMembers,
  createStaffMember,
  getStaffMemberById,
  updateStaffProfile,
  uploadStaffProfilePhoto,
  deleteStaffMember,
  getAvailableStaffUsers,
  findStaffMemberIdForUser,
};
