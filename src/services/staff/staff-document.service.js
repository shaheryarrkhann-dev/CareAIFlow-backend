const prisma = require("../../lib/prisma");
const staffMemberService = require("./staff-member.service");
const staffFolderService = require("./staff-folder.service");
const {
  uploadStaffDocumentToS3,
  downloadFileFromS3,
  deleteFileFromS3,
  getPresignedViewUrl,
} = require("../../utils/s3.util");
const { verifyFolderPassword } = require("../../utils/folderPassword.util");

const ERR_FOLDER_PASSWORD_REQUIRED = "Folder is password protected. Provide the folder password.";
const ERR_FOLDER_PASSWORD_INVALID = "Invalid folder password.";

/**
 * List documents for a staff member
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {Object} options - { folderId?, documentType?, page?, limit?, folderPassword? }
 * @returns {Promise<Object>} { documents, pagination }
 */
async function listDocuments(tenantId, staffId, options = {}) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const { folderId, documentType, page = 1, limit = 50, folderPassword } = options;

  if (folderId) {
    const folder = await staffFolderService.getFolderWithPassword(tenantId, staffId, folderId);
    if (folder?.passwordHash) {
      if (folderPassword == null || String(folderPassword).trim() === "") {
        const err = new Error(ERR_FOLDER_PASSWORD_REQUIRED);
        err.status = 403;
        throw err;
      }
      const valid = await verifyFolderPassword(folderPassword, folder.passwordHash);
      if (!valid) {
        const err = new Error(ERR_FOLDER_PASSWORD_INVALID);
        err.status = 403;
        throw err;
      }
    }
  }

  const where = { staffId };
  where.folderId = folderId || null;
  if (documentType) where.documentType = documentType;

  const [documents, total] = await Promise.all([
    prisma.staffDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.staffDocument.count({ where }),
  ]);

  return {
    documents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Upload a document
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {Object} params - { file (multer), documentType, folderId?, expirationDate?, uploadedBy?, folderPassword? }
 * @returns {Promise<Object>} Created document record
 */
async function uploadDocument(tenantId, staffId, params) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const { file, documentType, folderId, expirationDate, uploadedBy, folderPassword } = params;

  if (!file || !file.buffer) throw new Error("File is required");
  if (!documentType || !["LICENSE", "CERTIFICATION", "TRAINING"].includes(documentType)) {
    throw new Error("documentType must be LICENSE, CERTIFICATION, or TRAINING");
  }

  if (folderId) {
    const folder = await staffFolderService.getFolderWithPassword(tenantId, staffId, folderId);
    if (!folder) throw new Error("Folder not found");
    if (folder.passwordHash) {
      if (folderPassword == null || String(folderPassword).trim() === "") {
        const err = new Error(ERR_FOLDER_PASSWORD_REQUIRED);
        err.status = 403;
        throw err;
      }
      const valid = await verifyFolderPassword(folderPassword, folder.passwordHash);
      if (!valid) {
        const err = new Error(ERR_FOLDER_PASSWORD_INVALID);
        err.status = 403;
        throw err;
      }
    }
  }

  const result = await uploadStaffDocumentToS3({
    tenantId,
    staffId,
    folderId: folderId || null,
    fileName: file.originalname,
    buffer: file.buffer,
    mimeType: file.mimetype || "application/octet-stream",
  });

  return prisma.staffDocument.create({
    data: {
      staffId,
      documentType,
      folderId: folderId || null,
      fileName: file.originalname,
      s3Key: result.s3Key,
      s3Url: result.s3Url,
      fileSize: file.size,
      mimeType: file.mimetype,
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      uploadedBy: uploadedBy || null,
    },
  });
}

/**
 * Get document by ID
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {string} documentId - Document ID
 * @returns {Promise<Object>} Document record
 */
async function getDocument(tenantId, staffId, documentId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const doc = await prisma.staffDocument.findFirst({
    where: { id: documentId, staffId },
  });
  if (!doc) throw new Error("Document not found");
  return doc;
}

/**
 * Download document (returns buffer and metadata)
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {string} documentId - Document ID
 * @param {string} [folderPassword] - Required if document is in a password-protected folder
 * @returns {Promise<{ buffer, fileName, mimeType }>}
 */
async function downloadDocument(tenantId, staffId, documentId, folderPassword) {
  const doc = await getDocument(tenantId, staffId, documentId);
  if (doc.folderId) {
    const folder = await staffFolderService.getFolderWithPassword(tenantId, staffId, doc.folderId);
    if (folder?.passwordHash) {
      if (folderPassword == null || String(folderPassword).trim() === "") {
        const err = new Error(ERR_FOLDER_PASSWORD_REQUIRED);
        err.status = 403;
        throw err;
      }
      const valid = await verifyFolderPassword(folderPassword, folder.passwordHash);
      if (!valid) {
        const err = new Error(ERR_FOLDER_PASSWORD_INVALID);
        err.status = 403;
        throw err;
      }
    }
  }
  const buffer = await downloadFileFromS3(doc.s3Key);
  return {
    buffer,
    fileName: doc.fileName,
    mimeType: doc.mimeType || "application/octet-stream",
  };
}

