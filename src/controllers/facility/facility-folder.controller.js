const { validationResult } = require("express-validator");
const facilityFolderService = require("../../services/facility/facility-folder.service");
const { createAuditLog } = require("../../services/compliance/audit.service");
const { resolveFacilityTenantId } = require("../../lib/resolveFacilityTenantId");

function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const err = new Error(first.msg || "Validation error");
    err.status = 400;
    throw err;
  }
}

function resolveFacilityId(req) {
  return req.query.facilityId || req.body?.facilityId;
}

/** GET /folders?facilityId=X&parentId= — parentId optional; when absent, returns root folders only. */
exports.getFolders = async (req, res, next) => {
  try {
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const parentId = req.query.parentId === undefined || req.query.parentId === "" ? null : req.query.parentId;
    const folders = await facilityFolderService.getFolders(tenantId, facilityId, parentId);
    return res.json({ success: true, folders });
  } catch (err) {
    next(err);
  }
};

/** GET /folders/:folderId/contents?facilityId=X — returns { folders, documents } for that folder. X-Folder-Password header if protected. */
exports.getFolderContents = async (req, res, next) => {
  try {
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const folderId = req.params.folderId;
    const folderPassword = req.get("x-folder-password") || req.query.folderPassword || undefined;
    const contents = await facilityFolderService.getFolderContents(tenantId, facilityId, folderId, folderPassword);
    return res.json({ success: true, ...contents });
  } catch (err) {
    next(err);
  }
};

exports.createFolder = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const folder = await facilityFolderService.createFolder(
      tenantId,
      req.body,
      facilityId
    );
    try {
      const passwordSet = !!(req.body.password && String(req.body.password).trim());
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "FACILITY_FOLDER_CREATED",
        resource: "facility_folder",
        resourceId: folder.id,
        description: "Facility folder created",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { folderName: folder.name, facilityId: folder.facilityId, passwordSet },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.status(201).json({ success: true, folder });
  } catch (err) {
    next(err);
  }
};

exports.updateFolder = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const folder = await facilityFolderService.updateFolder(
      tenantId,
      req.params.id,
      req.body,
      facilityId
    );
    try {
      const passwordSet = !!(req.body.password && String(req.body.password).trim());
      const passwordRemoved = Object.prototype.hasOwnProperty.call(req.body, "password") &&
        (req.body.password === "" || req.body.password == null);
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "FACILITY_FOLDER_UPDATED",
        resource: "facility_folder",
        resourceId: folder.id,
        description: "Facility folder updated",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { folderName: folder.name, facilityId: folder.facilityId, passwordSet, passwordRemoved },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, folder });
  } catch (err) {
    next(err);
  }
};

exports.deleteFolder = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const folder = await facilityFolderService.getFolder(
      tenantId,
      req.params.id,
      facilityId
    );
    await facilityFolderService.deleteFolder(
      tenantId,
      req.params.id,
      facilityId
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "FACILITY_FOLDER_DELETED",
        resource: "facility_folder",
        resourceId: req.params.id,
        description: "Facility folder deleted",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: folder?.facilityId ? { facilityId: folder.facilityId } : undefined,
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, message: "Folder deleted" });
  } catch (err) {
    next(err);
  }
};
