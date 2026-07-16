const prisma = require("../../lib/prisma");
const { getResidentById } = require("./resident.service");
const { deleteFileFromS3 } = require("../../utils/s3.util");
const { hashFolderPassword, verifyFolderPassword } = require("../../utils/folderPassword.util");

/** Strip passwordHash from folder and add isPasswordProtected for API response */
function sanitizeFolderForResponse(folder) {
  if (!folder) return folder;
  const { passwordHash, ...rest } = folder;
  const out = { ...rest, isPasswordProtected: !!passwordHash };
  if (out.children && out.children.length) {
    out.children = out.children.map(sanitizeFolderForResponse);
  }
  return out;
}

/** Strip passwordHash and children for flat API response (direct children + itemCount). */
function sanitizeFolderFlat(folder) {
  if (!folder) return folder;
  const { passwordHash, children, ...rest } = folder;
  return { ...rest, isPasswordProtected: !!passwordHash };
}

/**
 * Check if user role can access a folder (based on allowedRoles).
 * SUPER_ADMIN can access all. Null/empty allowedRoles = all roles can access.
 */
function canUserAccessFolder(folder, userRole) {
  if (userRole === "SUPER_ADMIN") return true;
  const allowed = folder.allowedRoles;
  if (!allowed) return true;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  return allowed.includes(userRole);
}

/**
 * Filter folder tree by role (recursive); only return folders the user can access.
 */
function filterFolderTreeByRole(folders, userRole) {
  if (!folders || folders.length === 0) return [];
  return folders
    .filter((f) => canUserAccessFolder(f, userRole))
    .map((f) => ({
      ...f,
      children: filterFolderTreeByRole(f.children || [], userRole),
    }));
}

/**
 * Get direct children only: root folders (parentId null) or subfolders of a given parent. Each with itemCount. Filtered by user role.
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {string|null} [parentId] - null/undefined = root only; else folders where parentId = parentId
 * @param {Object} user - Request user (for getResidentById and role filter)
 * @returns {Promise<Array>} Folders with itemCount, no nested children
 */
async function getFolders(tenantId, residentId, parentId, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });

  const folders = await prisma.residentFolder.findMany({
    where: {
      residentId,
      parentId: parentId == null || parentId === "" ? null : parentId,
    },
    orderBy: { name: "asc" },
  });

  const allowed = folders.filter((f) => canUserAccessFolder(f, user.role));
  if (allowed.length === 0) return allowed.map(sanitizeFolderFlat);

  const folderIds = allowed.map((f) => f.id);
  const [docCounts, subfolderCounts] = await Promise.all([
    prisma.residentDocument.groupBy({
      by: ["folderId"],
      where: { residentId, folderId: { in: folderIds } },
      _count: { id: true },
    }),
    prisma.residentFolder.groupBy({
      by: ["parentId"],
      where: { residentId, parentId: { in: folderIds } },
      _count: { id: true },
    }),
  ]);
  const docCountByFolderId = new Map(docCounts.map((r) => [r.folderId, r._count.id]));
  const subfolderCountByParentId = new Map(subfolderCounts.map((r) => [r.parentId, r._count.id]));

  return allowed.map((f) => {
    const docCount = docCountByFolderId.get(f.id) ?? 0;
    const subfolderCount = subfolderCountByParentId.get(f.id) ?? 0;
    return { ...sanitizeFolderFlat(f), itemCount: docCount + subfolderCount };
  });
}

/**
 * Get folder contents: direct subfolders (with itemCount) + documents in that folder. Validates access and password.
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {string} folderId - Folder ID
 * @param {string} [folderPassword] - Required if folder is password-protected
 * @param {Object} user - Request user
 * @returns {Promise<{ folders: Array, documents: Array }>}
 */
async function getFolderContents(tenantId, residentId, folderId, folderPassword, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const folder = await getFolderWithPassword(tenantId, residentId, folderId, user);
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

  const residentDocumentService = require("./resident-document.service");
  const [folders, docResult] = await Promise.all([
    getFolders(tenantId, residentId, folderId, user),
    residentDocumentService.listDocuments(tenantId, residentId, {
      folderId,
      folderPassword,
      page: 1,
      limit: 500,
    }, user),
  ]);
  return { folders, documents: docResult.documents };
}

/**
 * Get folder tree for a resident (legacy; prefer getFolders + getFolderContents for Windows-style navigation)
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {Object} user - Request user (for getResidentById)
 * @returns {Promise<Array>} Root folders with nested children
 */
