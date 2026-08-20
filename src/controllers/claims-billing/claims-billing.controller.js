const {
  createClaimsRecord,
  updateClaimsRecord,
  getClaimsRecord,
  getClaimsRecords,
  getClaimsHistory,
  deleteClaimsRecord,
} = require("../../services/claims-billing/claims-billing.service");
const {
  getPrefilledBillingData,
} = require("../../services/claims-billing/claims-mapping.service");
const { logBillingAction } = require("../../services/compliance/audit.service");

/**
 * Create claims billing record
 * POST /api/claims-billing
 */
async function createClaimsRecordHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const record = await createClaimsRecord(req.body, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_GENERATED", // Using existing action for now
        userId: req.user.id,
        tenantId: record.tenantId,
        resourceId: record.id,
        req,
        metadata: {
          residentId: record.residentId,
          billingMonth: record.billingMonth.toISOString().slice(0, 7),
          tierId: record.tierId,
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for claims billing creation:",
        auditError
      );
    }

    return res.status(201).json({
      success: true,
      message: "Claims billing record created successfully",
      record,
    });
  } catch (err) {
    console.error("Create claims billing record error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("already exists") ||
      err.message.includes("required")
    ) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create claims billing record",
    });
  }
}

/**
 * Update claims billing record
 * PUT /api/claims-billing/:id
 */
async function updateClaimsRecordHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const record = await updateClaimsRecord(id, req.body, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_UPDATED", // Using existing action for now
        userId: req.user.id,
        tenantId: record.tenantId,
        resourceId: record.id,
        req,
        metadata: {
          residentId: record.residentId,
          billingMonth: record.billingMonth.toISOString().slice(0, 7),
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for claims billing update:",
        auditError
      );
    }

    return res.status(200).json({
      success: true,
      message: "Claims billing record updated successfully",
      record,
    });
  } catch (err) {
    console.error("Update claims billing record error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    if (err.message.includes("required") || err.message.includes("invalid")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update claims billing record",
    });
  }
}

/**
 * Get claims billing record by ID
 * GET /api/claims-billing/:id
 */
async function getClaimsRecordHandler(req, res) {
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

    const record = await getClaimsRecord(id, tenantId);

    // Return empty data if record not found (not an error)
    if (!record) {
      return res.status(200).json({
        success: true,
        record: null,
        message: "No billing record found",
      });
    }

    return res.status(200).json({
      success: true,
      record,
    });
  } catch (err) {
    console.error("Get claims billing record error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get claims billing record",
    });
  }
}

/**
 * Get claims billing records with filtering
 * GET /api/claims-billing
 */
async function getClaimsRecordsHandler(req, res) {
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

    const filters = {
      page: req.query.page ? parseInt(req.query.page) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      residentId: req.query.residentId,
      billingMonth: req.query.billingMonth,
      tierId: req.query.tierId,
      search: req.query.search,
      billingStatus: req.query.billingStatus,
    };

    const result = await getClaimsRecords(tenantId, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get claims billing records error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get claims billing records",
    });
  }
}

/**
 * Get pre-filled billing form data
 * GET /api/claims-billing/prefill/:residentId
 * Query params: tierId (optional)
 */
async function getPrefilledBillingDataHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    const { tierId } = req.query;
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

    const prefilledData = await getPrefilledBillingData(
      residentId,
      tenantId,
      tierId
    );

    return res.status(200).json({
      success: true,
      message: "Pre-filled billing data retrieved successfully",
      ...prefilledData,
    });
  } catch (err) {
    console.error("Get pre-filled billing data error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("does not belong")
    ) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get pre-filled billing data",
    });
  }
}

/**
 * Get claims billing history for a resident
 * GET /api/claims-billing/resident/:residentId
 */
async function getClaimsHistoryHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
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

    const records = await getClaimsHistory(residentId, tenantId);

    return res.status(200).json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error("Get claims billing history error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get claims billing history",
    });
  }
}

/**
 * Delete claims billing record
 * DELETE /api/claims-billing/:id
 */
async function deleteClaimsRecordHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const deletedRecord = await deleteClaimsRecord(id, req.user);

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_EXPORTED", // Using existing action for now
        userId: req.user.id,
        tenantId: deletedRecord.tenantId,
        resourceId: deletedRecord.id,
        req,
        metadata: {
          action: "deleted",
          residentId: deletedRecord.residentId,
        },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for claims billing deletion:",
        auditError
      );
    }

    return res.status(200).json({
      success: true,
      message: "Claims billing record deleted successfully",
      record: deletedRecord,
    });
  } catch (err) {
    console.error("Delete claims billing record error:", err);
    if (err.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to delete claims billing record",
    });
  }
}

module.exports = {
  createClaimsRecord: createClaimsRecordHandler,
  updateClaimsRecord: updateClaimsRecordHandler,
  getClaimsRecord: getClaimsRecordHandler,
  getClaimsRecords: getClaimsRecordsHandler,
  getPrefilledBillingData: getPrefilledBillingDataHandler,
  getClaimsHistory: getClaimsHistoryHandler,
  deleteClaimsRecord: deleteClaimsRecordHandler,
};
