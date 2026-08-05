const prisma = require("../../lib/prisma");
const facilityService = require("./facility.service");
const { deleteFileFromS3 } = require("../../utils/s3.util");
const { hashFolderPassword, verifyFolderPassword } = require("../../utils/folderPassword.util");
const { DEFAULT_FACILITY_ROOT_FOLDERS } = require("../../constants/facilityDefaultFolders");

const folderListOrderBy = [{ sortOrder: "asc" }, { name: "asc" }];

/** Strip passwordHash from folder and add isPasswordProtected for API response (flat, no children). */
function sanitizeFolderForResponse(folder) {
  if (!folder) return folder;
  const { passwordHash, children, ...rest } = folder;
  return { ...rest, isPasswordProtected: !!passwordHash };
}

/**
 * Create standard root folders for a facility (idempotent by name at root).
 * @param {string} facilityId
 */
async function ensureDefaultFacilityFolders(facilityId) {
  for (const { name, sortOrder } of DEFAULT_FACILITY_ROOT_FOLDERS) {
    const exists = await prisma.facilityFolder.findFirst({
      where: { facilityId, parentId: null, name },
    });
    if (!exists) {
      await prisma.facilityFolder.create({
        data: {
          facilityId,
          parentId: null,
          name,
          sortOrder,
          isSystemDefault: true,
          size: "MEDIUM",
        },
      });
    }
  }
}

/**
 * Get direct children only: root folders (parentId null) or subfolders of a given parent. Each with itemCount.
 * @param {string} tenantId - Tenant ID
 * @param {string} [facilityId] - Optional facility ID
 * @param {string|null} [parentId] - null/undefined = return root folders only; otherwise return folders where parentId = parentId
 * @returns {Promise<Array>} Folders with itemCount, no passwordHash, no nested children
 */
async function getFolders(tenantId, facilityId, parentId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);

  const isRoot = parentId == null || parentId === "";
  if (isRoot) {
    const rootCount = await prisma.facilityFolder.count({
      where: { facilityId: facility.id, parentId: null },
    });
    if (rootCount === 0) {
      await ensureDefaultFacilityFolders(facility.id);
    }
  }

  const folders = await prisma.facilityFolder.findMany({
    where: {
      facilityId: facility.id,
      parentId: isRoot ? null : parentId,
    },
    orderBy: folderListOrderBy,
  });

  if (folders.length === 0) return folders.map(sanitizeFolderForResponse);

  const folderIds = folders.map((f) => f.id);

  const [docCounts, subfolderCounts] = await Promise.all([
    prisma.facilityDocument.groupBy({
      by: ["folderId"],
      where: {
        facilityId: facility.id,
        folderId: { in: folderIds },
      },
      _count: { id: true },
    }),
    prisma.facilityFolder.groupBy({
      by: ["parentId"],
      where: {
        facilityId: facility.id,
        parentId: { in: folderIds },
      },
      _count: { id: true },
    }),
  ]);

  const docCountByFolderId = new Map(
    docCounts.map((r) => [r.folderId, r._count.id])
  );
  const subfolderCountByParentId = new Map(
    subfolderCounts.map((r) => [r.parentId, r._count.id])
  );

  return folders.map((f) => {
    const docCount = docCountByFolderId.get(f.id) ?? 0;
    const subfolderCount = subfolderCountByParentId.get(f.id) ?? 0;
    const itemCount = docCount + subfolderCount;
    const sanitized = sanitizeFolderForResponse(f);
    return { ...sanitized, itemCount };
  });
}

/**
 * Get folder contents: direct subfolders (with itemCount) + documents in that folder. One call when user opens a folder.
 * Validates folder password if protected.
 * @param {string} tenantId - Tenant ID
 * @param {string} [facilityId] - Optional facility ID
 * @param {string} folderId - Folder ID to get contents of
 * @param {string} [folderPassword] - Required if folder is password-protected
 * @returns {Promise<{ folders: Array, documents: Array }>}
 */
async function getFolderContents(tenantId, facilityId, folderId, folderPassword) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const folder = await getFolderWithPassword(tenantId, folderId, facilityId);
  if (!folder) {
    const err = new Error("Folder not found");
    err.status = 404;
    throw err;
  }
  if (folder.passwordHash) {
    if (folderPassword == null || String(folderPassword).trim() === "") {
      const err = new Error("Folder is password protected. Provide the folder password.");
      err.status = 403;
      throw err;
    }
    const valid = await verifyFolderPassword(folderPassword, folder.passwordHash);
    if (!valid) {
      const err = new Error("Invalid folder password.");
      err.status = 403;
      throw err;
    }
  }

  const facilityDocumentService = require("./facility-document.service");
  const [folders, docResult] = await Promise.all([
    getFolders(tenantId, facilityId, folderId),
    facilityDocumentService.listDocuments(tenantId, {
      facilityId: facility.id,
      folderId,
      folderPassword,
      page: 1,
      limit: 500,
    }),
  ]);

  return {
    folders,
    documents: docResult.documents,
  };
}

/**
 * Create a folder
 * @param {string} tenantId - Tenant ID
 * @param {Object} data - { name, parentId?, size?, color?, password? } (size commented out: use global size on client)
 * @param {string} [facilityId] - Optional facility ID
 * @returns {Promise<Object>} Created folder (no passwordHash)
 */
