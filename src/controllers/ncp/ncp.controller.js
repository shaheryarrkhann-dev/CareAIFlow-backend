const {
  uploadAndExtractNcp,
  uploadAndExtractNcpBulk,
  getNcpExtractionById,
  getNcpExtractionProgress,
  listNcpExtractions,
  updateNcpExtraction,
  generateNcpDocx,
  getNcpDocxDownload,
  approveNcpExtraction,
  archiveNcpExtraction,
  generateAssessmentSummary,
} = require("../../services/ncp/ncp.service");
const { downloadPdfFromS3 } = require("../../utils/s3.util");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../../utils/s3.util");

/**
 * Upload PDF(s) and queue NCP extraction
 * POST /api/ncp/extract
 * Supports both single file (req.file) and multiple files (req.files)
 */
async function uploadAndExtractHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

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

    // Check if multiple files or single file
    const files = req.files || (req.file ? [req.file] : null);

    if (!files?.length) {
      return res.status(400).json({
        success: false,
        message: "At least one PDF file is required",
      });
    }

    // Parse residentId from body (can be single value or array for bulk)
    const residentIdParam = req.body.residentId;
    let residentIds = null;

    if (residentIdParam) {
      // If it's a string, convert to array; if already array, use as-is
      residentIds = Array.isArray(residentIdParam)
        ? residentIdParam
        : [residentIdParam];

      // Pad with nulls if fewer residentIds than files
      while (residentIds.length < files.length) {
        residentIds.push(null);
      }
    } else {
      // No residentId provided, create array of nulls
      residentIds = new Array(files.length).fill(null);
    }

    // Prepare files array with residentIds
    const filesWithResidentIds = files.map((file, index) => ({
      buffer: file.buffer,
      fileName: file.originalname,
      residentId: residentIds[index] || null,
    }));

    // Process single or bulk upload
    let result;
    if (files.length === 1) {
      // Single file - use single upload function for consistency
      const singleResult = await uploadAndExtractNcp({
        pdfBuffer: filesWithResidentIds[0].buffer,
        fileName: filesWithResidentIds[0].fileName,
        tenantId,
        userId: req.user.id,
        residentId: filesWithResidentIds[0].residentId,
      });
      result = {
        success: true,
        extractions: [singleResult.extraction],
        summary: {
          total: 1,
          successful: 1,
          failed: 0,
        },
      };
    } else {
      // Multiple files - use bulk upload function
      result = await uploadAndExtractNcpBulk({
        files: filesWithResidentIds,
        tenantId,
        userId: req.user.id,
      });
    }

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Upload and extract error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload and extract NCP data",
    });
  }
}

/**
 * Get NCP extraction by ID
 * GET /api/ncp/extractions/:id
 */
async function getExtractionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const extraction = await getNcpExtractionById(id, req.user);

    return res.status(200).json({
      success: true,
      extraction,
    });
  } catch (error) {
    console.error("Get extraction error:", error);
    if (error.message === "Extraction not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve extraction",
    });
  }
}

/**
 * Get extraction progress (for progress modal polling)
 * GET /api/ncp/extractions/:id/progress
 */
async function getProgressHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }
    const { id } = req.params;
    const progress = await getNcpExtractionProgress(id, req.user);
    return res.status(200).json({
      success: true,
      step: progress.step,
      percent: progress.percent,
      status: progress.status,
    });
  } catch (error) {
    if (error.message === "Extraction not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get progress",
    });
  }
}

/**
 * List NCP extractions
 * GET /api/ncp/extractions
 */
async function listExtractionsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const limit = Number.parseInt(req.query.limit) || 20;
    const offset = Number.parseInt(req.query.offset) || 0;
    const status = req.query.status || null;
    const residentId = req.query.residentId || null;
    const includeArchived = req.query.includeArchived === "true";
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN" ? req.query.tenantId : null;

    const result = await listNcpExtractions(req.user, {
      limit,
      offset,
      status,
      residentId,
      tenantIdFromQuery,
      includeArchived,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("List extractions error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to list extractions",
    });
  }
}

/**
 * Update NCP extraction data
 * PUT /api/ncp/extractions/:id
 */
