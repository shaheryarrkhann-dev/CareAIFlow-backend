const {
  getResidents,
  getResidentById,
  getResidentCapacityStatus,
  deleteResident,
  updateResidentStatus,
} = require("../../services/resident/resident.service");
const {
  assignTierToResident,
  updateResidentTier,
  getResidentBilling,
} = require("../../services/billing/resident-billing.service");
const {
  logBillingAction,
  createAuditLog,
} = require("../../services/compliance/audit.service");
const {
  createResident,
  updateResident,
} = require("../../services/resident/resident-creation.service");
const {
  extractResidentDataFromPdf,
} = require("../../services/resident/resident-pdf-extraction.service");
const {
  exportResidentRosterPdf,
} = require("../../services/resident/resident-roster-export.service");
const {
  uploadResidentPhotoToS3,
  uploadESignatureToS3,
} = require("../../utils/s3.util");
const prisma = require("../../lib/prisma");

/**
 * Get all residents
 * GET /api/residents
 * Used for populating resident dropdown in progress notes
 */
async function getResidentsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const limit = Math.min(Number.parseInt(req.query.limit) || 1000, 5000); // Max 5000 for dropdown
    const offset = Number.parseInt(req.query.offset) || 0;
    const statusFromQuery = req.query.status || null;

    // Get tenantId from query (for SUPER_ADMIN) or use user's tenant
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN" ? req.query.tenantId : null;

    const result = await getResidents(req.user, {
      limit,
      offset,
      tenantIdFromQuery,
      statusFromQuery,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get residents error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve residents",
    });
  }
}

/**
 * GET /api/residents/capacity-status?facilityId=
 * Active resident count vs facility capacity limit (for create-gate UI).
 */
async function getResidentCapacityStatusHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const facilityId =
      typeof req.query.facilityId === "string" ? req.query.facilityId.trim() : "";
    if (!facilityId) {
      return res.status(400).json({
        success: false,
        message: "facilityId is required",
      });
    }

    const result = await getResidentCapacityStatus(req.user, facilityId);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get resident capacity status error:", err);
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to retrieve resident capacity status",
    });
  }
}

/**
 * Get resident by ID
 * GET /api/residents/:id
 */
async function getResidentByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const resident = await getResidentById(id, req.user);

    return res.status(200).json({
      success: true,
      resident,
    });
  } catch (err) {
    console.error("Get resident by ID error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("access denied")
    ) {
      return res.status(404).json({
        success: false,
        message: err.message || "Resident not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve resident",
    });
  }
}

/**
 * Assign tier to resident
 * PATCH /api/residents/:residentId/tier
 */
async function assignTierToResidentHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    const { billingTierId, startDate, tenantId } = req.body;

    // Determine tenantId
    let finalTenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && tenantId) {
      finalTenantId = tenantId;
    }

    if (!finalTenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    // Prepare user object with tenantIdFromQuery for SUPER_ADMIN
    const userForService = {
      ...req.user,
      tenantIdFromQuery: req.user.role === "SUPER_ADMIN" ? tenantId : undefined,
    };

    const residentBilling = await assignTierToResident(
      residentId,
      billingTierId,
      startDate ? new Date(startDate) : undefined,
      userForService
    );

    // Log audit event
    try {
      await logBillingAction({
        action: "RESIDENT_TIER_ASSIGNED",
        userId: req.user.id,
        tenantId: residentBilling.tenantId,
        resourceId: residentId,
        req,
        metadata: {
          billingTierId: residentBilling.billingTierId,
          billingTierName: residentBilling.billingTier.name,
          startDate: residentBilling.startDate,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for resident tier assignment:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Billing tier assigned to resident successfully",
      residentBilling,
    });
  } catch (err) {
    console.error("Assign tier to resident error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("does not belong")
    ) {
      return res.status(404).json({
        success: false,
        message: err.message || "Resident or billing tier not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to assign tier to resident",
    });
  }
}

/**
 * Update resident tier (end current tier)
 * PATCH /api/residents/:residentId/tier/end
 */
async function updateResidentTierHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    const { endDate, tenantId } = req.body;

    // Determine tenantId
    let finalTenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && tenantId) {
      finalTenantId = tenantId;
    }

    if (!finalTenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    // Prepare user object with tenantIdFromQuery for SUPER_ADMIN
    const userForService = {
      ...req.user,
      tenantIdFromQuery: req.user.role === "SUPER_ADMIN" ? tenantId : undefined,
    };

    const residentBilling = await updateResidentTier(
      residentId,
      endDate ? new Date(endDate) : undefined,
      userForService
    );

    // Log audit event
    try {
      await logBillingAction({
        action: "RESIDENT_TIER_UPDATED",
        userId: req.user.id,
        tenantId: residentBilling.tenantId,
        resourceId: residentId,
        req,
        metadata: {
          billingTierId: residentBilling.billingTierId,
          billingTierName: residentBilling.billingTier.name,
          endDate: residentBilling.endDate,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for resident tier update:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Resident tier assignment updated successfully",
      residentBilling,
    });
  } catch (err) {
    console.error("Update resident tier error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("No active billing tier")
    ) {
      return res.status(404).json({
        success: false,
        message: err.message || "Resident billing not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update resident tier",
    });
  }
}

/**
 * Get resident billing information
 * GET /api/residents/:residentId/billing
 */
async function getResidentBillingHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;

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

    const residentBilling = await getResidentBilling(residentId, tenantId);

    return res.status(200).json({
      success: true,
      ...residentBilling,
    });
  } catch (err) {
    console.error("Get resident billing error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to retrieve resident billing",
    });
  }
}

