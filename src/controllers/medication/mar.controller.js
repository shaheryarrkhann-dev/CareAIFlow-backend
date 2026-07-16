const {
  recordDose,
  getMarRecords,
  getMarRecordById,
  updateMarRecord,
  deleteMarRecord,
  lockMarRecord,
  unlockMarRecord,
} = require("../../services/medication/mar.service");
const {
  getSchedulesForMedicationAndDate,
  syncScheduleStatuses,
} = require("../../services/medication/mar-scheduler.service");
const { logMarAction } = require("../../services/compliance/audit.service");

/**
 * Record dose administration
 * POST /api/mar/record
 */
async function recordDoseHandler(req, res) {
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

    const record = await recordDose(
      {
        ...req.body,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    // Log audit event (already logged in service, but pass req for better logging)
    logMarAction({
      action: "MAR_RECORD_CREATED",
      userId: req.user.id,
      tenantId: record.tenantId,
      resourceId: record.id,
      req,
      metadata: {
        residentId: record.residentId,
        medicationId: record.medicationId,
        status: record.status,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Dose recorded successfully",
      record,
    });
  } catch (err) {
    console.error("Record dose error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to record dose",
    });
  }
}

/**
 * Get MAR records with filtering
 * GET /api/mar/records
 */
async function getMarRecordsHandler(req, res) {
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
      status,
      dateFrom,
      dateTo,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 10, 100), // Max 100
      ...(residentId && { residentId }),
      ...(medicationId && { medicationId }),
      ...(status && { status }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(tenantId && { tenantId }),
    };

    const result = await getMarRecords(req.user, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get MAR records error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get MAR records",
    });
  }
}

/**
 * Get MAR record by ID
 * GET /api/mar/records/:id
 */
async function getMarRecordByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await getMarRecordById(id, req.user);

    return res.status(200).json({
      success: true,
      record,
    });
  } catch (err) {
    console.error("Get MAR record by ID error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get MAR record",
    });
  }
}

/**
 * Update MAR record
 * PUT /api/mar/records/:id
 */
async function updateMarRecordHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await updateMarRecord(id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "MAR record updated successfully",
      record,
    });
  } catch (err) {
    console.error("Update MAR record error:", err);
    const statusCode = err.message.includes("not found") ||
      err.message.includes("locked") ||
      err.message.includes("24 hours")
      ? 400
      : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update MAR record",
    });
  }
}

/**
 * Delete MAR record
 * DELETE /api/mar/records/:id
 */
async function deleteMarRecordHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await deleteMarRecord(id, req.user);

    return res.status(200).json({
      success: true,
      message: "MAR record deleted successfully",
      record,
    });
  } catch (err) {
    console.error("Delete MAR record error:", err);
    const statusCode = err.message.includes("not found") ||
      err.message.includes("24 hours")
      ? 400
      : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to delete MAR record",
    });
  }
}

/**
 * Lock MAR record
 * POST /api/mar/records/:id/lock
 */
async function lockMarRecordHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await lockMarRecord(id, req.user);

    return res.status(200).json({
      success: true,
      message: "MAR record locked successfully",
      record,
    });
  } catch (err) {
    console.error("Lock MAR record error:", err);
    const statusCode = err.message.includes("not found") ||
      err.message.includes("administrators")
      ? 400
      : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to lock MAR record",
    });
  }
}

/**
 * Unlock MAR record
 * POST /api/mar/records/:id/unlock
 */
async function unlockMarRecordHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await unlockMarRecord(id, req.user);

    return res.status(200).json({
      success: true,
      message: "MAR record unlocked successfully",
      record,
    });
  } catch (err) {
    console.error("Unlock MAR record error:", err);
    const statusCode = err.message.includes("not found") ||
      err.message.includes("administrators")
      ? 400
      : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to unlock MAR record",
    });
  }
}

/**
 * Sync schedule statuses for old records
 * POST /api/mar/sync-schedules
 */
async function syncSchedulesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Only ADMIN and SUPER_ADMIN can sync schedules
    if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can sync schedules",
      });
    }

    const { tenantId } = req.query;
    const finalTenantId =
      req.user.role === "SUPER_ADMIN" && tenantId
        ? tenantId
        : req.user.tenantId;

    const updatedCount = await syncScheduleStatuses(finalTenantId);

    return res.status(200).json({
      success: true,
      message: `Successfully synced ${updatedCount} schedule(s)`,
      updatedCount,
    });
  } catch (err) {
    console.error("Sync schedules error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to sync schedules",
    });
  }
}

/**
 * Get schedules for a specific medication, resident, and date
 * GET /api/mar/schedules
 */
async function getSchedulesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { medicationId, residentId, date, tenantId } = req.query;

    // Determine tenantId
    let finalTenantId = null;
    if (req.user.role === "SUPER_ADMIN") {
      finalTenantId = tenantId || req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message:
            "tenantId is required when getting schedules as SUPER_ADMIN",
        });
      }
    } else {
      finalTenantId = req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message: "You must belong to a tenant to get schedules",
        });
      }
    }

    const schedules = await getSchedulesForMedicationAndDate(
      medicationId,
      residentId,
      date,
      finalTenantId
    );

    return res.status(200).json({
      success: true,
      schedules,
      count: schedules.length,
    });
  } catch (err) {
    console.error("Get schedules error:", err);
    const statusCode =
      err.message.includes("not found") ||
      err.message.includes("access denied")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get schedules",
    });
  }
}

module.exports = {
  recordDose: recordDoseHandler,
  getMarRecords: getMarRecordsHandler,
  getMarRecordById: getMarRecordByIdHandler,
  updateMarRecord: updateMarRecordHandler,
  deleteMarRecord: deleteMarRecordHandler,
  lockMarRecord: lockMarRecordHandler,
  unlockMarRecord: unlockMarRecordHandler,
  getSchedules: getSchedulesHandler,
  syncSchedules: syncSchedulesHandler,
};

