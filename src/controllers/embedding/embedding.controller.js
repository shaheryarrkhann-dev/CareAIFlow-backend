const { processPdfAndStore } = require("../../services/embedding/embedding.service");
const { getTenantPdfTemplates } = require("../../services/pdf/pdf.service");
const {
  getEmbeddings,
  getEmbeddingById,
  deleteEmbedding,
} = require("../../services/embedding/embedding.service");
const { previewFieldCleanup } = require("../../services/form-field/formFieldCleanup.service");

async function uploadPdf(req, res) {
  // CORS headers are handled by global middleware in app.js
  // But ensure they're set for this specific response
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }

  console.log("📁 Upload request received:", {
    contentType: req.headers["content-type"],
    hasFile: !!req.file,
    fileSize: req.file?.size,
    fileName: req.file?.originalname,
    bodyKeys: Object.keys(req.body || {}),
    user: req.user?.email,
    multerError: req.multerError,
  });

  // Check for multer errors first
  if (req.multerError) {
    console.error("❌ Multer error:", req.multerError);
    return res.status(400).json({
      success: false,
      message: `Upload error: ${req.multerError.message}`,
    });
  }

  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }

  // Check for multer errors
  if (req.fileValidationError) {
    return res
      .status(400)
      .json({ success: false, message: req.fileValidationError });
  }

  const tenantId =
    req.user.role === "SUPER_ADMIN"
      ? req.body.tenantId || req.user.tenantId
      : req.user.tenantId;
  if (!tenantId) {
    return res
      .status(400)
      .json({ success: false, message: "tenantId is required" });
  }

  if (!req.file || !req.file.buffer) {
    return res
      .status(400)
      .json({ success: false, message: "PDF file is required" });
  }

  // Parse field mapping if provided (as JSON string in form data)
  let fieldMapping = null;
  if (req.body.fieldMapping) {
    try {
      fieldMapping = JSON.parse(req.body.fieldMapping);
      if (!Array.isArray(fieldMapping)) {
        return res.status(400).json({
          success: false,
          message: "fieldMapping must be an array of field position objects",
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid fieldMapping JSON format",
      });
    }
  }

  // Check if AI detection should be enabled (default: true)
  const enableAIDetection = req.body.enableAIDetection !== "false";

  // Check detection method: hybrid (default), coordinate, or vision
  // DEFAULT: Hybrid detection is now enabled by default for best results
  const useHybridDetection = req.body.useHybridDetection !== "false"; // Default: true
  const useCoordinateDetection = req.body.useCoordinateDetection === "true"; // Only if explicitly requested

  // NOTE: PDF processing can take several minutes for large files with AI detection.
  // If you're getting 504 Gateway Timeout errors, increase the timeout in your:
  // 1. Nginx: proxy_read_timeout 300s; (5 minutes)
  // 2. Load balancer: Increase idle timeout to 5+ minutes
  // 3. API Gateway: Increase timeout settings

  try {
    console.log(
      "⏳ Starting PDF processing (this may take a while for large files)..."
    );
    const startTime = Date.now();

    const result = await processPdfAndStore({
      tenantId,
      fileName: req.file.originalname,
      buffer: req.file.buffer,
      userId: req.user.id,
      fieldMapping,
      displayName: req.body.displayName,
      description: req.body.description,
      enableAIDetection,
      useHybridDetection: useHybridDetection && !useCoordinateDetection, // Hybrid by default unless coordinate explicitly requested
      useCoordinateDetection: useCoordinateDetection, // Only if explicitly set
    });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ PDF processing completed in ${processingTime}s`);

    // Check if this was a duplicate upload
    if (result.isDuplicate) {
      return res.status(200).json({
        success: true,
        message:
          result.duplicateMessage ||
          "PDF already uploaded - returning existing template",
        isDuplicate: true,
        chunks: result.chunks,
        schemaUpdated: false,
        schemaId: null,
        merged: false,
        newFieldsAdded: 0,
        s3: {
          url: result.s3Url,
          key: result.s3Key,
          bucket: result.s3Bucket,
        },
        template: result.template
          ? {
              id: result.template.id,
              displayName: result.template.displayName,
              hasFieldMapping: result.template.hasFieldMapping,
              fieldCount: result.template.fieldCount,
              aiGenerated: result.template.aiGenerated || false,
              isDuplicate: true,
              originalUploadDate: result.template.originalUploadDate,
            }
          : null,
        aiDetection: result.aiDetection,
        processingTimeSeconds: 0, // No processing for duplicates
      });
    }

    return res.status(201).json({
      success: true,
      message: result.aiDetection?.usedAI
        ? "🤖 PDF uploaded with AI-detected field positions!"
        : "PDF uploaded and form schema updated",
      chunks: result.chunks,
      schemaUpdated: result.schemaUpdated,
      schemaId: result.schemaId,
      merged: result.merged,
      newFieldsAdded: result.newFieldsAdded,
      s3: {
        url: result.s3Url,
        key: result.s3Key,
        bucket: result.s3Bucket,
      },
      template: result.template
        ? {
            id: result.template.id,
            displayName: result.template.displayName,
            hasFieldMapping:
              result.template.fieldMapping &&
              result.template.fieldMapping.length > 0,
            fieldCount: result.template.fieldMapping
              ? result.template.fieldMapping.length
              : 0,
            aiGenerated: result.aiDetection?.usedAI || false,
          }
        : null,
      aiDetection: result.aiDetection,
      processingTimeSeconds: parseFloat(processingTime),
    });
  } catch (err) {
    console.error("❌ Upload PDF error:", err);
    console.error("Error stack:", err.stack);

    // Don't send response if headers already sent
    if (res.headersSent) {
      return;
    }

    // Ensure CORS headers are set for error responses
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    }

    // Provide more detailed error message
    const errorMessage = err.message || "Failed to process PDF";
    const statusCode = err.status || 500;

    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  }
}

/**
 * Get all PDF templates for tenant
 * GET /api/embeddings/templates
 */
async function getTemplates(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const templates = await getTenantPdfTemplates(tenantId);

    const mappedTemplates = templates.map((t) => ({
      id: t.id,
      fileName: t.fileName,
      displayName: t.displayName,
      description: t.description,
      s3Url: t.s3Url,
      fieldCount: t.fieldMapping ? t.fieldMapping.length : 0,
      createdAt: t.createdAt,
    }));

    // Apply pagination
    const total = mappedTemplates.length;
    const paginatedTemplates = mappedTemplates.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      count: paginatedTemplates.length,
      total: total,
      templates: paginatedTemplates,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (err) {
    console.error("Get templates error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve PDF templates",
    });
  }
}

/**
 * Get all PDF embeddings for tenant
 * GET /api/embeddings
 */
async function getEmbeddingsController(req, res) {
  try {
    console.log("📄 GET embeddings request received:", {
      user: req.user?.email,
      tenantId: req.user?.tenantId,
      role: req.user?.role,
      query: req.query,
    });

    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    if (!tenantId) {
      return res
        .status(400)
        .json({ success: false, message: "tenantId is required" });
    }

    const { page = 1, limit = 10, search = "" } = req.query;
    console.log(
      "🔍 Fetching embeddings for tenant:",
      tenantId,
      "with options:",
      { page, limit, search }
    );

    const result = await getEmbeddings(tenantId, {
      page: Number.parseInt(page, 10),
      limit: Number.parseInt(limit, 10),
      search,
    });

    console.log("✅ Embeddings fetched successfully:", {
      count: result.embeddings?.length || 0,
      total: result.pagination?.total || 0,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("❌ Get embeddings error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve PDF embeddings",
    });
  }
}

/**
 * Get specific PDF embedding by ID
 * GET /api/embeddings/:id
 */
async function getEmbeddingByIdController(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const { id } = req.params;
    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;

    const embedding = await getEmbeddingById(id, tenantId);

    return res.status(200).json({
      success: true,
      embedding,
    });
  } catch (err) {
    console.error("Get embedding by ID error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve PDF embedding",
    });
  }
}

/**
 * Preview field cleanup before deleting PDF
 * GET /api/embeddings/:id/preview-delete
 */
async function previewFieldCleanupController(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const { id } = req.params;
    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;

    const preview = await previewFieldCleanup({
      tenantId,
      pdfTemplateId: id,
    });

    return res.status(200).json({
      success: true,
      preview,
    });
  } catch (err) {
    console.error("Preview field cleanup error:", err);
    return res.status(err.message.includes("not found") ? 404 : 500).json({
      success: false,
      message: err.message || "Failed to preview field cleanup",
    });
  }
}

/**
 * Delete PDF embedding by ID
 * DELETE /api/embeddings/:id
 * Also cleans up master form fields that are no longer used
 */
async function deleteEmbeddingController(req, res) {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const { id } = req.params;
    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;

    const result = await deleteEmbedding(id, tenantId);

    // Build user-friendly message
    let message = "PDF deleted successfully";
    if (result.fieldCleanup && result.fieldCleanup.masterFormDeleted) {
      message =
        "PDF deleted successfully and master form deleted completely (was the last PDF)";
    } else if (result.fieldCleanup && result.fieldCleanup.fieldsRemoved > 0) {
      message += ` and ${result.fieldCleanup.fieldsRemoved} unused field(s) removed from master form`;
    } else if (
      result.fieldCleanup &&
      result.fieldCleanup.fieldsStillInUse > 0
    ) {
      message += " (all fields are still in use by other forms)";
    }

    return res.status(200).json({
      success: true,
      message,
      ...result,
    });
  } catch (err) {
    console.error("Delete embedding error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to delete PDF embedding",
    });
  }
}

module.exports = {
  uploadPdf,
  getTemplates,
  getEmbeddings: getEmbeddingsController,
  getEmbeddingById: getEmbeddingByIdController,
  previewFieldCleanup: previewFieldCleanupController,
  deleteEmbedding: deleteEmbeddingController,
};