/**
 * Get a presigned URL for viewing the document inline in the browser.
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {string} documentId - Document ID
 * @param {string} [folderPassword] - Required if document is in a password-protected folder
 * @returns {Promise<{ viewUrl, mimeType }>}
 */
async function getViewUrl(tenantId, staffId, documentId, folderPassword) {
  const doc = await getDocument(tenantId, staffId, documentId);
  if (doc.folderId) {
    const folder = await staffFolderService.getFolderWithPassword(tenantId, staffId, doc.folderId);
    if (folder?.passwordHash) {
      if (folderPassword == null || String(folderPassword).trim() === "") {
        const err = new Error(ERR_FOLDER_PASSWORD_REQUIRED);
        err.status = 403;
        throw err;
      }
      const valid = await verifyFolderPassword(folderPassword, folder.passwordHash);
      if (!valid) {
        const err = new Error(ERR_FOLDER_PASSWORD_INVALID);
        err.status = 403;
        throw err;
      }
    }
  }
  const viewUrl = await getPresignedViewUrl(doc.s3Key);
  return {
    viewUrl,
    mimeType: doc.mimeType || "application/octet-stream",
  };
}

/**
 * Delete a document
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {string} documentId - Document ID
 */
async function deleteDocument(tenantId, staffId, documentId) {
  const doc = await getDocument(tenantId, staffId, documentId);
  await deleteFileFromS3(doc.s3Key);
  await prisma.staffDocument.delete({
    where: { id: documentId },
  });
}

/**
 * Get compliance status for a staff member (Phase 5 placeholder - basic logic)
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @returns {Promise<Object>} { status, details }
 */
async function getComplianceStatus(tenantId, staffId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);

  const documents = await prisma.staffDocument.findMany({
    where: { staffId },
  });

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let status = "COMPLIANT";
  const expired = [];
  const expiringSoon = [];

  for (const doc of documents) {
    if (doc.expirationDate) {
      const exp = new Date(doc.expirationDate);
      if (exp < now) {
        expired.push({ id: doc.id, fileName: doc.fileName, expirationDate: doc.expirationDate });
        status = "NON_COMPLIANT";
      } else if (exp <= thirtyDaysFromNow) {
        expiringSoon.push({ id: doc.id, fileName: doc.fileName, expirationDate: doc.expirationDate });
        if (status !== "NON_COMPLIANT") status = "EXPIRING_SOON";
      }
    }
  }

  return {
    status,
    details: { expired, expiringSoon },
  };
}

/**
 * Get compliance summary for all staff in a tenant (optionally one staff member)
 * @param {string} tenantId - Tenant ID
 * @param {string|null} restrictToStaffMemberId - If set, only that StaffMember row
 * @returns {Promise<Array>} Array of { staffId, staffName, status, expired, expiringSoon }
 */
async function getComplianceSummary(tenantId, restrictToStaffMemberId = null) {
  const where = { tenantId };
  if (restrictToStaffMemberId) {
    where.id = restrictToStaffMemberId;
  }

  const staffMembers = await prisma.staffMember.findMany({
    where,
    include: {
      user: { select: { name: true, email: true } },
      documents: { select: { id: true, fileName: true, expirationDate: true } },
    },
  });

  const now = new Date();
  const thirtyDaysFromNow = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const summary = staffMembers.map((staff) => {
    let status = "COMPLIANT";
    const expired = [];
    const expiringSoon = [];

    for (const doc of staff.documents) {
      if (doc.expirationDate) {
        const exp = new Date(doc.expirationDate);
        if (exp < now) {
          expired.push({
            id: doc.id,
            fileName: doc.fileName,
            expirationDate: doc.expirationDate,
          });
          status = "NON_COMPLIANT";
        } else if (exp <= thirtyDaysFromNow) {
          expiringSoon.push({
            id: doc.id,
            fileName: doc.fileName,
            expirationDate: doc.expirationDate,
          });
          if (status !== "NON_COMPLIANT") status = "EXPIRING_SOON";
        }
      }
    }

    return {
      staffId: staff.id,
      staffName: staff.user?.name ?? "Unknown",
      staffEmail: staff.user?.email ?? null,
      status,
      expired,
      expiringSoon,
    };
  });

  return summary;
}

module.exports = {
  listDocuments,
  uploadDocument,
  getDocument,
  downloadDocument,
  getViewUrl,
  deleteDocument,
  getComplianceStatus,
  getComplianceSummary,
};
