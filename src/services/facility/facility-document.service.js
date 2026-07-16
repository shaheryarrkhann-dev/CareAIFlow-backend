const prisma = require("../../lib/prisma");
const facilityService = require("./facility.service");
const facilityFolderService = require("./facility-folder.service");
const {
  uploadFacilityDocumentToS3,
  downloadFileFromS3,
  deleteFileFromS3,
  getPresignedViewUrl,
} = require("../../utils/s3.util");
const { verifyFolderPassword } = require("../../utils/folderPassword.util");

const ERR_FOLDER_PASSWORD_REQUIRED = "Folder is password protected. Provide the folder password.";
const ERR_FOLDER_PASSWORD_INVALID = "Invalid folder password.";

/**
 * List documents for a facility (optionally filtered by folder)
 * @param {string} tenantId - Tenant ID
 * @param {Object} options - { folderId?, facilityId?, page?, limit?, folderPassword? }
 * @returns {Promise<Object>} { documents, pagination }
 */
async function listDocuments(tenantId, options = {}) {
  const { facilityId } = options;
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const { folderId, page = 1, limit = 50, folderPassword } = options;

  if (folderId) {
    const folder = await facilityFolderService.getFolderWithPassword(tenantId, folderId, facilityId);
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

  const where = { facilityId: facility.id };
  where.folderId = folderId || null;

  const [documents, total] = await Promise.all([
    prisma.facilityDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.facilityDocument.count({ where }),
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
 * @param {Object} params - { file (multer), folderId?, facilityId?, uploadedBy?, folderPassword? }
 * @returns {Promise<Object>} Created document record
 */
async function uploadDocument(tenantId, params) {
  const { facilityId } = params;
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const { file, folderId, uploadedBy, folderPassword } = params;

  if (!file || !file.buffer) throw new Error("File is required");

  if (folderId) {
    const folder = await facilityFolderService.getFolderWithPassword(tenantId, folderId, facilityId);
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

  const result = await uploadFacilityDocumentToS3({
    tenantId,
    folderId: folderId || null,
    fileName: file.originalname,
    buffer: file.buffer,
    mimeType: file.mimetype || "application/octet-stream",
  });

  return prisma.facilityDocument.create({
    data: {
      facilityId: facility.id,
      folderId: folderId || null,
      fileName: file.originalname,
      s3Key: result.s3Key,
      s3Url: result.s3Url,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedBy: uploadedBy || null,
    },
  });
}

/**
 * Get document by ID (for download)
 * @param {string} tenantId - Tenant ID
 * @param {string} documentId - Document ID
 * @param {string} [facilityId] - Optional facility ID
 * @returns {Promise<Object>} Document record
 */
async function getDocument(tenantId, documentId, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const doc = await prisma.facilityDocument.findFirst({
    where: { id: documentId, facilityId: facility.id },
  });
  if (!doc) throw new Error("Document not found");
  return doc;
}

/**
 * Download document (returns buffer and metadata)
 * @param {string} tenantId - Tenant ID
 * @param {string} documentId - Document ID
 * @param {string} [facilityId] - Optional facility ID
 * @param {string} [folderPassword] - Required if document is in a password-protected folder
 * @returns {Promise<{ buffer, fileName, mimeType }>}
 */
async function downloadDocument(tenantId, documentId, facilityId, folderPassword) {
  const doc = await getDocument(tenantId, documentId, facilityId);
  if (doc.folderId) {
    const folder = await facilityFolderService.getFolderWithPassword(tenantId, doc.folderId, facilityId);
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
 * @param {string} documentId - Document ID
 * @param {string} [facilityId] - Optional facility ID
 * @param {string} [folderPassword] - Required if document is in a password-protected folder
 * @returns {Promise<{ viewUrl, mimeType }>}
 */
async function getViewUrl(tenantId, documentId, facilityId, folderPassword) {
  const doc = await getDocument(tenantId, documentId, facilityId);
  if (doc.folderId) {
    const folder = await facilityFolderService.getFolderWithPassword(tenantId, doc.folderId, facilityId);
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
 * @param {string} documentId - Document ID
 * @param {string} [facilityId] - Optional facility ID
 */
async function deleteDocument(tenantId, documentId, facilityId) {
  const doc = await getDocument(tenantId, documentId, facilityId);
  await deleteFileFromS3(doc.s3Key);
  await prisma.facilityDocument.delete({
    where: { id: documentId },
  });
}

module.exports = {
  listDocuments,
  uploadDocument,
  getDocument,
  downloadDocument,
  getViewUrl,
  deleteDocument,
};
