const { validationResult } = require("express-validator");
const residentFolderService = require("../../services/resident/resident-folder.service");
const { createAuditLog } = require("../../services/compliance/audit.service");

function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const err = new Error(first.msg || "Validation error");
    err.status = 400;
    throw err;
  }
}

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

/** GET /:residentId/folders?parentId= — parentId optional; when absent, returns root folders only. */
exports.getFolders = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { residentId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const parentId = req.query.parentId === undefined || req.query.parentId === "" ? null : req.query.parentId;
    const folders = await residentFolderService.getFolders(tenantId, residentId, parentId, user);
    return res.json({ success: true, folders });
  } catch (err) {
    next(err);
  }
};

/** GET /:residentId/folders/:id/contents — subfolders + documents for that folder. Password via X-Folder-Password or query. */
exports.getFolderContents = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { residentId, id: folderId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const folderPassword = req.get("X-Folder-Password") ?? req.query.folderPassword;
    const contents = await residentFolderService.getFolderContents(
      tenantId,
      residentId,
      folderId,
      folderPassword,
      user
    );
    return res.json({ success: true, ...contents });
  } catch (err) {
    next(err);
  }
};

exports.createFolder = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { residentId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const folder = await residentFolderService.createFolder(
      tenantId,
      residentId,
      req.body,
      user
    );
    try {
      const passwordSet = !!(req.body.password && String(req.body.password).trim());
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "RESIDENT_FOLDER_CREATED",
        resource: "resident_folder",
        resourceId: folder.id,
        description: "Resident folder created",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { folderName: folder.name, residentId, passwordSet },
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
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { residentId, id: folderId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const folder = await residentFolderService.updateFolder(
      tenantId,
      residentId,
      folderId,
      req.body,
      user
    );
    try {
      const passwordSet = !!(req.body.password && String(req.body.password).trim());
      const passwordRemoved =
        Object.prototype.hasOwnProperty.call(req.body, "password") &&
        (req.body.password === "" || req.body.password == null);
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "RESIDENT_FOLDER_UPDATED",
        resource: "resident_folder",
        resourceId: folder.id,
        description: "Resident folder updated",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { folderName: folder.name, residentId, passwordSet, passwordRemoved },
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
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { residentId, id: folderId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const folder = await residentFolderService.getFolder(
      tenantId,
      residentId,
      folderId,
      user
    );
    await residentFolderService.deleteFolder(
      tenantId,
      residentId,
      folderId,
      user
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "RESIDENT_FOLDER_DELETED",
        resource: "resident_folder",
        resourceId: folderId,
        description: "Resident folder deleted",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { residentId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, message: "Folder deleted" });
  } catch (err) {
    next(err);
  }
};