/**
 * Create new resident
 * POST /api/residents
 * Creates a new resident record by mapping fields.json field names to common-fields.json
 * and saving to the dynamic form table
 */
async function createResidentHandler(req, res) {
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

    // Get resident data from request body
    // If using multipart/form-data, parse JSON fields from body
    let residentData = {};
    if (typeof req.body === "object" && req.body !== null) {
      // Try to parse residentData if it's a JSON string (common with multipart/form-data)
      if (typeof req.body.residentData === "string") {
        try {
          residentData = JSON.parse(req.body.residentData);
        } catch (e) {
          // If parsing fails, use body directly
          residentData = req.body;
        }
      } else {
        // Use body directly (for JSON requests or already parsed form data)
        residentData = req.body;
      }
    }

    // Validate enum fields
    const enumValidations = {
      admission_type: ["Long-term", "Respite", "Short-term", "Other"],
      admission_status: ["Active", "Discharged", "Deceased"],
      care_needs_fall_risk: ["Low", "Medium", "High"],
      emergency_code_status: ["Full Code", "DNR", "DNI"],
      emergency_poa_type: ["Medical", "Financial", "Both"],
      payer_primary_payer: ["Private Pay", "Medicaid", "VA"],
    };

    for (const [field, allowedValues] of Object.entries(enumValidations)) {
      if (residentData[field] && !allowedValues.includes(residentData[field])) {
        return res.status(400).json({
          success: false,
          message: `Invalid value for ${field}. Must be one of: ${allowedValues.join(
            ", "
          )}`,
        });
      }
    }

    // Validation: If Code Status is DNR or DNI, POLST is required
    const codeStatus =
      residentData.code_status_advance_directives_code_status ||
      residentData.emergency_code_status;
    const polstOnFile =
      residentData.code_status_advance_directives_polst_on_file ||
      residentData.emergency_polst_on_file;
    const polstOk =
      polstOnFile === "Yes" || polstOnFile === true || polstOnFile === "yes";
    if (
      codeStatus &&
      (codeStatus.includes("DNR") || codeStatus === "DNI") &&
      !polstOk
    ) {
      return res.status(400).json({
        success: false,
        message: "POLST is required when Code Status is DNR or DNI",
      });
    }

    // Store photo file temporarily if provided (we'll upload after resident creation to get residentId)
    let photoFile = null;
    if (req.file && req.file.fieldname === "resident_photo") {
      photoFile = req.file;
      // Remove photo from residentData if it was included (we'll add the URL after upload)
      delete residentData.resident_photo;
    } else if (
      residentData.resident_photo &&
      typeof residentData.resident_photo === "string"
    ) {
      // Photo URL already provided (e.g., from frontend that uploaded separately)
      // Just use it as-is
      console.log(
        "[Resident-Creation] Using provided photo URL:",
        residentData.resident_photo
      );
    }

    // Create resident first (so we have residentId for photo upload)
    const resident = await createResident({
      tenantId,
      userId: req.user.id,
      userRole: req.user.role,
      residentData,
    });

    // Upload photo to S3 if provided (now we have residentId)
    if (photoFile) {
      try {
        const photoUploadResult = await uploadResidentPhotoToS3({
          tenantId,
          residentId: resident.id,
          fileName: photoFile.originalname || "resident-photo.jpg",
          buffer: photoFile.buffer,
          mimeType: photoFile.mimetype || "image/jpeg",
        });

        // Update resident with photo URL (both old and new schema fields)
        await prisma.resident.update({
          where: { id: resident.id },
          data: {
            residentPhoto: photoUploadResult.s3Url,
            residentIdentificationProfilePicture: photoUploadResult.s3Url,
          },
        });

        // Update resident object for response
        resident.residentPhoto = photoUploadResult.s3Url;

        console.log(
          "[Resident-Creation] Photo uploaded to S3:",
          photoUploadResult.s3Url
        );
      } catch (photoError) {
        console.error(
          "[Resident-Creation] Failed to upload photo:",
          photoError
        );
        // Don't fail the entire request if photo upload fails, just log it
        // Resident is already created, photo can be uploaded later
      }
    }

    // Log audit event
    try {
      await createAuditLog({
        action: "PHI_CREATE_RESIDENT",
        userId: req.user.id,
        tenantId,
        resource: "resident",
        resourceId: resident.id,
        description: "Resident created successfully",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          residentName:
            resident.residentFullLegalName ||
            resident.residentIdentificationFullLegalName ||
            residentData.resident_identification_full_legal_name ||
            residentData.resident_full_legal_name ||
            "Unknown",
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for resident creation:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Resident created successfully",
      resident: {
        id: resident.id,
        ...resident,
        // Remove metadata from response
        _metadata: undefined,
      },
    });
  } catch (err) {
    console.error("Create resident error:", err);

    // Handle validation errors
    if (err.message.includes("Missing required fields")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    if (err.status === 403 || err.message?.includes("Resident limit reached")) {
      return res.status(403).json({
        success: false,
        message: err.message || "Resident limit reached",
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create resident",
    });
  }
}

/**
 * Upload PDF and extract resident data
 * POST /api/residents/pdf
 * Extracts resident information from PDF using OpenAI
 */
async function extractResidentDataFromPdfHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Check if file was uploaded
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "PDF file is required",
      });
    }

    // Validate file type
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({
        success: false,
        message: "Only PDF files are allowed",
      });
    }

    // Validate file size (max 100MB as per spec)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 100MB.",
      });
    }

    // Determine tenantId (SUPER_ADMIN can specify in body, others use their own)
    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.body.tenantId || req.user.tenantId
        : req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    console.log("[Resident-PDF] Processing PDF:", {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      userId: req.user.id,
      tenantId: tenantId,
    });

    // Extract resident data from PDF (returns fields only, does NOT create resident)
    // Frontend will send these fields to POST /api/residents to create the resident
    const extractedFields = await extractResidentDataFromPdf(
      req.file.buffer,
      req.file.originalname
    );

    // Log audit event
    try {
      await createAuditLog({
        action: "PHI_ACCESS_RESIDENT",
        userId: req.user.id,
        tenantId: tenantId,
        resource: "resident",
        description: "PDF processed to extract resident data",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          fieldsExtracted: Object.keys(extractedFields).length,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for PDF extraction:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    // Return extracted fields to frontend (frontend will create resident via POST /api/residents)
    return res.status(200).json({
      success: true,
      message: "PDF processed successfully",
      fields: extractedFields, // Only contains fields from fields.json
    });
  } catch (err) {
    console.error("Extract resident data from PDF error:", err);

    // Handle specific errors
    if (err.message.includes("No text found")) {
      return res.status(400).json({
        success: false,
        message:
          "No text found in PDF. The PDF may be scanned or image-based. Please ensure the PDF contains extractable text.",
      });
    }

    if (err.message.includes("OpenAI") || err.message.includes("API")) {
      return res.status(500).json({
        success: false,
        message:
          "Failed to process PDF with AI. Please try again or contact support.",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Failed to process PDF",
    });
  }
}

/**
 * Export resident roster PDF
 * POST /api/residents/export/roster
 */
async function exportResidentRosterHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const residentIds = Array.isArray(req.body?.residentIds)
      ? req.body.residentIds.filter(
          (id) => typeof id === "string" && id.trim().length > 0
        )
      : [];

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.body?.tenantId || req.query?.tenantId || req.user.tenantId
        : req.user.tenantId;

    const pdfBuffer = await exportResidentRosterPdf(req.user, {
      residentIds,
      facilityId: req.body?.facilityId,
      tenantId,
    });

    const fileName = `resident-roster-${new Date()
      .toISOString()
      .split("T")[0]}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Export resident roster error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export resident roster",
    });
  }
}

/**
 * Deactivate resident (sets status to INACTIVE; record is preserved)
 * DELETE /api/residents/:id
 */
async function deleteResidentHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    const resident = await deleteResident(id, req.user);

    // Log audit event
    try {
      await createAuditLog({
        action: "PHI_UPDATE_RESIDENT",
        userId: req.user.id,
        tenantId: resident.tenantId,
        resource: "resident",
        resourceId: resident.id,
        description: "Resident set to inactive",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          residentName:
            resident.residentFullLegalName ||
            resident.residentPreferredName ||
            "Unknown",
          status: resident.status,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for resident deactivation:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Resident marked as inactive",
      resident: {
        id: resident.id,
        status: resident.status,
      },
    });
  } catch (err) {
    console.error("Deactivate resident error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("access denied") ||
      err.message.includes("administrator")
    ) {
      return res.status(403).json({
        success: false,
        message: err.message || "Access denied",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to deactivate resident",
    });
  }
}

/**
 * Update resident status (Active / Inactive)
 * PATCH /api/residents/:id/status
 */
async function updateResidentStatusHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    const updatedResident = await updateResidentStatus(id, status, req.user);

    try {
      await createAuditLog({
        action: "PHI_UPDATE_RESIDENT",
        userId: req.user.id,
        tenantId: updatedResident.tenantId,
        resource: "resident",
        resourceId: updatedResident.id,
        description: `Resident status changed to ${updatedResident.status}`,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          residentName:
            updatedResident.residentFullLegalName ||
            updatedResident.residentPreferredName ||
            "Unknown",
          status: updatedResident.status,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for resident status update:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        updatedResident.status === "ACTIVE"
          ? "Resident reactivated successfully"
          : "Resident marked as inactive",
      resident: {
        id: updatedResident.id,
        status: updatedResident.status,
      },
    });
  } catch (err) {
    console.error("Update resident status error:", err);
    if (err.message.includes("Status must be")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    if (
      err.message.includes("not found") ||
      err.message.includes("access denied") ||
      err.message.includes("administrator")
    ) {
      return res.status(403).json({
        success: false,
        message: err.message || "Access denied",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update resident status",
    });
  }
}

/**
 * Update resident
 * PUT /api/residents/:id
 * PATCH /api/residents/:id
 * Updates an existing resident record (partial update supported)
 */
async function updateResidentHandler(req, res) {
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

    // Get resident data from request body
    // If using multipart/form-data, parse JSON fields from body
    let residentData = {};
    if (typeof req.body === "object" && req.body !== null) {
      // Try to parse residentData if it's a JSON string (common with multipart/form-data)
      if (typeof req.body.residentData === "string") {
        try {
          residentData = JSON.parse(req.body.residentData);
        } catch (e) {
          // If parsing fails, use body directly
          residentData = req.body;
        }
      } else {
        // Use body directly (for JSON requests or already parsed form data)
        residentData = req.body;
      }
    }

    // Remove tenantId from residentData if present (handled separately)
    delete residentData.tenantId;

    // Validate enum fields if provided
    const enumValidations = {
      admission_type: ["Long-term", "Respite", "Short-term", "Other"],
      admission_status: ["Active", "Discharged", "Deceased"],
      care_needs_fall_risk: ["Low", "Medium", "High"],
      emergency_code_status: ["Full Code", "DNR", "DNI"],
      emergency_poa_type: ["Medical", "Financial", "Both"],
      payer_primary_payer: ["Private Pay", "Medicaid", "VA"],
    };

    for (const [field, allowedValues] of Object.entries(enumValidations)) {
      if (
        residentData[field] !== undefined &&
        !allowedValues.includes(residentData[field])
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid value for ${field}. Must be one of: ${allowedValues.join(
            ", "
          )}`,
        });
      }
    }

    // Conditional validation: If Code Status is DNR or DNI, POLST is required
    if (
      (residentData.emergency_code_status === "DNR" ||
        residentData.emergency_code_status === "DNI") &&
      !residentData.emergency_polst_on_file
    ) {
      return res.status(400).json({
        success: false,
        message: "POLST is required when Code Status is DNR or DNI",
      });
    }

    // Prepare user object with tenantIdFromQuery for SUPER_ADMIN
    const userForService = {
      ...req.user,
      tenantIdFromQuery: req.user.role === "SUPER_ADMIN" ? tenantId : undefined,
    };

    // Update resident
    const updatedResident = await updateResident({
      residentId: id,
      tenantId,
      user: userForService,
      residentData,
    });

    // Handle photo upload if provided
    if (req.file) {
      try {
        const photoUploadResult = await uploadResidentPhotoToS3({
          tenantId,
          residentId: updatedResident.id,
          fileName: req.file.originalname || "resident-photo.jpg",
          buffer: req.file.buffer,
          mimeType: req.file.mimetype || "image/jpeg",
        });

        // Update resident with photo URL (both old and new schema fields)
        const residentWithPhoto = await prisma.resident.update({
          where: { id: updatedResident.id },
          data: {
            residentPhoto: photoUploadResult.s3Url,
            residentIdentificationProfilePicture: photoUploadResult.s3Url,
          },
        });

        // Update resident object for response
        updatedResident.residentPhoto = residentWithPhoto.residentPhoto;
      } catch (photoError) {
        console.error("Failed to upload resident photo:", photoError);
        // Don't fail the entire update if photo upload fails
        // Photo can be uploaded separately later
      }
    }

    // Log audit event
    try {
      await createAuditLog({
        action: "PHI_UPDATE_RESIDENT",
        userId: req.user.id,
        tenantId: updatedResident.tenantId,
        resource: "resident",
        resourceId: updatedResident.id,
        description: "Resident updated",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          residentName:
            updatedResident.residentFullLegalName ||
            updatedResident.residentPreferredName ||
            "Unknown",
          updatedFields: Object.keys(residentData),
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for resident update:", {
        message: auditError?.message,
        stack: auditError?.stack,
        error: auditError,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Resident updated successfully",
      resident: updatedResident,
    });
  } catch (err) {
    console.error("Update resident error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("access denied") ||
      err.message.includes("only update")
    ) {
      return res.status(403).json({
        success: false,
        message: err.message || "Access denied",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update resident",
    });
  }
}

