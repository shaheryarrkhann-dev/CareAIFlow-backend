const {
  recordVitals,
  getVitals,
  getVitalsById,
  updateVitals,
  deleteVitals,
  getVitalsTrends,
} = require("../../services/vitals/vitals.service");
const { logVitalsAction } = require("../../services/compliance/audit.service");

/**
 * Record vitals
 * POST /api/vitals
 */
async function recordVitalsHandler(req, res) {
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

    const record = await recordVitals(
      {
        ...req.body,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    // Log audit event (already logged in service, but pass req for better logging)
    logVitalsAction({
      action: "VITALS_RECORDED",
      userId: req.user.id,
      tenantId: record.tenantId,
      resourceId: record.id,
      req,
      metadata: {
        residentId: record.residentId,
        medicationId: record.medicationId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Vitals recorded successfully",
      record,
    });
  } catch (err) {
    console.error("Record vitals error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to record vitals",
    });
  }
}

/**
 * Get vitals records with filtering
 * GET /api/vitals
 */
async function getVitalsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      page = 1,
      limit = 10,
      residentId,
      medicationId,
      dateFrom,
      dateTo,
      tenantId, // Query param for SUPER_ADMIN only
      forRecordCreation, // Exclude vitals already linked to MAR or PRN records (for use in MAR/PRN creation)
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 10, 100), // Max 100
      ...(residentId && { residentId }),
      ...(medicationId && { medicationId }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(tenantId && { tenantId }),
      ...(forRecordCreation !== undefined && { forRecordCreation }),
    };

    const result = await getVitals(req.user, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get vitals error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get vitals",
    });
  }
}

/**
 * Get vitals record by ID
 * GET /api/vitals/:id
 */
async function getVitalsByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await getVitalsById(id, req.user);

    return res.status(200).json({
      success: true,
      record,
    });
  } catch (err) {
    console.error("Get vitals by ID error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get vitals",
    });
  }
}

/**
 * Update vitals record
 * PUT /api/vitals/:id
 */
async function updateVitalsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await updateVitals(id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Vitals updated successfully",
      record,
    });
  } catch (err) {
    console.error("Update vitals error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("24 hours")
        ? 400
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update vitals",
    });
  }
}

/**
 * Delete vitals record
 * DELETE /api/vitals/:id
 */
async function deleteVitalsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await deleteVitals(id, req.user);

    return res.status(200).json({
      success: true,
      message: "Vitals record deleted successfully",
      record,
    });
  } catch (err) {
    console.error("Delete vitals error:", err);
    const statusCode =
      err.message.includes("not found") ||
      err.message.includes("24 hours") ||
      err.message.includes("linked to")
        ? 400
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to delete vitals",
    });
  }
}

/**
 * Get vitals trends
 * GET /api/vitals/trends
 */
async function getVitalsTrendsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, startDate, endDate, tenantId } = req.query;

    // Determine tenantId
    let finalTenantId = null;
    if (req.user.role === "SUPER_ADMIN") {
      finalTenantId = tenantId || req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message:
            "tenantId is required when accessing vitals trends as SUPER_ADMIN",
        });
      }
    } else {
      finalTenantId = req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message: "You must belong to a tenant to access vitals trends",
        });
      }
    }

    const trends = await getVitalsTrends(
      residentId,
      startDate,
      endDate,
      finalTenantId
    );

    return res.status(200).json({
      success: true,
      trends,
    });
  } catch (err) {
    console.error("Get vitals trends error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get vitals trends",
    });
  }
}

module.exports = {
  record: recordVitalsHandler,
  list: getVitalsHandler,
  getById: getVitalsByIdHandler,
  update: updateVitalsHandler,
  delete: deleteVitalsHandler,
  getTrends: getVitalsTrendsHandler,
};