async function getFolderTree(tenantId, residentId, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });

  const folders = await prisma.residentFolder.findMany({
    where: { residentId },
    orderBy: { name: "asc" },
    include: {
      children: {
        orderBy: { name: "asc" },
        include: {
          children: {
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });

  const rootFolders = folders.filter((f) => !f.parentId);
  const filtered = filterFolderTreeByRole(rootFolders, user.role);
  return filtered.map(sanitizeFolderForResponse);
}

/**
 * Create a folder
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {Object} data - { name, parentId?, allowedRoles?, size?, color?, password? }
 * @param {Object} user - Request user
 * @returns {Promise<Object>} Created folder (no passwordHash)
 */
async function createFolder(tenantId, residentId, data, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const { name, parentId, allowedRoles, color, password } = data;

  if (parentId) {
    const parent = await prisma.residentFolder.findFirst({
      where: { id: parentId, residentId },
    });
    if (!parent) throw new Error("Parent folder not found");
    if (!canUserAccessFolder(parent, user.role)) throw new Error("Access denied to parent folder");
  }

  // Per-folder size disabled; use global size on client.
  // const validSizes = ["SMALL", "MEDIUM", "LARGE"];
  // const folderSize = size && validSizes.includes(size) ? size : "MEDIUM";
  const folderColor = color != null && String(color).trim() !== "" ? String(color).trim() : null;
  const passwordHash = await hashFolderPassword(password);

  const createData = {
    residentId,
    parentId: parentId || null,
    name: name.trim(),
    size: "MEDIUM",
    color: folderColor,
    passwordHash,
  };
  if (allowedRoles !== undefined) {
    createData.allowedRoles = Array.isArray(allowedRoles) ? allowedRoles : null;
  }
  const folder = await prisma.residentFolder.create({
    data: createData,
  });
  return sanitizeFolderForResponse(folder);
}

/**
 * Update a folder
 * @param {string} tenantId - Tenant ID
 * @param {string} residentId - Resident ID
 * @param {string} folderId - Folder ID
 * @param {Object} data - { name?, allowedRoles?, size?, color?, password?, currentPassword? } (password empty = remove)
 * @param {Object} user - Request user
 * @returns {Promise<Object>} Updated folder (no passwordHash)
 */
async function updateFolder(tenantId, residentId, folderId, data, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const folder = await prisma.residentFolder.findFirst({
    where: { id: folderId, residentId },
  });
  if (!folder) throw new Error("Folder not found");
  if (!canUserAccessFolder(folder, user.role)) throw new Error("Access denied to folder");

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.allowedRoles !== undefined) {
    updateData.allowedRoles = Array.isArray(data.allowedRoles) ? data.allowedRoles : null;
  }
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

  const updated = await prisma.residentFolder.update({
    where: { id: folderId },
    data: updateData,
  });
  return sanitizeFolderForResponse(updated);
}

/**
 * Get folder by id for a resident
 */
async function getFolder(tenantId, residentId, folderId, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const folder = await prisma.residentFolder.findFirst({
    where: { id: folderId, residentId },
    select: { id: true, residentId: true, allowedRoles: true },
  });
  if (folder && !canUserAccessFolder(folder, user.role)) throw new Error("Access denied to folder");
  return folder;
}

/**
 * Get folder by id with passwordHash (for document access check). Returns null if not found.
 */
async function getFolderWithPassword(tenantId, residentId, folderId, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const folder = await prisma.residentFolder.findFirst({
    where: { id: folderId, residentId },
    select: { id: true, passwordHash: true, allowedRoles: true },
  });
  if (folder && !canUserAccessFolder(folder, user.role)) return null;
  return folder;
}

/**
 * Delete a folder (cascade children and documents)
 */
async function deleteFolder(tenantId, residentId, folderId, user) {
  await getResidentById(residentId, { ...user, tenantId, tenantIdFromQuery: tenantId });
  const folder = await prisma.residentFolder.findFirst({
    where: { id: folderId, residentId },
    include: { children: true },
  });
  if (!folder) throw new Error("Folder not found");
  if (!canUserAccessFolder(folder, user.role)) throw new Error("Access denied to folder");

  for (const child of folder.children) {
    await deleteFolder(tenantId, residentId, child.id, user);
  }

  const docs = await prisma.residentDocument.findMany({
    where: { folderId },
    select: { id: true, s3Key: true },
  });
  for (const doc of docs) {
    try {
      await deleteFileFromS3(doc.s3Key);
    } catch (e) {
      console.error("Failed to delete S3 file:", doc.s3Key, e?.message);
    }
    await prisma.residentDocument.delete({ where: { id: doc.id } });
  }

  await prisma.residentFolder.delete({
    where: { id: folderId },
  });
}

module.exports = {
  getFolderTree,
  getFolders,
  getFolderContents,
  getFolder,
  getFolderWithPassword,
  createFolder,
  updateFolder,
  deleteFolder,
  canUserAccessFolder,
};
