const {
  createMedication,
  getMedications,
  getMedicationById,
  updateMedication,
  deleteMedication,
  activateMedication,
  deactivateMedication,
} = require("../../services/medication/medication.service");
const { logMedicationAction } = require("../../services/compliance/audit.service");

/**
 * Create new medication
 * POST /api/medications
 */
async function createMedicationHandler(req, res) {
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

    const medication = await createMedication(
      {
        ...req.body,
        prescriptionPdf: req.file, // From multer middleware
      },
      req.user,
      tenantIdFromQuery
    );

    // Log audit event
    logMedicationAction({
      action: "MEDICATION_CREATED",
      userId: req.user.id,
      tenantId: medication.tenantId,
      resourceId: medication.id,
      req,
      metadata: {
        residentId: medication.residentId,
        name: medication.name,
        route: medication.route,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Medication created successfully",
      medication,
    });
  } catch (err) {
    console.error("Create medication error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create medication",
    });
  }
}

/**
 * Get medications with filtering
 * GET /api/medications
 */
async function getMedicationsHandler(req, res) {
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
      isActive,
      isPrn,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 10, 100), // Max 100
      ...(residentId && { residentId }),
      ...(isActive !== undefined && { isActive: isActive === "true" }),
      ...(isPrn !== undefined && { isPrn: isPrn === "true" }),
      ...(tenantId && { tenantId }),
    };

    const result = await getMedications(req.user, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get medications error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get medications",
    });
  }
}

/**
 * Get medication by ID
 * GET /api/medications/:id
 */
async function getMedicationByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const medication = await getMedicationById(id, req.user);

    return res.status(200).json({
      success: true,
      medication,
    });
  } catch (err) {
    console.error("Get medication by ID error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get medication",
    });
  }
}

/**
 * Update medication
 * PUT /api/medications/:id
 */
async function updateMedicationHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const medication = await updateMedication(
      id,
      {
        ...req.body,
        prescriptionPdf: req.file, // From multer middleware
      },
      req.user
    );

    // Log audit event
    logMedicationAction({
      action: "MEDICATION_UPDATED",
      userId: req.user.id,
      tenantId: medication.tenantId,
      resourceId: medication.id,
      req,
      metadata: {
        residentId: medication.residentId,
        name: medication.name,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Medication updated successfully",
      medication,
    });
  } catch (err) {
    console.error("Update medication error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update medication",
    });
  }
}

/**
 * Delete medication (soft delete)
 * DELETE /api/medications/:id
 */
async function deleteMedicationHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const medication = await deleteMedication(id, req.user);

    // Log audit event
    logMedicationAction({
      action: "MEDICATION_DELETED",
      userId: req.user.id,
      tenantId: medication.tenantId,
      resourceId: medication.id,
      req,
      metadata: {
        residentId: medication.residentId,
        name: medication.name,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Medication deleted successfully",
      medication,
    });
  } catch (err) {
    console.error("Delete medication error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to delete medication",
    });
  }
}

/**
 * Activate medication
 * POST /api/medications/:id/activate
 */
async function activateMedicationHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const medication = await activateMedication(id, req.user);

    // Log audit event
    logMedicationAction({
      action: "MEDICATION_ACTIVATED",
      userId: req.user.id,
      tenantId: medication.tenantId,
      resourceId: medication.id,
      req,
      metadata: {
        residentId: medication.residentId,
        name: medication.name,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Medication activated successfully",
      medication,
    });
  } catch (err) {
    console.error("Activate medication error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to activate medication",
    });
  }
}

/**
 * Deactivate medication
 * POST /api/medications/:id/deactivate
 */
async function deactivateMedicationHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const medication = await deactivateMedication(id, req.user);

    // Log audit event
    logMedicationAction({
      action: "MEDICATION_DEACTIVATED",
      userId: req.user.id,
      tenantId: medication.tenantId,
      resourceId: medication.id,
      req,
      metadata: {
        residentId: medication.residentId,
        name: medication.name,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Medication deactivated successfully",
      medication,
    });
  } catch (err) {
    console.error("Deactivate medication error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to deactivate medication",
    });
  }
}

module.exports = {
  createMedication: createMedicationHandler,
  getMedications: getMedicationsHandler,
  getMedicationById: getMedicationByIdHandler,
  updateMedication: updateMedicationHandler,
  deleteMedication: deleteMedicationHandler,
  activateMedication: activateMedicationHandler,
  deactivateMedication: deactivateMedicationHandler,
};

