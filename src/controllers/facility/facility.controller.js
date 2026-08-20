const { validationResult } = require("express-validator");
const facilityService = require("../../services/facility/facility.service");
const facilityFolderService = require("../../services/facility/facility-folder.service");
const { buildPublicS3ObjectUrl } = require("../../utils/s3.util");
const {
  createAuditLog,
  getFacilityAuditLogs,
} = require("../../services/compliance/audit.service");
const { resolveFacilityTenantId } = require("../../lib/resolveFacilityTenantId");

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
 * Resolve facilityId for facility-scoped operations
 * Reads from query.facilityId or body.facilityId
 * @returns {string|undefined} facilityId or undefined
 */
function resolveFacilityId(req) {
  return req.query.facilityId || req.body?.facilityId;
}

/**
 * Exposes a URL the browser can use in <img src> without API auth.
 * Prefer stored profilePhotoUrl (S3 HTTPS URL); else derive from profilePhotoS3Key for legacy rows.
 */
function attachProfilePhotoDisplayUrl(facility) {
  if (!facility) return facility;
  const profilePhotoDisplayUrl =
    (facility.profilePhotoUrl && facility.profilePhotoUrl.trim()) ||
    buildPublicS3ObjectUrl(facility.profilePhotoS3Key) ||
    null;
  return { ...facility, profilePhotoDisplayUrl };
}

/**
 * GET /api/facility/profile
 * Get facility profile for current tenant
 * Query: facilityId (optional) - when tenant has multiple facilities
 */
