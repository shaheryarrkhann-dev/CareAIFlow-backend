const { validationResult } = require("express-validator");
const staffDocumentService = require("../../services/staff/staff-document.service");
const staffDocumentAlertService = require("../../services/staff/staff-document-alert.service");
const staffMemberService = require("../../services/staff/staff-member.service");
const { createAuditLog } = require("../../services/compliance/audit.service");
const { isStaffDocumentsAdmin } = require("../../middlewares/staff-self-access.middleware");

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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const { folderId, documentType, page, limit } = req.query;
    const result = await staffDocumentService.listDocuments(
      tenantId,
      req.params.staffId,
      {
        folderId: folderId || undefined,
        documentType: documentType || undefined,
        page: page ? Number.parseInt(page, 10) : undefined,
        limit: limit ? Number.parseInt(limit, 10) : undefined,
        folderPassword: resolveFolderPassword(req),
      }
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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File is required" });
    }
    const documentType = req.body.documentType;
    if (!documentType || !["LICENSE", "CERTIFICATION", "TRAINING"].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: "documentType is required (LICENSE, CERTIFICATION, or TRAINING)",
      });
    }
    const doc = await staffDocumentService.uploadDocument(
      tenantId,
      req.params.staffId,
      {
        file: req.file,
        documentType,
        folderId: req.body.folderId || undefined,
        expirationDate: req.body.expirationDate || undefined,
        uploadedBy: req.user.id,
        folderPassword: resolveFolderPassword(req),
      }
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "STAFF_DOCUMENT_UPLOADED",
        resource: "staff_document",
        resourceId: doc.id,
        description: "Staff document uploaded",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, documentType: doc.documentType },
      });
    } catch (error_) {
      console.error("Audit log failed:", error_?.message);
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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const { buffer, fileName, mimeType } =
      await staffDocumentService.downloadDocument(
        tenantId,
        req.params.staffId,
        req.params.id,
        resolveFolderPassword(req)
      );
    // Sanitize filename for Content-Disposition: remove chars that break headers
    const safeFileName = (fileName || "document")
      .replaceAll(/["\\]/g, "'")
      .replaceAll(/[\r\n]/g, " ");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const { viewUrl, mimeType } = await staffDocumentService.getViewUrl(
      tenantId,
      req.params.staffId,
      req.params.id,
      resolveFolderPassword(req)
    );
    try {
      const doc = await staffDocumentService.getDocument(tenantId, req.params.staffId, req.params.id);
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "STAFF_DOCUMENT_VIEWED",
        resource: "staff_document",
        resourceId: req.params.id,
        description: "Staff document viewed",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName, staffId: req.params.staffId },
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
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const doc = await staffDocumentService.getDocument(
      tenantId,
      req.params.staffId,
      req.params.id
    );
    await staffDocumentService.deleteDocument(
      tenantId,
      req.params.staffId,
      req.params.id
    );
    try {
      await createAuditLog({
        userId: req.user.id,
        tenantId,
        action: "STAFF_DOCUMENT_DELETED",
        resource: "staff_document",
        resourceId: req.params.id,
        description: "Staff document deleted",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { fileName: doc.fileName },
      });
    } catch (error_) {
      console.error("Audit log failed:", error_?.message);
    }
    return res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    next(err);
  }
};

exports.getComplianceStatus = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const result = await staffDocumentService.getComplianceStatus(
      tenantId,
      req.params.staffId
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/staff/compliance-summary
 * List all staff with compliance status for dashboard
 */
exports.getComplianceSummary = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    let restrictToStaffMemberId = null;
    if (!isStaffDocumentsAdmin(req.user)) {
      restrictToStaffMemberId = await staffMemberService.findStaffMemberIdForUser(
        tenantId,
        req.user.id,
      );
      if (!restrictToStaffMemberId) {
        return res.json({ success: true, summary: [] });
      }
    }
    const summary = await staffDocumentService.getComplianceSummary(
      tenantId,
      restrictToStaffMemberId,
    );
    return res.json({ success: true, summary });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/staff/alerts
 * Get staff document alerts (expired / expiring soon) for current tenant
 */
exports.getStaffAlerts = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    let restrictToStaffMemberId = null;
    if (!isStaffDocumentsAdmin(req.user)) {
      restrictToStaffMemberId = await staffMemberService.findStaffMemberIdForUser(
        tenantId,
        req.user.id,
      );
      if (!restrictToStaffMemberId) {
        return res.json({
          success: true,
          alerts: {
            staffWithAlerts: [],
            hasExpired: false,
            hasExpiringSoon: false,
          },
        });
      }
    }
    const alerts = await staffDocumentAlertService.checkStaffDocumentAlerts(
      tenantId,
      restrictToStaffMemberId,
    );
    return res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
};
