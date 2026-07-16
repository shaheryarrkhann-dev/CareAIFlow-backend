const { validationResult } = require("express-validator");
const facilityDocumentService = require("../../services/facility/facility-document.service");
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

function resolveFacilityId(req) {
  return req.query.facilityId || req.body?.facilityId;
}

function resolveFolderPassword(req) {
  return req.get("x-folder-password") || req.query.folderPassword || req.body?.folderPassword || undefined;
}

exports.listDocuments = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { folderId, facilityId, page, limit } = req.query;
    const result = await facilityDocumentService.listDocuments(tenantId, {
      folderId: folderId || undefined,
      facilityId: facilityId || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      folderPassword: resolveFolderPassword(req),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.uploadDocument = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }
    const folderId = req.body.folderId || undefined;
    const facilityId = resolveFacilityId(req);
    const doc = await facilityDocumentService.uploadDocument(tenantId, {
      file: req.file,
      folderId,
      facilityId,
      uploadedBy: req.user.id,
      folderPassword: resolveFolderPassword(req),
    });
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "FACILITY_DOCUMENT_UPLOADED",
        resource: "facility_document",
        resourceId: doc.id,
        description: "Facility document uploaded",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, facilityId: doc.facilityId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.status(201).json({ success: true, document: doc });
  } catch (err) {
    next(err);
  }
};

exports.downloadDocument = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const { buffer, fileName, mimeType } =
      await facilityDocumentService.downloadDocument(
        tenantId,
        req.params.id,
        facilityId,
        resolveFolderPassword(req)
      );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};

exports.getViewUrl = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const { viewUrl, mimeType } = await facilityDocumentService.getViewUrl(
      tenantId,
      req.params.id,
      facilityId,
      resolveFolderPassword(req)
    );
    try {
      const doc = await facilityDocumentService.getDocument(tenantId, req.params.id, facilityId);
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "FACILITY_DOCUMENT_VIEWED",
        resource: "facility_document",
        resourceId: req.params.id,
        description: "Facility document viewed",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, facilityId: doc.facilityId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, viewUrl, mimeType });
  } catch (err) {
    next(err);
  }
};

exports.deleteDocument = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const doc = await facilityDocumentService.getDocument(
      tenantId,
      req.params.id,
      facilityId
    );
    await facilityDocumentService.deleteDocument(
      tenantId,
      req.params.id,
      facilityId
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "FACILITY_DOCUMENT_DELETED",
        resource: "facility_document",
        resourceId: req.params.id,
        description: "Facility document deleted",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, facilityId: doc.facilityId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    next(err);
  }
};
