const {
  getProviderSettings,
  updateProviderSettings,
} = require("../../services/claims-billing/claims-provider.service");
const { logBillingAction } = require("../../services/compliance/audit.service");

/**
 * Get provider settings
 * GET /api/claims-billing/provider
 */
async function getProviderSettingsHandler(req, res) {
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

    const settings = await getProviderSettings(tenantId);

    // Return empty data if settings not found (not an error - just empty data)
    return res.status(200).json({
      success: true,
      settings: settings || null,
    });
  } catch (err) {
    console.error("Get provider settings error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get provider settings",
    });
  }
}

/**
 * Update provider settings
 * PUT /api/claims-billing/provider
 */
async function updateProviderSettingsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const settings = await updateProviderSettings(req.body, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "BILLING_TIER_UPDATED", // Using existing action for now
        userId: req.user.id,
        tenantId: settings.tenantId,
        resourceId: settings.id,
        req,
        metadata: {
          action: "provider_settings_updated",
          providerName: settings.providerName,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for provider settings update:", auditError);
    }

    return res.status(200).json({
      success: true,
      message: "Provider settings updated successfully",
      settings,
    });
  } catch (err) {
    console.error("Update provider settings error:", err);
    if (err.message.includes("required")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update provider settings",
    });
  }
}

module.exports = {
  getProviderSettings: getProviderSettingsHandler,
  updateProviderSettings: updateProviderSettingsHandler,
};

