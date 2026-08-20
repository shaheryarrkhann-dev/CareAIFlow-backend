const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/rbac.middleware");
const {
  ensureTenantScope,
  enforceTenantIsolation,
} = require("../../middlewares/tenant.middleware");
const {
  uploadPdf,
  getTemplates,
  getEmbeddings,
  getEmbeddingById,
  previewFieldCleanup,
  deleteEmbedding,
} = require("../../controllers/embedding/embedding.controller");
const {
  requirePlanModule,
} = require("../../middlewares/plan-entitlement.middleware");

const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    fieldSize: 100 * 1024 * 1024, // 100MB for form fields
    fieldNameSize: 100,
    fieldValueSize: 100 * 1024 * 1024,
  },
});

// Handle CORS preflight for upload route
// Note: Global CORS middleware in app.js should handle this, but keeping for explicit handling
router.options("/upload", (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept"
  );
  res.status(200).end();
});

// All routes require authentication
router.use(authenticate());
// AI PDF embeddings / form extraction — Professional+
router.use(requirePlanModule("aiAdmissions"));

/**
 * POST /api/embeddings/upload
 * Upload a PDF, extract, chunk, embed, and store per-tenant
 * Roles: ADMIN, STAFF, GUARDIAN, SUPER_ADMIN
 * SUPER_ADMIN may specify tenantId in body to target a tenant
 */
router.post(
  "/upload",
  authorize("SUPER_ADMIN", "ADMIN", "STAFF", "GUARDIAN"),
  enforceTenantIsolation("tenantId"),
  ensureTenantScope,
  upload.single("file"),
  // Multer error handler - must be after upload.single() but before the route handler
  (err, req, res, next) => {
    // Set CORS headers for error responses
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "File too large. Maximum size is 100MB.",
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
  // Wrap async handler to catch errors properly
  async (req, res, next) => {
    try {
      await uploadPdf(req, res);
    } catch (err) {
      // Ensure CORS headers are set even on errors
      if (!res.headersSent) {
        res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
        res.header("Access-Control-Allow-Credentials", "true");
      }
      next(err);
    }
  }
);

/**
 * GET /api/embeddings
 * Get all PDF embeddings for tenant
 * Roles: ADMIN, STAFF, GUARDIAN, SUPER_ADMIN
 */
router.get(
  "/",
  authorize("SUPER_ADMIN", "ADMIN", "STAFF", "GUARDIAN"),
  getEmbeddings
);

/**
 * GET /api/embeddings/templates
 * Get all PDF templates for tenant
 * Roles: ADMIN, STAFF, GUARDIAN, SUPER_ADMIN
 * IMPORTANT: Must be before /:id route to avoid route conflicts
 */
router.get(
  "/templates",
  authorize("SUPER_ADMIN", "ADMIN", "STAFF", "GUARDIAN"),
  getTemplates
);

/**
 * GET /api/embeddings/:id/preview-delete
 * Preview which fields will be removed from master form when deleting this PDF
 * Roles: ADMIN, SUPER_ADMIN
 */
router.get(
  "/:id/preview-delete",
  authorize("SUPER_ADMIN", "ADMIN"),
  previewFieldCleanup
);

/**
 * GET /api/embeddings/:id
 * Get specific PDF embedding by ID
 * Roles: ADMIN, STAFF, GUARDIAN, SUPER_ADMIN
 */
router.get(
  "/:id",
  authorize("SUPER_ADMIN", "ADMIN", "STAFF", "GUARDIAN"),
  getEmbeddingById
);

/**
 * DELETE /api/embeddings/:id
 * Delete PDF embedding by ID (also cleans up unused master form fields)
 * Roles: ADMIN, SUPER_ADMIN
 */
router.delete("/:id", authorize("SUPER_ADMIN", "ADMIN"), deleteEmbedding);

module.exports = router;
