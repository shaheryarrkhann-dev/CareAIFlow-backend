const { validationResult } = require("express-validator");
const staffMemberService = require("../../services/staff/staff-member.service");
const staffFacilityService = require("../../services/staff/staff-facility.service");
const staffFolderService = require("../../services/staff/staff-folder.service");
const auditService = require("../../services/compliance/audit.service");
const { createAuditLog } = auditService;
const { isStaffDocumentsAdmin } = require("../../middlewares/staff-self-access.middleware");
const { buildPublicS3ObjectUrl } = require("../../utils/s3.util");

function withStaffProfilePhotoDisplayUrl(staffMember) {
  if (!staffMember) return staffMember;
  const profilePhotoDisplayUrl =
    (staffMember.profilePhotoUrl && staffMember.profilePhotoUrl.trim()) ||
    buildPublicS3ObjectUrl(staffMember.profilePhotoS3Key) ||
    null;
  return { ...staffMember, profilePhotoDisplayUrl };
}

/**
 * Resolve tenantId for staff operations
 */
function resolveTenantId(req) {
  let tenantId = req.user.tenantId;
  if (
    req.user.role === "SUPER_ADMIN" &&
    (req.body.tenantId || req.query.tenantId)
  ) {
    tenantId = req.body.tenantId || req.query.tenantId;
  }
  return tenantId;
}

/**
 * Handle validation errors
 */
function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const msg = first.msg || "Validation error";
    const field = first.param;
    const error = new Error(`${msg}${field ? ` (${field})` : ""}`);
    error.status = 400;
    throw error;
  }
}

/**
 * GET /api/staff
 * List staff members (paginated)
 */
exports.listStaffMembers = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const { page, limit, facilityId, search, employmentStatus } = req.query;
    const restrictToSelf = !isStaffDocumentsAdmin(req.user);
    const result = await staffMemberService.listStaffMembers(tenantId, {
      page,
      limit,
      facilityId,
      search,
      employmentStatus,
      ...(restrictToSelf ? { restrictToUserId: req.user.id } : {}),
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/staff
 * Create staff member (link User with role STAFF to document management)
 */
exports.createStaffMember = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const { userId } = req.body;
    const staffMember = await staffMemberService.createStaffMember(tenantId, userId);

    try {
      await staffFolderService.ensureDefaultStaffFolders(staffMember.id);
    } catch (folderErr) {
      console.error("Failed to create default staff folders:", folderErr?.message);
    }

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "STAFF_MEMBER_CREATED",
        resource: "staff_member",
        resourceId: staffMember.id,
        description: `Staff member added for document management: ${staffMember.user?.name || staffMember.userId}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          staffMemberId: staffMember.id,
          userId: staffMember.userId,
          staffName: staffMember.user?.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for staff member creation:", auditError?.message);
    }

    return res.status(201).json({
      success: true,
      message: "Staff member added successfully",
      staffMember,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/staff/available-users
 * Get Users with role STAFF not yet StaffMembers (for create dropdown)
 */
exports.getAvailableStaffUsers = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const users = await staffMemberService.getAvailableStaffUsers(tenantId);
    return res.json({
      success: true,
      users,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/staff/:id/profile
 * Update employee profile (admin only)
 */
exports.updateStaffProfile = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const staffMember = await staffMemberService.updateStaffProfile(
      tenantId,
      req.params.id,
      req.body
    );

    return res.json({
      success: true,
      message: "Employee profile updated",
      staffMember: withStaffProfilePhotoDisplayUrl(staffMember),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/staff/:id/profile-photo
 * Upload employee profile photo (admin only)
 */
exports.uploadStaffProfilePhoto = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "File is required (field name: file)",
      });
    }

    const staffMember = await staffMemberService.uploadStaffProfilePhoto(
      tenantId,
      req.params.id,
      req.file
    );

    return res.json({
      success: true,
      message: "Profile photo updated",
      staffMember: withStaffProfilePhotoDisplayUrl(staffMember),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/staff/:id
 * Get staff member by ID
 */
exports.getStaffMember = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const staffMember = await staffMemberService.getStaffMemberById(
      tenantId,
      req.params.id
    );

    return res.json({
      success: true,
      staffMember: withStaffProfilePhotoDisplayUrl(staffMember),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/staff/:id
 * Delete staff member
 */
exports.deleteStaffMember = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const staffMember = await staffMemberService.deleteStaffMember(
      tenantId,
      req.params.id
    );

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "STAFF_MEMBER_DELETED",
        resource: "staff_member",
        resourceId: staffMember.id,
        description: `Staff member removed from document management: ${staffMember.user?.name || staffMember.userId}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          staffMemberId: staffMember.id,
          userId: staffMember.userId,
          staffName: staffMember.user?.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for staff member deletion:", auditError?.message);
    }

    return res.json({
      success: true,
      message: "Staff member removed successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/staff/:id/facilities
 * Assign staff to facility
 */
exports.assignFacility = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const { facilityId } = req.body;
    const assignment = await staffFacilityService.assignStaffToFacility(
      tenantId,
      req.params.id,
      facilityId
    );

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "STAFF_FACILITY_ASSIGNED",
        resource: "staff_facility_assignment",
        resourceId: assignment.id,
        description: `Staff assigned to facility: ${assignment.facility?.name}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          staffId: req.params.id,
          facilityId,
          facilityName: assignment.facility?.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for facility assignment:", auditError?.message);
    }

    return res.status(201).json({
      success: true,
      message: "Staff assigned to facility successfully",
      assignment,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/staff/:id/facilities/:facilityId
 * Unassign staff from facility
 */
exports.unassignFacility = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const assignment = await staffFacilityService.unassignStaffFromFacility(
      tenantId,
      req.params.id,
      req.params.facilityId
    );

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "STAFF_FACILITY_UNASSIGNED",
        resource: "staff_facility_assignment",
        resourceId: assignment.id,
        description: `Staff unassigned from facility: ${assignment.facility?.name}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          staffId: req.params.id,
          facilityId: req.params.facilityId,
          facilityName: assignment.facility?.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for facility unassignment:", auditError?.message);
    }

    return res.json({
      success: true,
      message: "Staff unassigned from facility successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/staff/audit-history
 * Get staff document audit logs for current tenant
 */
exports.getStaffAuditHistory = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const { action, resource, startDate, endDate, page, limit } = req.query;
    const filters = {
      action: action || undefined,
      resource: resource || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: page ? Number.parseInt(page, 10) : 1,
      limit: limit ? Number.parseInt(limit, 10) : 50,
    };

    const result = await auditService.getStaffAuditLogs(tenantId, filters);

    return res.json({
      success: true,
      logs: result.logs,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};
