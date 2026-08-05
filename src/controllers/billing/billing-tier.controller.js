const {
  createBillingTier,
  getBillingTiers,
  getBillingTierById,
  updateBillingTier,
  deleteBillingTier,
  getResidentsByTier,
  generateFeaturesWithAI,
} = require("../../services/billing/billing-tier.service");
const { logBillingAction } = require("../../services/compliance/audit.service");

/**
 * Create billing tier
 * POST /api/billing-tiers
 */
async function createBillingTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Determine tenantId
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.body.tenantId) {
      tenantId = req.body.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const billingTier = await createBillingTier(
      {
        ...req.body,
        tenantId,
      },
      req.user
    );

    // Log audit event
    try {
      await logBillingAction({
        action: "BILLING_TIER_CREATED",
        userId: req.user.id,
        tenantId: billingTier.tenantId,
        resourceId: billingTier.id,
        req,
        metadata: {
          name: billingTier.name,
          monthlyRate: billingTier.monthlyRate,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for billing tier creation:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Billing tier created successfully",
      billingTier,
    });
  } catch (err) {
    console.error("Create billing tier error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create billing tier",
    });
  }
}

/**
 * Get billing tiers
 * GET /api/billing-tiers
 */
async function getBillingTiersHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Determine tenantId
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

    const filters = {
      page: req.query.page ? Number.parseInt(req.query.page, 10) : undefined,
      limit: req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined,
      isActive: req.query.isActive ? req.query.isActive === "true" : undefined,
      search: req.query.search,
    };

    const result = await getBillingTiers(tenantId, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get billing tiers error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve billing tiers",
    });
  }
}

/**
 * Get billing tier by ID
 * GET /api/billing-tiers/:id
 */
async function getBillingTierByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    // Determine tenantId
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

    const billingTier = await getBillingTierById(id, tenantId);

    return res.status(200).json({
      success: true,
      billingTier,
    });
  } catch (err) {
    console.error("Get billing tier by ID error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message || "Billing tier not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve billing tier",
    });
  }
}

/**
 * Update billing tier
 * PUT /api/billing-tiers/:id
 */
async function updateBillingTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    // Determine tenantId
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.body.tenantId) {
      tenantId = req.body.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const billingTier = await updateBillingTier(
      id,
      {
        ...req.body,
        tenantId,
      },
      req.user
    );

    // Log audit event
    try {
      await logBillingAction({
        action: "BILLING_TIER_UPDATED",
        userId: req.user.id,
        tenantId: billingTier.tenantId,
        resourceId: billingTier.id,
        req,
        metadata: {
          name: billingTier.name,
          monthlyRate: billingTier.monthlyRate,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for billing tier update:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Billing tier updated successfully",
      billingTier,
    });
  } catch (err) {
    console.error("Update billing tier error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message || "Billing tier not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update billing tier",
    });
  }
}

/**
 * Delete billing tier
 * DELETE /api/billing-tiers/:id
 */
async function deleteBillingTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    const billingTier = await deleteBillingTier(id, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "BILLING_TIER_DELETED",
        userId: req.user.id,
        tenantId: billingTier.tenantId,
        resourceId: billingTier.id,
        req,
        metadata: {
          name: billingTier.name,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for billing tier deletion:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Billing tier deleted successfully",
      billingTier,
    });
  } catch (err) {
    console.error("Delete billing tier error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("assigned to") ||
      err.message.includes("associated invoice")
    ) {
      return res.status(400).json({
        success: false,
        message: err.message || "Cannot delete billing tier",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to delete billing tier",
    });
  }
}

/**
 * Get residents by billing tier
 * GET /api/billing-tiers/:tierId/residents
 */
async function getResidentsByTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { tierId } = req.params;

    // Determine tenantId
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

    const residents = await getResidentsByTier(tierId, tenantId);

    return res.status(200).json({
      success: true,
      count: residents.length,
      residents,
    });
  } catch (err) {
    console.error("Get residents by tier error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message || "Billing tier not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve residents",
    });
  }
}

/**
 * Generate billing tier features using AI
 * POST /api/billing-tiers/generate-features
 */
async function generateFeaturesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { hints, tierName } = req.body;

    if (!hints || !hints.trim()) {
      return res.status(400).json({
        success: false,
        message: "Hints are required",
      });
    }

    const generatedFeatures = await generateFeaturesWithAI(
      hints.trim(),
      tierName?.trim() || ""
    );

    return res.status(200).json({
      success: true,
      features: generatedFeatures,
      message: "Features generated successfully",
    });
  } catch (err) {
    console.error("Generate features error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate features",
    });
  }
}

module.exports = {
  createBillingTier: createBillingTierHandler,
  getBillingTiers: getBillingTiersHandler,
  getBillingTierById: getBillingTierByIdHandler,
  updateBillingTier: updateBillingTierHandler,
  deleteBillingTier: deleteBillingTierHandler,
  getResidentsByTier: getResidentsByTierHandler,
  generateFeatures: generateFeaturesHandler,
};