async function updateExtractionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { extractedData, requiresCbhs, cbhsNotes } = req.body;

    if (!extractedData || typeof extractedData !== "object") {
      return res.status(400).json({
        success: false,
        message: "extractedData is required and must be an object",
      });
    }

    const updated = await updateNcpExtraction(id, extractedData, req.user, {
      requiresCbhs,
      cbhsNotes,
    });

    return res.status(200).json({
      success: true,
      extraction: updated,
    });
  } catch (error) {
    console.error("Update extraction error:", error);
    if (error.message === "Extraction not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update extraction",
    });
  }
}

/**
 * Generate populated DOCX
 * POST /api/ncp/extractions/:id/populate
 */
async function populateDocxHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const result = await generateNcpDocx(id, req.user);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Populate DOCX error:", error);
    if (error.message === "Extraction not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message.includes("still in progress") || error.message.includes("No extracted data")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate populated DOCX",
    });
  }
}

/**
 * Download populated DOCX
 * GET /api/ncp/extractions/:id/download
 */
async function downloadDocxHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const downloadInfo = await getNcpDocxDownload(id, req.user);

    // Download file from S3
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: downloadInfo.s3Key,
    });

    const response = await s3Client.send(command);

    // Set response headers
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadInfo.fileName}"`);

    // Stream file to response
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return res.send(buffer);
  } catch (error) {
    console.error("Download DOCX error:", error);
    if (error.message === "Extraction not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message.includes("has not been generated")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to download DOCX",
    });
  }
}

/**
 * Archive NCP extraction (soft delete)
 * DELETE /api/ncp/extractions/:id
 */
async function deleteExtractionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const extractionId = req.params.id;
    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const archivedExtraction = await archiveNcpExtraction(
      extractionId,
      tenantId,
      req.user.id
    );

    return res.status(200).json({
      success: true,
      message: "Extraction archived successfully",
      extraction: {
        id: archivedExtraction.id,
        sourcePdfFileName: archivedExtraction.sourcePdfFileName,
        deletedAt: archivedExtraction.deletedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("[NCP] Error in deleteExtractionHandler:", error);

    if (error.message === "Extraction not found or access denied") {
      return res.status(404).json({
        success: false,
        message: "Extraction not found or access denied",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to archive extraction",
    });
  }
}

/**
 * Get NCP schema with sections and field metadata
 * GET /api/ncp/schema
 */
async function getSchemaHandler(req, res) {
  try {
    const { getNcpSchema } = require("../../services/ncp/ncp.service");
    const schema = getNcpSchema();

    return res.status(200).json({
      success: true,
      schema,
    });
  } catch (error) {
    console.error("Get NCP schema error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve NCP schema",
    });
  }
}

/**
 * Generate AI assessment summary for an NCP extraction
 * POST /api/ncp/extractions/:id/summary
 */
async function generateSummaryHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const extractionId = req.params.id;
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

    const summary = await generateAssessmentSummary(extractionId, tenantId);

    return res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Generate summary error:", error);
    if (error.message === "Extraction not found or access denied") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (
      error.message.includes("still in progress") ||
      error.message.includes("No extracted data")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate assessment summary",
    });
  }
}

/**
 * PATCH /api/ncp/extractions/:id/approve
 * Approve a populated NCP extraction. Required before download/print of final copy.
 */
async function approveExtractionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const { id } = req.params;
    const updated = await approveNcpExtraction(id, req.user);

    return res.status(200).json({
      success: true,
      message: "NCP approved successfully",
      extraction: {
        id: updated.id,
        approvedAt: updated.approvedAt,
        approvedByName: updated.approvedByName,
        ncpVersion: updated.ncpVersion,
        status: updated.status,
      },
    });
  } catch (error) {
    if (
      error.message.includes("not found") ||
      error.message.includes("Access denied")
    ) {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (
      error.message.includes("must be populated") ||
      error.message.includes("still in progress")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to approve NCP" });
  }
}

module.exports = {
  uploadAndExtractHandler,
  getExtractionHandler,
  getProgressHandler,
  listExtractionsHandler,
  updateExtractionHandler,
  populateDocxHandler,
  downloadDocxHandler,
  approveExtractionHandler,
  deleteExtractionHandler,
  getSchemaHandler,
  generateSummaryHandler,
};
