const prisma = require("../../lib/prisma");
const staffMemberService = require("./staff-member.service");
const { deleteFileFromS3 } = require("../../utils/s3.util");
const { hashFolderPassword, verifyFolderPassword } = require("../../utils/folderPassword.util");
const { DEFAULT_STAFF_ROOT_FOLDERS } = require("../../constants/staffDefaultFolders");

const folderListOrderBy = [{ sortOrder: "asc" }, { name: "asc" }];

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
 * Create standard root folders for a staff member (idempotent by name).
 * @param {string} staffId - StaffMember id
 */
async function ensureDefaultStaffFolders(staffId) {
  for (const { name, sortOrder } of DEFAULT_STAFF_ROOT_FOLDERS) {
    const exists = await prisma.staffFolder.findFirst({
      where: { staffId, parentId: null, name },
    });
    if (!exists) {
      await prisma.staffFolder.create({
        data: {
          staffId,
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
 * @param {string} staffId - Staff member ID
 * @param {string|null} [parentId] - null/undefined = root only; else folders where parentId = parentId
 * @returns {Promise<Array>} Folders with itemCount, no nested children
 */
async function getFolders(tenantId, staffId, parentId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);

  const folders = await prisma.staffFolder.findMany({
    where: {
      staffId,
      parentId: parentId == null || parentId === "" ? null : parentId,
    },
    orderBy: { name: "asc" },
  });

  if (folders.length === 0) return folders.map(sanitizeFolderFlat);

  const folderIds = folders.map((f) => f.id);
  const [docCounts, subfolderCounts] = await Promise.all([
    prisma.staffDocument.groupBy({
      by: ["folderId"],
      where: { staffId, folderId: { in: folderIds } },
      _count: { id: true },
    }),
    prisma.staffFolder.groupBy({
      by: ["parentId"],
      where: { staffId, parentId: { in: folderIds } },
      _count: { id: true },
    }),
  ]);
  const docCountByFolderId = new Map(docCounts.map((r) => [r.folderId, r._count.id]));
  const subfolderCountByParentId = new Map(subfolderCounts.map((r) => [r.parentId, r._count.id]));

  return folders.map((f) => {
    const docCount = docCountByFolderId.get(f.id) ?? 0;
    const subfolderCount = subfolderCountByParentId.get(f.id) ?? 0;
    return { ...sanitizeFolderFlat(f), itemCount: docCount + subfolderCount };
  });
}

/**
 * Get folder contents: direct subfolders (with itemCount) + documents in that folder.
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {string} folderId - Folder ID
 * @param {string} [folderPassword] - Required if folder is password-protected
 * @returns {Promise<{ folders: Array, documents: Array }>}
 */
async function getFolderContents(tenantId, staffId, folderId, folderPassword) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const folder = await getFolderWithPassword(tenantId, staffId, folderId);
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

  const staffDocumentService = require("./staff-document.service");
  const [folders, docResult] = await Promise.all([
    getFolders(tenantId, staffId, folderId),
    staffDocumentService.listDocuments(tenantId, staffId, {
      folderId,
      folderPassword,
      page: 1,
      limit: 500,
    }),
  ]);
  return { folders, documents: docResult.documents };
}

/**
 * Get folder tree for a staff member (legacy; prefer getFolders + getFolderContents for Windows-style navigation)
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @returns {Promise<Array>} Folder tree (no passwordHash)
 */
async function getFolderTree(tenantId, staffId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);

  const rootCount = await prisma.staffFolder.count({
    where: { staffId, parentId: null },
  });
  if (rootCount === 0) {
    await ensureDefaultStaffFolders(staffId);
  }

  const folders = await prisma.staffFolder.findMany({
    where: { staffId },
    orderBy: folderListOrderBy,
    include: {
      children: {
        orderBy: folderListOrderBy,
        include: {
          children: {
            orderBy: folderListOrderBy,
          },
        },
      },
    },
  });

  const roots = folders.filter((f) => !f.parentId);
  return roots.map(sanitizeFolderForResponse);
}

/**
 * Create a folder
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {Object} data - { name, parentId?, size?, color?, password? } (size commented out: use global size on client)
 * @returns {Promise<Object>} Created folder (no passwordHash)
 */
async function createFolder(tenantId, staffId, data) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const { name, parentId, color, password } = data;

  if (parentId) {
    const parent = await prisma.staffFolder.findFirst({
      where: { id: parentId, staffId },
    });
    if (!parent) throw new Error("Parent folder not found");
  }

  // Per-folder size disabled; use global size on client.
  // const validSizes = ["SMALL", "MEDIUM", "LARGE"];
  // const folderSize = size && validSizes.includes(size) ? size : "MEDIUM";
  const folderColor = color != null && String(color).trim() !== "" ? String(color).trim() : null;
  const passwordHash = await hashFolderPassword(password);

  const folder = await prisma.staffFolder.create({
    data: {
      staffId,
      parentId: parentId || null,
      name: name.trim(),
      size: "MEDIUM",
      color: folderColor,
      passwordHash,
    },
  });
  return sanitizeFolderForResponse(folder);
}

/**
 * Update a folder
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {string} folderId - Folder ID
 * @param {Object} data - { name?, size?, color?, password? } (password empty = remove)
 * @returns {Promise<Object>} Updated folder (no passwordHash)
 */
async function updateFolder(tenantId, staffId, folderId, data) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const folder = await prisma.staffFolder.findFirst({
    where: { id: folderId, staffId },
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

  const updated = await prisma.staffFolder.update({
    where: { id: folderId },
    data: updateData,
  });
  return sanitizeFolderForResponse(updated);
}

/**
 * Delete a folder (recursively deletes children and all documents inside)
 * Deletes S3 files and DB records for documents before deleting the folder
 * @param {string} tenantId - Tenant ID
 * @param {string} staffId - Staff member ID
 * @param {string} folderId - Folder ID
 */
async function deleteFolder(tenantId, staffId, folderId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const folder = await prisma.staffFolder.findFirst({
    where: { id: folderId, staffId },
    include: { children: true },
  });
  if (!folder) throw new Error("Folder not found");

  if (folder.isSystemDefault) {
    const err = new Error(
      "This folder is part of the standard staff file structure and cannot be deleted."
    );
    err.status = 403;
    throw err;
  }

  for (const child of folder.children) {
    await deleteFolder(tenantId, staffId, child.id);
  }

  // Delete all documents in this folder (S3 + DB)
  const docs = await prisma.staffDocument.findMany({
    where: { folderId },
    select: { id: true, s3Key: true },
  });
  for (const doc of docs) {
    try {
      await deleteFileFromS3(doc.s3Key);
    } catch (e) {
      console.error("Failed to delete S3 file:", doc.s3Key, e?.message);
    }
    await prisma.staffDocument.delete({ where: { id: doc.id } });
  }

  await prisma.staffFolder.delete({
    where: { id: folderId },
  });
}

async function getFolderWithPassword(tenantId, staffId, folderId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  return prisma.staffFolder.findFirst({
    where: { id: folderId, staffId },
    select: { id: true, passwordHash: true },
  });
}

module.exports = {
  getFolderTree,
  getFolders,
  getFolderContents,
  getFolderWithPassword,
  createFolder,
  updateFolder,
  deleteFolder,
  ensureDefaultStaffFolders,
};
