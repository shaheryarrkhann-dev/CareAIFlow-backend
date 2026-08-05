const { validationResult } = require("express-validator");
const staffFolderService = require("../../services/staff/staff-folder.service");
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

/** GET /:staffId/folders?parentId= — parentId optional; when absent, returns root folders only. */
exports.getFolders = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const parentId = req.query.parentId === undefined || req.query.parentId === "" ? null : req.query.parentId;
    const folders = await staffFolderService.getFolders(tenantId, req.params.staffId, parentId);
    return res.json({ success: true, folders });
  } catch (err) {
    next(err);
  }
};

/** GET /:staffId/folders/:id/contents — subfolders + documents for that folder. Password via X-Folder-Password or query. */
exports.getFolderContents = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const folderId = req.params.id;
    const folderPassword = req.get("X-Folder-Password") ?? req.query.folderPassword;
    const contents = await staffFolderService.getFolderContents(
      tenantId,
      req.params.staffId,
      folderId,
      folderPassword
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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const folder = await staffFolderService.createFolder(
      tenantId,
      req.params.staffId,
      req.body
    );
    try {
      const passwordSet = !!(req.body.password && String(req.body.password).trim());
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "STAFF_FOLDER_CREATED",
        resource: "staff_folder",
        resourceId: folder.id,
        description: "Staff folder created",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { folderName: folder.name, staffId: req.params.staffId, passwordSet },
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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const folder = await staffFolderService.updateFolder(
      tenantId,
      req.params.staffId,
      req.params.id,
      req.body
    );
    try {
      const passwordSet = !!(req.body.password && String(req.body.password).trim());
      const passwordRemoved = Object.prototype.hasOwnProperty.call(req.body, "password") &&
        (req.body.password === "" || req.body.password == null);
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "STAFF_FOLDER_UPDATED",
        resource: "staff_folder",
        resourceId: folder.id,
        description: "Staff folder updated",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { folderName: folder.name, passwordSet, passwordRemoved },
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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    await staffFolderService.deleteFolder(
      tenantId,
      req.params.staffId,
      req.params.id
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "STAFF_FOLDER_DELETED",
        resource: "staff_folder",
        resourceId: req.params.id,
        description: "Staff folder deleted",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, message: "Folder deleted" });
  } catch (err) {
    next(err);
  }
};
