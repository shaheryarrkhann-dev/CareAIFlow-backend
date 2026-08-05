const {
  getTierById,
  getTiers,
  getTierFields,
  createTier,
  updateTier,
  deleteTier,
} = require("../../services/claims-billing/claims-tier.service");
const { logBillingAction } = require("../../services/compliance/audit.service");

/**
 * Get claims billing tier by ID
 * GET /api/claims-billing/tiers/:id
 */
async function getTierByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const tier = await getTierById(id, tenantId);

    // Return empty data if tier not found (not an error)
    if (!tier) {
      return res.status(200).json({
        success: true,
        tier: null,
        message: "No tier found",
      });
    }

    return res.status(200).json({
      success: true,
      tier,
    });
  } catch (err) {
    console.error("Get claims billing tier error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get claims billing tier",
    });
  }
}

/**
 * Get claims billing tiers
 * GET /api/claims-billing/tiers
 */
async function getTiersHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    // Convert string booleans to actual booleans
    const parseBoolean = (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return undefined;
    };

    const filters = {
      page: req.query.page ? Number.parseInt(req.query.page, 10) : undefined,
      limit: req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined,
      isActive: parseBoolean(req.query.isActive),
      tierNumber: req.query.tierNumber
        ? Number.parseInt(req.query.tierNumber, 10)
        : undefined,
      isILOS: parseBoolean(req.query.isILOS),
    };

    const result = await getTiers(tenantId, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get claims billing tiers error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get claims billing tiers",
    });
  }
}

/**
 * Get tier fields for auto-fill
 * GET /api/claims-billing/tiers/:id/fields
 */
async function getTierFieldsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const fields = await getTierFields(id, tenantId);

    return res.status(200).json({
      success: true,
      fields,
    });
  } catch (err) {
    console.error("Get tier fields error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get tier fields",
    });
  }
}

/**
 * Create claims billing tier
 * POST /api/claims-billing/tiers
 */
async function createTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const tier = await createTier(req.body, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "BILLING_TIER_CREATED",
        userId: req.user.id,
        tenantId: tier.tenantId,
        resourceId: tier.id,
        req,
        metadata: {
          tierNumber: tier.tierNumber,
          name: tier.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for tier creation:", auditError);
    }

    return res.status(201).json({
      success: true,
      message: "Claims billing tier created successfully",
      tier,
    });
  } catch (err) {
    console.error("Create claims billing tier error:", err);
    if (
      err.message.includes("already exists") ||
      err.message.includes("required") ||
      err.message.includes("must be")
    ) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create claims billing tier",
    });
  }
}

/**
 * Update claims billing tier
 * PUT /api/claims-billing/tiers/:id
 */
async function updateTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const tier = await updateTier(id, req.body, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "BILLING_TIER_UPDATED",
        userId: req.user.id,
        tenantId: tier.tenantId,
        resourceId: tier.id,
        req,
        metadata: {
          tierNumber: tier.tierNumber,
          name: tier.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for tier update:", auditError);
    }

    return res.status(200).json({
      success: true,
      message: "Claims billing tier updated successfully",
      tier,
    });
  } catch (err) {
    console.error("Update claims billing tier error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    if (err.message.includes("required") || err.message.includes("must be")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update claims billing tier",
    });
  }
}

/**
 * Delete claims billing tier
 * DELETE /api/claims-billing/tiers/:id
 */
async function deleteTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const deletedTier = await deleteTier(id, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "BILLING_TIER_DELETED",
        userId: req.user.id,
        tenantId: deletedTier.tenantId,
        resourceId: deletedTier.id,
        req,
        metadata: {
          tierNumber: deletedTier.tierNumber,
          name: deletedTier.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for tier deletion:", auditError);
    }

    return res.status(200).json({
      success: true,
      message: "Claims billing tier deleted successfully",
      tier: deletedTier,
    });
  } catch (err) {
    console.error("Delete claims billing tier error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    if (err.message.includes("used in")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to delete claims billing tier",
    });
  }
}

module.exports = {
  getTierById: getTierByIdHandler,
  getTiers: getTiersHandler,
  getTierFields: getTierFieldsHandler,
  createTier: createTierHandler,
  updateTier: updateTierHandler,
  deleteTier: deleteTierHandler,
};
