const {
  createLibraryItem,
  getLibraryItems,
  getLibraryItemById,
  updateLibraryItem,
  deleteLibraryItem,
  applyLibraryItemToPlan,
  duplicateLibraryItem,
} = require("../../services/care-plan/care-library.service");

/**
 * Create library item
 * POST /api/care-library
 */
async function createLibraryItemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get tenantId from query or body (for SUPER_ADMIN) or use user's tenant
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;

    // Map 'content' from validator to 'templateData' expected by service
    const libraryItem = await createLibraryItem(
      {
        ...req.body,
        templateData: req.body.content || req.body.templateData, // Support both 'content' (from validator) and 'templateData' (legacy)
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    return res.status(201).json({
      success: true,
      message: "Library item created successfully",
      libraryItem,
    });
  } catch (err) {
    console.error("Create library item error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create library item",
    });
  }
}

/**
 * Get library items with filtering
 * GET /api/care-library
 */
async function getLibraryItemsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      page = 1,
      limit = 50,
      type,
      category,
      search,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 50, 100), // Max 100
      ...(type && { type }),
      ...(category && { category }),
      ...(search && { search }),
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
    };

    const result = await getLibraryItems(filters, req.user);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get library items error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get library items",
    });
  }
}

/**
 * Get library item by ID
 * GET /api/care-library/:id
 */
async function getLibraryItemByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const libraryItem = await getLibraryItemById(id, req.user);

    return res.status(200).json({
      success: true,
      libraryItem,
    });
  } catch (err) {
    console.error("Get library item by ID error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get library item",
    });
  }
}

/**
 * Update library item
 * PUT /api/care-library/:id
 */
async function updateLibraryItemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const libraryItem = await updateLibraryItem(id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Library item updated successfully",
      libraryItem,
    });
  } catch (err) {
    console.error("Update library item error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update library item",
    });
  }
}

/**
 * Delete library item
 * DELETE /api/care-library/:id
 */
async function deleteLibraryItemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const libraryItem = await deleteLibraryItem(id, req.user);

    return res.status(200).json({
      success: true,
      message: "Library item deleted successfully",
      libraryItem,
    });
  } catch (err) {
    console.error("Delete library item error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to delete library item",
    });
  }
}

/**
 * Apply library item to care plan
 * POST /api/care-library/:id/apply
 */
async function applyLibraryItemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { carePlanId, problemId, goalId, customizations } = req.body;

    if (!carePlanId) {
      return res.status(400).json({
        success: false,
        message: "carePlanId is required",
      });
    }

    // Debug logging
    console.log("Apply library item request:", {
      libraryItemId: id,
      carePlanId,
      userId: req.user.id,
      userRole: req.user.role,
      userTenantId: req.user.tenantId,
    });

    // Build options object from request body
    const options = {
      problemId: problemId || undefined,
      goalId: goalId || undefined,
      problemTitle: customizations?.title || undefined,
      problemDescription: customizations?.description || undefined,
      ...customizations,
    };

    const result = await applyLibraryItemToPlan(id, carePlanId, req.user, options);

    return res.status(200).json({
      success: true,
      message: "Library item applied successfully",
      result: result.problem || result.goal || result.intervention,
    });
  } catch (err) {
    console.error("Apply library item error:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack,
      carePlanId: req.body?.carePlanId,
      userId: req.user?.id,
      userTenantId: req.user?.tenantId,
    });
    const statusCode = err.message.includes("not found") || err.message.includes("access denied") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to apply library item",
    });
  }
}

/**
 * Duplicate library item
 * POST /api/care-library/:id/duplicate
 */
async function duplicateLibraryItemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const libraryItem = await duplicateLibraryItem(id, req.user);

    return res.status(201).json({
      success: true,
      message: "Library item duplicated successfully",
      libraryItem,
    });
  } catch (err) {
    console.error("Duplicate library item error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to duplicate library item",
    });
  }
}

module.exports = {
  createLibraryItemHandler,
  getLibraryItemsHandler,
  getLibraryItemByIdHandler,
  updateLibraryItemHandler,
  deleteLibraryItemHandler,
  applyLibraryItemHandler,
  duplicateLibraryItemHandler,
};

