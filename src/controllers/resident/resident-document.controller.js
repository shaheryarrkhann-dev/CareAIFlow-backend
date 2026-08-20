const { validationResult } = require("express-validator");
const residentDocumentService = require("../../services/resident/resident-document.service");
const {
  createAuditLog,
  getResidentDocumentAuditLogs,
} = require("../../services/compliance/audit.service");
const {
  afterResidentDocumentChange,
} = require("../../services/compliance/document-compliance.hooks");

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
    const { residentId } = req.params;
    const { folderId, category, tag, pinned, page, limit } = req.query;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const result = await residentDocumentService.listDocuments(
      tenantId,
      residentId,
      {
        folderId: folderId || undefined,
        category: category || undefined,
        tag: tag || undefined,
        pinned: pinned === "true" ? true : undefined,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        folderPassword: resolveFolderPassword(req),
      },
      user
    );
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
    const { residentId } = req.params;
    let category = req.body.category || undefined;
    let tags = req.body.tags;
    if (typeof tags === "string") {
      try {
        tags = JSON.parse(tags);
      } catch {
        tags = [];
      }
    }
    if (!Array.isArray(tags)) tags = [];
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const doc = await residentDocumentService.uploadDocument(
      tenantId,
      residentId,
      {
        file: req.file,
        folderId: req.body.folderId || undefined,
        category: category && ["LEGAL", "MEDICAL", "EXTERNAL_REPORT", "OTHER"].includes(category) ? category : undefined,
        tags,
        uploadedBy: req.user.id,
        expirationDate: req.body.expirationDate || undefined,
        folderPassword: resolveFolderPassword(req),
      },
      user
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "RESIDENT_DOCUMENT_UPLOADED",
        resource: "resident_document",
        resourceId: doc.id,
        description: "Resident document uploaded",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, residentId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    const documentCompliance = await afterResidentDocumentChange(
      tenantId,
      residentId,
      user,
      { req }
    );
    return res.status(201).json({ success: true, document: doc, documentCompliance });
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
    const { residentId, id: documentId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const { buffer, fileName, mimeType } =
      await residentDocumentService.downloadDocument(
        tenantId,
        residentId,
        documentId,
        resolveFolderPassword(req),
        user
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
    const { residentId, id: documentId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const { viewUrl, mimeType } = await residentDocumentService.getViewUrl(
      tenantId,
      residentId,
      documentId,
      resolveFolderPassword(req),
      user
    );
    try {
      const doc = await residentDocumentService.getDocument(tenantId, residentId, documentId, user);
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "RESIDENT_DOCUMENT_VIEWED",
        resource: "resident_document",
        resourceId: documentId,
        description: "Resident document viewed",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, residentId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, viewUrl, mimeType });
  } catch (err) {
    next(err);
  }
};

exports.updateDocument = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { residentId, id: documentId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const doc = await residentDocumentService.updateDocument(
      tenantId,
      residentId,
      documentId,
      req.body,
      user
    );
    try {
      const pinAction =
        req.body.isPinned !== undefined
          ? doc.isPinned
            ? "RESIDENT_DOCUMENT_PINNED"
            : "RESIDENT_DOCUMENT_UNPINNED"
          : "RESIDENT_DOCUMENT_MODIFIED";
      const description =
        pinAction === "RESIDENT_DOCUMENT_PINNED"
          ? "Resident document pinned"
          : pinAction === "RESIDENT_DOCUMENT_UNPINNED"
            ? "Resident document unpinned"
            : "Resident document metadata updated";
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: pinAction,
        resource: "resident_document",
        resourceId: documentId,
        description,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, residentId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    const documentCompliance = await afterResidentDocumentChange(
      tenantId,
      residentId,
      user,
      { req }
    );
    return res.json({ success: true, document: doc, documentCompliance });
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
    const { residentId, id: documentId } = req.params;
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const doc = await residentDocumentService.getDocument(
      tenantId,
      residentId,
      documentId,
      user
    );
    await residentDocumentService.deleteDocument(
      tenantId,
      residentId,
      documentId,
      user
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "RESIDENT_DOCUMENT_DELETED",
        resource: "resident_document",
        resourceId: documentId,
        description: "Resident document deleted",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, residentId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    const documentCompliance = await afterResidentDocumentChange(
      tenantId,
      residentId,
      user,
      { req }
    );
    return res.json({ success: true, message: "Document deleted", documentCompliance });
  } catch (err) {
    next(err);
  }
};

exports.getResidentDocumentAuditHistory = async (req, res, next) => {
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
    const { getResidentById } = require("../../services/resident/resident.service");
    await getResidentById(residentId, user);
    const { action, resource, startDate, endDate, page, limit } = req.query;
    const filters = {
      action: action || undefined,
      resource: resource || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: page ? Number.parseInt(page, 10) : 1,
      limit: limit ? Number.parseInt(limit, 10) : 50,
    };
    const result = await getResidentDocumentAuditLogs(tenantId, residentId, filters);
    return res.json({
      success: true,
      logs: result.logs,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};
