const {
  saveDraft,
  getUserDrafts,
  getDraftById,
  updateDraft,
  deleteDraft
} = require('../../services/form/draft.service');
const { getFormSchemaById } = require('../../services/ai/ai.service');


async function saveFormDraft(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    const { formId } = req.params;
    const draftData = req.body;

    // Verify form exists and user has access
    try {
      await getFormSchemaById(tenantId, formId);
    } catch (error) {
      return res.status(404).json({ success: false, message: 'Form schema not found' });
    }

    const draft = await saveDraft({
      tenantId,
      userId: req.user.id,
      formId,
      draftData
    });

    return res.status(201).json({
      success: true,
      message: 'Draft saved successfully',
      draft: {
        id: draft.id,
        formId: draft.formId,
        draftData: draft.draftData,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt
      }
    });
  } catch (err) {
    console.error('Save draft error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to save draft'
    });
  }
}

/**
 * Get user's drafts
 * GET /api/forms/:formId/drafts or GET /api/forms/drafts
 */
async function getDrafts(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    const formId = req.params.formId || null;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const drafts = await getUserDrafts({
      tenantId,
      userId: req.user.id,
      formId
    });

    // Apply pagination
    const total = drafts.length;
    const paginatedDrafts = drafts.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      count: paginatedDrafts.length,
      total: total,
      drafts: paginatedDrafts.map(d => ({
        id: d.id,
        formId: d.formId,
        formName: d.form?.formName,
        formDescription: d.form?.description,
        draftData: d.draftData,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt
      })),
      pagination: {
        limit,
        offset,
        total
      }
    });
  } catch (err) {
    console.error('Get drafts error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve drafts'
    });
  }
}

/**
 * Get specific draft by ID
 * GET /api/forms/:formId/draft/:draftId
 */
async function getDraft(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    const { draftId } = req.params;

    const draft = await getDraftById({
      tenantId,
      userId: req.user.id,
      draftId
    });

    return res.status(200).json({
      success: true,
      draft: {
        id: draft.id,
        formId: draft.formId,
        formName: draft.form?.formName,
        formSchema: draft.form?.schemaJson,
        draftData: draft.draftData,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt
      }
    });
  } catch (err) {
    console.error('Get draft error:', err);
    return res.status(err.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: err.message || 'Failed to retrieve draft'
    });
  }
}

/**
 * Update existing draft
 * PUT /api/forms/:formId/draft/:draftId
 */
async function updateFormDraft(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    const { draftId } = req.params;
    const draftData = req.body;

    const draft = await updateDraft({
      tenantId,
      userId: req.user.id,
      draftId,
      draftData
    });

    return res.status(200).json({
      success: true,
      message: 'Draft updated successfully',
      draft: {
        id: draft.id,
        formId: draft.formId,
        draftData: draft.draftData,
        updatedAt: draft.updatedAt
      }
    });
  } catch (err) {
    console.error('Update draft error:', err);
    return res.status(err.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: err.message || 'Failed to update draft'
    });
  }
}

/**
 * Delete draft
 * DELETE /api/forms/:formId/draft/:draftId
 */
async function deleteFormDraft(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User must belong to a tenant' });
    }

    const { draftId } = req.params;

    await deleteDraft({
      tenantId,
      userId: req.user.id,
      draftId
    });

    return res.status(200).json({
      success: true,
      message: 'Draft deleted successfully'
    });
  } catch (err) {
    console.error('Delete draft error:', err);
    return res.status(err.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: err.message || 'Failed to delete draft'
    });
  }
}

module.exports = {
  saveFormDraft,
  getDrafts,
  getDraft,
  updateFormDraft,
  deleteFormDraft
};