exports.getFacilityProfile = async (req, res, next) => {
  try {
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facilityId = resolveFacilityId(req);
    const facility = await facilityService.getOrCreateFacility(
      tenantId,
      facilityId
    );
    return res.json({
      success: true,
      facility: attachProfilePhotoDisplayUrl(facility),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/facility/profile
 * Update facility profile
 * Query/body: facilityId (optional) - when tenant has multiple facilities
 */
exports.updateFacilityProfile = async (req, res, next) => {
  try {
    handleValidation(req);

    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facilityId = resolveFacilityId(req);
    const facility = await facilityService.updateFacility(
      tenantId,
      facilityId,
      req.body,
      { userRole: req.user.role },
    );

    const facilityOut = attachProfilePhotoDisplayUrl(facility);

    // Audit log
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "FACILITY_PROFILE_UPDATED",
        resource: "facility",
        resourceId: facility.id,
        description: "Facility profile updated",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          facilityName: facility.name,
          facilityId: facility.id,
          updatedFields: Object.keys(req.body),
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for facility profile update:",
        auditError?.message
      );
    }

    return res.json({
      success: true,
      message: "Facility profile updated successfully",
      facility: facilityOut,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/facility/profile/photo-upload
 */
exports.uploadFacilityProfilePhoto = async (req, res, next) => {
  try {
    handleValidation(req);

    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facilityId = req.body.facilityId || req.query.facilityId;
    if (!facilityId) {
      return res
        .status(400)
        .json({ success: false, message: "facilityId is required" });
    }
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "File is required" });
    }

    const facility = await facilityService.uploadProfilePhoto(
      tenantId,
      facilityId,
      req.file
    );
    const facilityOut = attachProfilePhotoDisplayUrl(facility);

    return res.json({
      success: true,
      facility: facilityOut,
      profilePhotoDisplayUrl: facilityOut.profilePhotoDisplayUrl,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/facility/audit-history
 * Get facility-specific audit logs (profile, folders, documents, drills, visitors)
 */
exports.getFacilityAuditHistory = async (req, res, next) => {
  try {
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const { action, resource, startDate, endDate, page, limit, facilityId } =
      req.query;
    const filters = {
      action: action || undefined,
      resource: resource || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      facilityId: facilityId || undefined,
    };

    const result = await getFacilityAuditLogs(tenantId, filters);

    return res.json({
      success: true,
      logs: result.logs,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/facility/facilities
 * List all facilities for current tenant
 */
exports.listFacilities = async (req, res, next) => {
  try {
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facilities = await facilityService.listFacilities(tenantId);
    return res.json({
      success: true,
      facilities: facilities.map((f) => attachProfilePhotoDisplayUrl(f)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/facility/facilities/all-mine
 * List facilities across all tenants the user can access (for facility switcher).
 */
exports.listAllMyFacilities = async (req, res, next) => {
  try {
    const facilities = await facilityService.listFacilitiesForAllUserTenants(
      req.user.id,
      req.user.role
    );
    return res.json({
      success: true,
      facilities: facilities.map((f) => attachProfilePhotoDisplayUrl(f)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/facility/facilities
 * Create a new facility for current tenant
 */
exports.createFacility = async (req, res, next) => {
  try {
    handleValidation(req);

    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facility = await facilityService.createFacility(tenantId, req.body, {
      userId: req.user.id,
      userRole: req.user.role,
    });
    const facilityOut = attachProfilePhotoDisplayUrl(facility);

    try {
      await facilityFolderService.ensureDefaultFacilityFolders(facility.id);
    } catch (folderErr) {
      console.error("Failed to create default facility folders:", folderErr?.message);
    }

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "FACILITY_PROFILE_CREATED",
        resource: "facility",
        resourceId: facility.id,
        description: `Facility created: ${facility.name}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { facilityName: facility.name, facilityId: facility.id },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for facility create:",
        auditError?.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Facility created successfully",
      facility: facilityOut,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/facility/facilities/independent
 * Create a completely independent account: new Tenant + one Facility; link current user to that tenant.
 * Only shared element is login (user can switch to this facility via switch-tenant).
 */
exports.createIndependentFacility = async (req, res, next) => {
  try {
    handleValidation(req);

    const userId = req.user.id;
    const userRole = req.user.role || "STAFF";

    const { tenant, facility } = await facilityService.createIndependentFacility(
      userId,
      userRole,
      req.body
    );
    const facilityOut = attachProfilePhotoDisplayUrl(facility);

    try {
      await facilityFolderService.ensureDefaultFacilityFolders(facility.id);
    } catch (folderErr) {
      console.error(
        "Failed to create default facility folders (independent):",
        folderErr?.message
      );
    }

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId: tenant.id,
        action: "FACILITY_PROFILE_CREATED",
        resource: "facility",
        resourceId: facility.id,
        description: `Independent facility (new account) created: ${facility.name}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          facilityName: facility.name,
          facilityId: facility.id,
          tenantId: tenant.id,
          independentAccount: true,
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for independent facility create:",
        auditError?.message
      );
    }

    return res.status(201).json({
      success: true,
      message:
        "Independent facility created successfully. You can switch to it from the facility switcher.",
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      facility: facilityOut,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/facility/facilities/:id
 * Get a single facility by ID (must belong to tenant)
 */
exports.getFacility = async (req, res, next) => {
  try {
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facilityId = req.params.id;
    const facility = await facilityService.getFacility(tenantId, facilityId);
    if (!facility) {
      return res.status(404).json({
        success: false,
        message: "Facility not found",
      });
    }

    return res.json({
      success: true,
      facility: attachProfilePhotoDisplayUrl(facility),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/facility/facilities/:id
 * Update a facility (must belong to tenant)
 */
exports.updateFacility = async (req, res, next) => {
  try {
    handleValidation(req);

    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facilityId = req.params.id;
    const facility = await facilityService.updateFacility(
      tenantId,
      facilityId,
      req.body,
      { userRole: req.user.role },
    );
    const facilityOut = attachProfilePhotoDisplayUrl(facility);

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "FACILITY_UPDATED",
        resource: "facility",
        resourceId: facility.id,
        description: `Facility updated: ${facility.name}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          facilityName: facility.name,
          facilityId: facility.id,
          updatedFields: Object.keys(req.body),
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for facility update:",
        auditError?.message
      );
    }

    return res.json({
      success: true,
      message: "Facility updated successfully",
      facility: facilityOut,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/facility/facilities/:id
 * Delete a facility (must belong to tenant, cascades to folders, documents, drills, visitors)
 */
exports.deleteFacility = async (req, res, next) => {
  try {
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "tenantId is required. Please ensure you are associated with an organization.",
      });
    }

    const facilityId = req.params.id;
    const facility = await facilityService.deleteFacility(tenantId, facilityId);

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "FACILITY_DELETED",
        resource: "facility",
        resourceId: facility.id,
        description: `Facility deleted: ${facility.name}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { facilityName: facility.name, facilityId: facility.id },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for facility delete:",
        auditError?.message
      );
    }

    return res.json({
      success: true,
      message: "Facility deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/facility/facilities/bulk-resident-capacity
 * Super Admin: set residentCapacityLimit (6|7|8) on selected or all facilities in a tenant.
 */
exports.bulkSetResidentCapacityLimit = async (req, res, next) => {
  try {
    handleValidation(req);

    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only a Super Admin can bulk-update resident capacity limits",
      });
    }

    const { tenantId, facilityIds, selectAll, residentCapacityLimit } = req.body;
    const ids =
      selectAll === true || !Array.isArray(facilityIds) || facilityIds.length === 0
        ? []
        : facilityIds;

    const result = await facilityService.bulkSetResidentCapacityLimit({
      tenantId,
      facilityIds: ids,
      residentCapacityLimit,
      userRole: req.user.role,
    });

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "FACILITY_PROFILE_UPDATED",
        resource: "facility",
        resourceId: tenantId,
        description: `Bulk resident capacity set to ${result.residentCapacityLimit} (${result.updatedCount} facilities)`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          residentCapacityLimit: result.residentCapacityLimit,
          updatedCount: result.updatedCount,
          facilityIds: result.facilities.map((f) => f.id),
          selectAll: ids.length === 0,
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for bulk resident capacity:",
        auditError?.message,
      );
    }

    return res.json({
      success: true,
      message: `Updated ${result.updatedCount} facility(ies) to ${result.residentCapacityLimit} residents`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};
