const prisma = require("../../lib/prisma");

/**
 * Save a new form draft (always creates a new draft)
 * @param {Object} params - { tenantId, userId, formId, draftData }
 * @returns {Object} Draft record
 */
async function saveDraft({ tenantId, userId, formId, draftData }) {
  // Always create a new draft - allows multiple drafts per user per form
  const newDraft = await prisma.formDraft.create({
    data: {
      tenantId,
      userId,
      formId,
      draftData,
    },
  });

  return newDraft;
}

/**
 * Get all drafts for a user (optionally filtered by formId)
 * @param {Object} params - { tenantId, userId, formId? }
 * @returns {Array} List of drafts
 */
async function getUserDrafts({ tenantId, userId, formId = null }) {
  const where = {
    tenantId,
    userId,
  };

  if (formId) {
    where.formId = formId;
  }

  const drafts = await prisma.formDraft.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      form: {
        select: {
          id: true,
          formName: true,
          description: true,
        },
      },
    },
  });

  return drafts;
}

/**
 * Get a specific draft by ID
 * @param {Object} params - { tenantId, userId, draftId }
 * @returns {Object} Draft record
 */
async function getDraftById({ tenantId, userId, draftId }) {
  const draft = await prisma.formDraft.findFirst({
    where: {
      id: draftId,
      tenantId,
      userId, // Ensure user can only access their own drafts
    },
    include: {
      form: {
        select: {
          id: true,
          formName: true,
          description: true,
          schemaJson: true,
        },
      },
    },
  });

  if (!draft) {
    throw new Error("Draft not found or access denied");
  }

  return draft;
}

/**
 * Update a draft
 * @param {Object} params - { tenantId, userId, draftId, draftData }
 * @returns {Object} Updated draft
 */
async function updateDraft({ tenantId, userId, draftId, draftData }) {
  // Verify draft belongs to user
  const existingDraft = await prisma.formDraft.findFirst({
    where: {
      id: draftId,
      tenantId,
      userId,
    },
  });

  if (!existingDraft) {
    throw new Error("Draft not found or access denied");
  }

  const updatedDraft = await prisma.formDraft.update({
    where: { id: draftId },
    data: {
      draftData,
      updatedAt: new Date(),
    },
  });

  return updatedDraft;
}

/**
 * Delete a draft
 * @param {Object} params - { tenantId, userId, draftId }
 * @returns {Object} Deleted draft
 */
async function deleteDraft({ tenantId, userId, draftId }) {
  // Verify draft belongs to user
  const existingDraft = await prisma.formDraft.findFirst({
    where: {
      id: draftId,
      tenantId,
      userId,
    },
  });

  if (!existingDraft) {
    throw new Error("Draft not found or access denied");
  }

  const deletedDraft = await prisma.formDraft.delete({
    where: { id: draftId },
  });

  return deletedDraft;
}

/**
 * Delete draft after successful form submission
 * @param {Object} params - { tenantId, userId, formId }
 */
async function deleteDraftAfterSubmission({ tenantId, userId, formId }) {
  try {
    const result = await prisma.formDraft.deleteMany({
      where: {
        tenantId,
        userId,
        formId,
      },
    });
    console.log(
      `[DRAFT] Deleted ${result.count} draft(s) after form submission`
    );
  } catch (error) {
    console.error("[DRAFT] Error deleting draft after submission:", error);
    // Don't throw - this is cleanup, shouldn't fail the submission
  }
}

module.exports = {
  saveDraft,
  getUserDrafts,
  getDraftById,
  updateDraft,
  deleteDraft,
  deleteDraftAfterSubmission,
};