async function createFolder(tenantId, data, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const { name, parentId, color, password } = data;
  // const { name, parentId, size, color, password } = data; // per-folder size: may re-enable on client demand

  if (parentId) {
    const parent = await prisma.facilityFolder.findFirst({
      where: { id: parentId, facilityId: facility.id },
    });
    if (!parent) throw new Error("Parent folder not found");
  }

  // Per-folder size disabled; use global size on client. DB column kept with default.
  // const validSizes = ["SMALL", "MEDIUM", "LARGE"];
  // const folderSize = size && validSizes.includes(size) ? size : "MEDIUM";
  const folderColor = color != null && String(color).trim() !== "" ? String(color).trim() : null;
  const passwordHash = await hashFolderPassword(password);

  const folder = await prisma.facilityFolder.create({
    data: {
      facilityId: facility.id,
      parentId: parentId || null,
      name: name.trim(),
      size: "MEDIUM", // was: folderSize — per-folder size commented out
      color: folderColor,
      passwordHash,
    },
  });
  return sanitizeFolderForResponse(folder);
}

/**
 * Update a folder
 * @param {string} tenantId - Tenant ID
 * @param {string} folderId - Folder ID
 * @param {Object} data - { name?, size?, color?, password? } (password empty/null = remove; size commented out)
 * @param {string} [facilityId] - Optional facility ID
 * @returns {Promise<Object>} Updated folder (no passwordHash)
 */
async function updateFolder(tenantId, folderId, data, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const folder = await prisma.facilityFolder.findFirst({
    where: { id: folderId, facilityId: facility.id },
  });
  if (!folder) throw new Error("Folder not found");

  const updateData = {};
  if (data.name != null) updateData.name = data.name.trim();
  // Per-folder size disabled; use global size on client.
  // if (data.size != null) {
  //   const validSizes = ["SMALL", "MEDIUM", "LARGE"];
  //   updateData.size = validSizes.includes(data.size) ? data.size : folder.size;
  // }
  if (data.color !== undefined) {
    updateData.color = data.color != null && String(data.color).trim() !== "" ? String(data.color).trim() : null;
  }
  if (data.password !== undefined) {
    const isEmpty = data.password == null || String(data.password).trim() === "";
    if (isEmpty && folder.passwordHash) {
      const currentPassword = data.currentPassword != null ? String(data.currentPassword).trim() : "";
      if (!currentPassword) {
        const err = new Error("Current password is required to remove folder password.");
        err.status = 400;
        throw err;
      }
      const valid = await verifyFolderPassword(currentPassword, folder.passwordHash);
      if (!valid) {
        const err = new Error("Current password is incorrect. Cannot remove folder password.");
        err.status = 403;
        throw err;
      }
      updateData.passwordHash = null;
    } else {
      updateData.passwordHash = await hashFolderPassword(data.password);
    }
  }
  if (Object.keys(updateData).length === 0) return sanitizeFolderForResponse(folder);

  const updated = await prisma.facilityFolder.update({
    where: { id: folderId },
    data: updateData,
  });
  return sanitizeFolderForResponse(updated);
}

/**
 * Get folder by id for a facility (returns minimal fields including facilityId)
 */
async function getFolder(tenantId, folderId, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  return prisma.facilityFolder.findFirst({
    where: { id: folderId, facilityId: facility.id },
    select: { id: true, facilityId: true },
  });
}

/**
 * Get folder by id with passwordHash (for access check). Returns null if not found.
 */
async function getFolderWithPassword(tenantId, folderId, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  return prisma.facilityFolder.findFirst({
    where: { id: folderId, facilityId: facility.id },
    select: { id: true, passwordHash: true },
  });
}

/**
 * Delete a folder (recursively deletes children and all documents inside)
 * Deletes S3 files and DB records for documents before deleting the folder
 * @param {string} tenantId - Tenant ID
 * @param {string} folderId - Folder ID
 * @param {string} [facilityId] - Optional facility ID
 */
async function deleteFolder(tenantId, folderId, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const folder = await prisma.facilityFolder.findFirst({
    where: { id: folderId, facilityId: facility.id },
    include: { children: true },
  });
  if (!folder) throw new Error("Folder not found");

  if (folder.isSystemDefault) {
    const err = new Error(
      "This folder is part of the standard facility file structure and cannot be deleted."
    );
    err.status = 403;
    throw err;
  }

  // Recursively delete children first
  for (const child of folder.children) {
    await deleteFolder(tenantId, child.id, facilityId);
  }

  // Delete all documents in this folder (S3 + DB)
  const docs = await prisma.facilityDocument.findMany({
    where: { folderId },
    select: { id: true, s3Key: true },
  });
  for (const doc of docs) {
    try {
      await deleteFileFromS3(doc.s3Key);
    } catch (e) {
      console.error("Failed to delete S3 file:", doc.s3Key, e?.message);
    }
    await prisma.facilityDocument.delete({ where: { id: doc.id } });
  }

  await prisma.facilityFolder.delete({
    where: { id: folderId },
  });
}

module.exports = {
  getFolders,
  getFolderContents,
  getFolder,
  getFolderWithPassword,
  createFolder,
  updateFolder,
  deleteFolder,
  ensureDefaultFacilityFolders,
};
