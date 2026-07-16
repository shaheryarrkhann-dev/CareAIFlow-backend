const prisma = require("../../lib/prisma");
const { getResidentById } = require("./resident.service");
const residentFolderService = require("./resident-folder.service");
const {
  uploadResidentDocumentToS3,
  downloadFileFromS3,
  deleteFileFromS3,
  getPresignedViewUrl,
} = require("../../utils/s3.util");
const { verifyFolderPassword } = require("../../utils/folderPassword.util");

const ERR_FOLDER_PASSWORD_REQUIRED = "Folder is password protected. Provide the folder password.";
const ERR_FOLDER_PASSWORD_INVALID = "Invalid folder password.";

/**
 * Get folder IDs the user can access for a resident (includes null for root).
 * Returns { allowedFolderIds: string[] | null } where null means no restriction (all folders).
 */
async function getAllowedFolderIdsForList(tenantId, residentId, user) {
  const folders = await prisma.residentFolder.findMany({
    where: { residentId },
    select: { id: true, allowedRoles: true },
  });
  const allowedIds = folders
    .filter((f) => residentFolderService.canUserAccessFolder(f, user.role))
    .map((f) => f.id);
  return allowedIds;
}

/**
 * List documents for a resident (only in folders visible to user's role)
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {Object} options - { folderId?, category?, tag?, pinned?, page?, limit?, folderPassword? }
 * @param {Object} user - Request user
 * @returns {Promise<Object>} { documents, pagination }
 */
async function listDocuments(tenantId, residentId, options = {}, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const { folderId, category, tag, pinned, page = 1, limit = 50, folderPassword } = options;

  const where = { residentId };
  if (folderId !== undefined) {
    if (folderId) {
      const folder = await residentFolderService.getFolderWithPassword(tenantId, residentId, folderId, user);
      if (!folder) {
        return {
          documents: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        };
      }
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
    where.folderId = folderId || null;
  } else {
    const allowedIds = await getAllowedFolderIdsForList(tenantId, residentId, user);
    where.OR = [{ folderId: null }, { folderId: { in: allowedIds } }];
  }
  if (category) where.category = category;
  if (tag && typeof tag === "string" && tag.trim()) where.tags = { has: tag.trim() };
  if (pinned === true) where.isPinned = true;

  const [documents, total] = await Promise.all([
    prisma.residentDocument.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.residentDocument.count({ where }),
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
 * @param {string} residentId - Resident ID
 * @param {Object} params - { file, folderId?, category?, tags?, uploadedBy?, folderPassword? }
 * @param {Object} user - Request user
 * @returns {Promise<Object>} Created document record
 */
async function uploadDocument(tenantId, residentId, params, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const { file, folderId, category, tags, uploadedBy, folderPassword } = params;

  if (!file || !file.buffer) throw new Error("File is required");

  if (folderId) {
    const folder = await residentFolderService.getFolderWithPassword(tenantId, residentId, folderId, user);
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

  const result = await uploadResidentDocumentToS3({
    tenantId,
    residentId,
    folderId: folderId || null,
    fileName: file.originalname,
    buffer: file.buffer,
    mimeType: file.mimetype || "application/octet-stream",
  });

  return prisma.residentDocument.create({
    data: {
      residentId,
      folderId: folderId || null,
      category: category || null,
      tags: Array.isArray(tags) ? tags : [],
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
 * Get document by ID (enforces folder visibility by role)
 */
async function getDocument(tenantId, residentId, documentId, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const doc = await prisma.residentDocument.findFirst({
    where: { id: documentId, residentId },
  });
  if (!doc) throw new Error("Document not found");
  if (doc.folderId) {
    await residentFolderService.getFolder(tenantId, residentId, doc.folderId, user);
  }
  return doc;
}

/**
 * Download document (returns buffer and metadata)
 * @param {string} [folderPassword] - Required if document is in a password-protected folder
 */
async function downloadDocument(tenantId, residentId, documentId, folderPassword, user) {
  const doc = await getDocument(tenantId, residentId, documentId, user);
  if (doc.folderId) {
    const folder = await residentFolderService.getFolderWithPassword(tenantId, residentId, doc.folderId, user);
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
 * @param {string} residentId - Resident ID
 * @param {string} documentId - Document ID
 * @param {string} [folderPassword] - Required if document is in a password-protected folder
 * @param {Object} user - Request user
 * @returns {Promise<{ viewUrl, mimeType }>}
 */
async function getViewUrl(tenantId, residentId, documentId, folderPassword, user) {
  const doc = await getDocument(tenantId, residentId, documentId, user);
  if (doc.folderId) {
    const folder = await residentFolderService.getFolderWithPassword(tenantId, residentId, doc.folderId, user);
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
 * Update document metadata (tags, category, isPinned)
 */
async function updateDocument(tenantId, residentId, documentId, data, user) {
  await getDocument(tenantId, residentId, documentId, user);
  const updateData = {};
  if (data.tags !== undefined) updateData.tags = Array.isArray(data.tags) ? data.tags : [];
  if (data.category !== undefined) updateData.category = data.category;
  if (data.isPinned !== undefined) updateData.isPinned = !!data.isPinned;
  return prisma.residentDocument.update({
    where: { id: documentId },
    data: updateData,
  });
}

/**
 * Delete a document
 */
async function deleteDocument(tenantId, residentId, documentId, user) {
  const doc = await getDocument(tenantId, residentId, documentId, user);
  await deleteFileFromS3(doc.s3Key);
  await prisma.residentDocument.delete({
    where: { id: documentId },
  });
}

module.exports = {
  listDocuments,
  uploadDocument,
  getDocument,
  downloadDocument,
  getViewUrl,
  updateDocument,
  deleteDocument,
};
