const {
  recordPrnDose,
  recordPrnResponse,
  notifyPhysician,
  getPrnRecords,
  getPrnRecordById,
  getPendingPrnFollowups,
} = require("../../services/medication/prn-record.service");
const { logPrnAction } = require("../../services/compliance/audit.service");

/**
 * Record PRN dose
 * POST /api/prn/record
 */
async function recordPrnDoseHandler(req, res) {
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

    const record = await recordPrnDose(
      {
        ...req.body,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    // Log audit event (already logged in service, but pass req for better logging)
    logPrnAction({
      action: "PRN_RECORD_CREATED",
      userId: req.user.id,
      tenantId: record.tenantId,
      resourceId: record.id,
      req,
      metadata: {
        residentId: record.residentId,
        medicationId: record.medicationId,
        symptom: record.symptom,
      },
    });

    return res.status(201).json({
      success: true,
      message: "PRN dose recorded successfully",
      record,
    });
  } catch (err) {
    console.error("Record PRN dose error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to record PRN dose",
    });
  }
}

/**
 * Get PRN records with filtering
 * GET /api/prn/records
 */
async function getPrnRecordsHandler(req, res) {
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
      hasResponse,
      physicianNotified,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 10, 100), // Max 100
      ...(residentId && { residentId }),
      ...(medicationId && { medicationId }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(hasResponse !== undefined && { hasResponse }),
      ...(physicianNotified !== undefined && { physicianNotified }),
      ...(tenantId && { tenantId }),
    };

    const result = await getPrnRecords(req.user, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get PRN records error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get PRN records",
    });
  }
}

/**
 * Get PRN record by ID
 * GET /api/prn/records/:id
 */
async function getPrnRecordByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await getPrnRecordById(id, req.user);

    return res.status(200).json({
      success: true,
      record,
    });
  } catch (err) {
    console.error("Get PRN record by ID error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get PRN record",
    });
  }
}

/**
 * Record PRN response
 * PUT /api/prn/records/:id/response
 */
async function recordPrnResponseHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await recordPrnResponse(id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "PRN response recorded successfully",
      record,
    });
  } catch (err) {
    console.error("Record PRN response error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("30 minutes")
        ? 400
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to record PRN response",
    });
  }
}

/**
 * Notify physician
 * POST /api/prn/records/:id/notify-physician
 */
async function notifyPhysicianHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { notes } = req.body;
    const record = await notifyPhysician(id, notes, req.user);

    return res.status(200).json({
      success: true,
      message: "Physician notified successfully",
      record,
    });
  } catch (err) {
    console.error("Notify physician error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to notify physician",
    });
  }
}

/**
 * Get pending PRN follow-ups
 * GET /api/prn/pending-followups
 */
async function getPendingFollowupsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, tenantId } = req.query;

    // Determine tenantId
    let finalTenantId = null;
    if (req.user.role === "SUPER_ADMIN") {
      finalTenantId = tenantId || req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message:
            "tenantId is required when accessing pending follow-ups as SUPER_ADMIN",
        });
      }
    } else {
      finalTenantId = req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message: "You must belong to a tenant to access pending follow-ups",
        });
      }
    }

    const records = await getPendingPrnFollowups(
      residentId || null,
      finalTenantId
    );

    return res.status(200).json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error("Get pending PRN follow-ups error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get pending PRN follow-ups",
    });
  }
}

module.exports = {
  recordPrnDose: recordPrnDoseHandler,
  getPrnRecords: getPrnRecordsHandler,
  getPrnRecordById: getPrnRecordByIdHandler,
  recordPrnResponse: recordPrnResponseHandler,
  notifyPhysician: notifyPhysicianHandler,
  getPendingFollowups: getPendingFollowupsHandler,
};