/**
 * Submit e-signature for resident
 * POST /api/residents/:id/esignature
 * Uploads signature image to S3 and links to resident
 */
async function submitESignatureHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id: residentId } = req.params;

    // Ensure resident exists and user has access
    const resident = await getResidentById(residentId, req.user);
    const tenantId = resident.tenantId;

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Signature image is required",
      });
    }

    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (!allowedMimeTypes.includes((req.file.mimetype || "").toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid image type. Allowed: ${allowedMimeTypes.join(", ")}`,
      });
    }

    const legalText =
      req.body.e_signature_legal_text ||
      req.body.legalText ||
      "I understand this is a legal representation of my signature.";

    const uploadResult = await uploadESignatureToS3({
      tenantId,
      residentId,
      fileName: req.file.originalname || "signature.png",
      buffer: req.file.buffer,
      mimeType: req.file.mimetype || "image/png",
    });

    const signedAt = new Date();

    await prisma.resident.update({
      where: { id: residentId },
      data: {
        eSignatureUrl: uploadResult.s3Url,
        eSignatureS3Key: uploadResult.s3Key,
        eSignatureSignedAt: signedAt,
        eSignatureLegalText: legalText,
      },
    });

    try {
      await createAuditLog({
        action: "PHI_UPDATE_RESIDENT",
        userId: req.user.id,
        tenantId,
        resource: "resident",
        resourceId: residentId,
        description: "E-signature submitted and linked to resident",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { eSignatureSignedAt: signedAt.toISOString() },
      });
    } catch (auditError) {
      console.error(
        "Failed to log audit for e-signature:",
        auditError?.message
      );
    }

    const updated = await getResidentById(residentId, req.user);

    return res.status(200).json({
      success: true,
      message: "E-signature saved successfully",
      resident: updated,
    });
  } catch (err) {
    console.error("Submit e-signature error:", err);
    if (
      err.message?.includes("not found") ||
      err.message?.includes("access denied")
    ) {
      return res.status(404).json({
        success: false,
        message: err.message || "Resident not found",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to save e-signature",
    });
  }
}

module.exports = {
  getResidents: getResidentsHandler,
  getResidentCapacityStatus: getResidentCapacityStatusHandler,
  getResidentById: getResidentByIdHandler,
  createResident: createResidentHandler,
  updateResident: updateResidentHandler,
  extractResidentDataFromPdf: extractResidentDataFromPdfHandler,
  assignTierToResident: assignTierToResidentHandler,
  updateResidentTier: updateResidentTierHandler,
  getResidentBilling: getResidentBillingHandler,
  deleteResident: deleteResidentHandler,
  updateResidentStatus: updateResidentStatusHandler,
  submitESignature: submitESignatureHandler,
  exportResidentRoster: exportResidentRosterHandler,
};
