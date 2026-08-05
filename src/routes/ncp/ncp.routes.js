const express = require("express");
const router = express.Router();
const multer = require("multer");

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const {
  enforceTenantIsolation,
} = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const ncpController = require("../../controllers/ncp/ncp.controller");
const {
  extractionIdValidator,
  listExtractionsValidator,
  updateExtractionValidator,
} = require("../../validators/ncp.validators");

// Configure multer for PDF uploads (single or multiple)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max per file
    files: 10, // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Only accept PDF files
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

// All routes require authentication and NCP:view (aligned with frontend NCP)
router.use(authenticate());
router.use(requirePermission("NCP", "view"));

/**
 * POST /api/ncp/extract
 * Upload PDF(s) and queue NCP extraction
 * Roles: All authenticated users
 * Content-Type: multipart/form-data
 * Body:
 *   - file (single PDF, max 100MB) OR files (multiple PDFs, max 10 files)
 *   - tenantId (optional for SUPER_ADMIN)
 *   - residentId (optional, single UUID or array of UUIDs for bulk)
 *
 * Supports both single and bulk uploads:
 * - Single: Use "file" field
 * - Bulk: Use "files" field (array)
 */
router.post(
  "/extract",
  enforceTenantIsolation("tenantId"),
  // Accept both single file and multiple files
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 10 },
  ]),
  // Multer error handler
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "File too large. Maximum size is 100MB per file.",
        });
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          success: false,
          message: "Too many files. Maximum is 10 files per request.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }
    next();
  },
  // Normalize files: convert to array format for consistent handling
  (req, res, next) => {
    // Normalize file handling
    if (req.files) {
      if (req.files.files && Array.isArray(req.files.files)) {
        // Multiple files uploaded via "files" field
        req.files = req.files.files;
      } else if (req.files.file && Array.isArray(req.files.file)) {
        // Single file uploaded via "file" field, convert to array
        req.files = req.files.file;
      } else if (req.files.file) {
        // Single file as object, convert to array
        req.files = [req.files.file];
      }
    } else if (req.file) {
      // Fallback: single file upload
      req.files = [req.file];
    }
    next();
  },
  ncpController.uploadAndExtractHandler,
);

/**
 * GET /api/ncp/schema
 * Get NCP schema with sections and field metadata
 * Roles: All authenticated users
 */
router.get(
  "/schema",
  ncpController.getSchemaHandler,
);

/**
 * GET /api/ncp/extractions
 * List all NCP extractions with pagination
 * Roles: All authenticated users
 * Query params: limit, offset, status, tenantId (for SUPER_ADMIN)
 */
router.get(
  "/extractions",
  enforceTenantIsolation("tenantId"),
  validate(listExtractionsValidator),
  ncpController.listExtractionsHandler,
);

/**
 * GET /api/ncp/extractions/:id
 * Get NCP extraction by ID
 * Roles: All authenticated users
 */
router.get(
  "/extractions/:id",
  validate(extractionIdValidator),
  ncpController.getExtractionHandler,
);

/**
 * GET /api/ncp/extractions/:id/progress
 * Get extraction progress (step + percent) for progress modal polling
 * Roles: All authenticated users
 */
router.get(
  "/extractions/:id/progress",
  validate(extractionIdValidator),
  ncpController.getProgressHandler,
);

/**
 * PUT /api/ncp/extractions/:id
 * Update NCP extraction data
 * Roles: All authenticated users
 * Body: { extractedData: Object }
 */
router.put(
  "/extractions/:id",
  validate(extractionIdValidator),
  validate(updateExtractionValidator),
  ncpController.updateExtractionHandler,
);

/**
 * POST /api/ncp/extractions/:id/populate
 * Generate populated DOCX from extraction
 * Roles: All authenticated users
 */
router.post(
  "/extractions/:id/populate",
  validate(extractionIdValidator),
  ncpController.populateDocxHandler,
);

/**
 * GET /api/ncp/extractions/:id/download
 * Download populated DOCX file
 * Roles: All authenticated users
 */
router.get(
  "/extractions/:id/download",
  validate(extractionIdValidator),
  ncpController.downloadDocxHandler,
);

/**
 * PATCH /api/ncp/extractions/:id/approve
 * Approve NCP extraction after user reviews AI-generated content.
 * Approval is required before the final DOCX can be downloaded/printed.
 * Roles: All authenticated users
 */
router.patch(
  "/extractions/:id/approve",
  validate(extractionIdValidator),
  ncpController.approveExtractionHandler,
);

/**
 * POST /api/ncp/extractions/:id/summary
 * Generate AI assessment summary from extracted NCP data
 * Roles: All authenticated users
 */
router.post(
  "/extractions/:id/summary",
  enforceTenantIsolation("tenantId"),
  validate(extractionIdValidator),
  ncpController.generateSummaryHandler,
);

/**
 * DELETE /api/ncp/extractions/:id
 * Delete NCP extraction and associated S3 files
 * Roles: All authenticated users
 */
router.delete(
  "/extractions/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(extractionIdValidator),
  ncpController.deleteExtractionHandler,
);

module.exports = router;
