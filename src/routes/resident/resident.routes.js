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
const residentController = require("../../controllers/resident/resident.controller");
const {
  getResidentsValidator,
  residentIdValidator,
} = require("../../validators/note.validators");
const {
  assignTierToResidentValidator,
  updateResidentTierValidator,
} = require("../../validators/resident-billing.validators");
const {
  createResidentValidator,
  updateResidentValidator,
  getResidentByIdValidator,
  submitESignatureValidator,
} = require("../../validators/resident.validators");
const residentFolderController = require("../../controllers/resident/resident-folder.controller");
const residentDocumentController = require("../../controllers/resident/resident-document.controller");
const {
  residentIdParam: residentIdParamFolder,
  createFolderValidator,
  updateFolderValidator,
  folderIdParam,
} = require("../../validators/resident-folder.validators");
const {
  residentIdParam: residentIdParamDocument,
  listDocumentsValidator,
  documentIdParam,
  updateDocumentValidator,
} = require("../../validators/resident-document.validators");

// Configure multer for PDF uploads
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max as per API spec
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

// Configure multer for resident photo uploads (images only)
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for images
  },
  fileFilter: (req, file, cb) => {
    // Only accept image files
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only image files are allowed. Allowed types: ${allowedMimeTypes.join(
            ", "
          )}`
        ),
        false
      );
    }
  },
});

// All routes require authentication and RESIDENTS:view (aligned with frontend Residents / Resident PDFs)
router.use(authenticate());
router.use(requirePermission("RESIDENTS", "view"));

/**
 * POST /api/residents/pdf
 * Upload PDF and extract resident data
 * Roles: All authenticated users
 * Content-Type: multipart/form-data
 * Body: file (PDF file, max 100MB)
 * tenantId is extracted from JWT token
 */
router.post(
  "/pdf",
  uploadPdf.single("file"),
  // Multer error handler
  (err, req, res, next) => {
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
  residentController.extractResidentDataFromPdf
);

/**
 * POST /api/residents
 * Create new resident
 * Roles: All authenticated users
 * Content-Type: multipart/form-data (if photo is included) OR application/json
 * Body:
 *   - residentData: JSON string with resident fields (resident_fields.json format)
 *   - resident_photo: (optional) Image file (JPEG, PNG, GIF, WebP, max 10MB)
 *   - tenantId: (optional for SUPER_ADMIN) Tenant ID
 *
 * Note: If photo is provided, use multipart/form-data. Otherwise, JSON is fine.
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from body if provided
  uploadPhoto.single("resident_photo"), // Optional photo upload
  // Multer error handler for photo upload
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Photo file too large. Maximum size is 10MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    next();
  },
  // Parse residentData if it's a JSON string (for multipart/form-data)
  (req, res, next) => {
    // If residentData is a string, parse it and merge into body for validation
    if (req.body.residentData && typeof req.body.residentData === "string") {
      try {
        const parsedData = JSON.parse(req.body.residentData);
        req.body = { ...req.body, ...parsedData };
      } catch (e) {
        // If parsing fails, validation will catch it
      }
    }
    next();
  },
  // Note: Validation is handled in controller for multipart/form-data compatibility
  // Basic validation is done in controller after parsing
  residentController.createResident
);

/**
 * GET /api/residents
 * Get all residents from Resident model
 * Roles: All authenticated users
 * Used for populating resident dropdown in progress notes
 * Query params: limit, offset
 * tenantId can be in query param for SUPER_ADMIN
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getResidentsValidator),
  residentController.getResidents
);

// Resident document folders (must be before /:id)
router.get(
  "/:residentId/folders",
  enforceTenantIsolation("tenantId"),
  validate(residentIdParamFolder),
  residentFolderController.getFolders
);
router.get(
  "/:residentId/folders/:id/contents",
  enforceTenantIsolation("tenantId"),
  validate(folderIdParam),
  residentFolderController.getFolderContents
);
router.post(
  "/:residentId/folders",
  enforceTenantIsolation("tenantId"),
  validate(createFolderValidator),
  residentFolderController.createFolder
);
router.put(
  "/:residentId/folders/:id",
  enforceTenantIsolation("tenantId"),
  validate(updateFolderValidator),
  residentFolderController.updateFolder
);
router.delete(
  "/:residentId/folders/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(folderIdParam),
  residentFolderController.deleteFolder
);

// Resident documents (upload route before :id)
const uploadResidentDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});
router.get(
  "/:residentId/documents",
  enforceTenantIsolation("tenantId"),
  validate(listDocumentsValidator),
  residentDocumentController.listDocuments
);
router.post(
  "/:residentId/documents/upload",
  enforceTenantIsolation("tenantId"),
  uploadResidentDoc.single("file"),
  (err, req, res, next) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "File too large. Maximum size is 50MB.",
      });
    }
    next(err);
  },
  residentDocumentController.uploadDocument
);
router.get(
  "/:residentId/documents/audit-history",
  enforceTenantIsolation("tenantId"),
  validate(residentIdParamDocument),
  residentDocumentController.getResidentDocumentAuditHistory
);
router.get(
  "/:residentId/documents/:id/download",
  enforceTenantIsolation("tenantId"),
  validate(documentIdParam),
  residentDocumentController.downloadDocument
);
router.get(
  "/:residentId/documents/:id/view-url",
  enforceTenantIsolation("tenantId"),
  validate(documentIdParam),
  residentDocumentController.getViewUrl
);
router.patch(
  "/:residentId/documents/:id",
  enforceTenantIsolation("tenantId"),
  validate(updateDocumentValidator),
  residentDocumentController.updateDocument
);
router.delete(
  "/:residentId/documents/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(documentIdParam),
  residentDocumentController.deleteDocument
);

/**
 * POST /api/residents/:id/esignature
 * Submit e-signature image for resident (upload to S3 and link to resident)
 * Roles: All authenticated users
 * Content-Type: multipart/form-data
 * Body: signature (image file), e_signature_legal_text (optional)
 */
const uploadSignature = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowed.includes((file.mimetype || "").toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed for signature"), false);
    }
  },
});
router.post(
  "/:id/esignature",
  validate(submitESignatureValidator),
  uploadSignature.single("signature"),
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Signature image too large. Maximum size is 5MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || "Signature upload error",
      });
    }
    if (err)
      return res
        .status(400)
        .json({
          success: false,
          message: err.message || "Signature upload error",
        });
    next();
  },
  residentController.submitESignature
);

/**
 * GET /api/residents/:id
 * Get resident by ID (UUID)
 * Roles: All authenticated users
 */
router.get(
  "/:id",
  validate(getResidentByIdValidator),
  residentController.getResidentById
);

/**
 * PUT /api/residents/:id
 * PATCH /api/residents/:id
 * Update resident (partial update supported)
 * Roles: All authenticated users
 * Content-Type: multipart/form-data (if photo is included) OR application/json
 * Body:
 *   - residentData: JSON string with resident fields (resident_fields.json format) - all fields optional
 *   - resident_photo: (optional) Image file (JPEG, PNG, GIF, WebP, max 10MB)
 *   - tenantId: (optional for SUPER_ADMIN) Tenant ID
 *
 * Note: If photo is provided, use multipart/form-data. Otherwise, JSON is fine.
 * STAFF/GUARDIAN can only update residents they created
 * ADMIN/SUPER_ADMIN can update any resident in their tenant(s)
 */
router.put(
  "/:id",
  enforceTenantIsolation("tenantId"), // Validates tenantId from body if provided
  uploadPhoto.single("resident_photo"), // Optional photo upload
  // Multer error handler for photo upload
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Photo file too large. Maximum size is 10MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    next();
  },
  // Parse residentData if it's a JSON string (for multipart/form-data)
  (req, res, next) => {
    // If residentData is a string, parse it and merge into body for validation
    if (req.body.residentData && typeof req.body.residentData === "string") {
      try {
        const parsedData = JSON.parse(req.body.residentData);
        req.body = { ...req.body, ...parsedData };
      } catch (e) {
        // If parsing fails, validation will catch it
      }
    }
    next();
  },
  validate(updateResidentValidator),
  residentController.updateResident
);

router.patch(
  "/:id",
  enforceTenantIsolation("tenantId"), // Validates tenantId from body if provided
  uploadPhoto.single("resident_photo"), // Optional photo upload
  // Multer error handler for photo upload
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          message: "Photo file too large. Maximum size is 10MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: `Photo upload error: ${err.message}`,
      });
    }
    next();
  },
  // Parse residentData if it's a JSON string (for multipart/form-data)
  (req, res, next) => {
    // If residentData is a string, parse it and merge into body for validation
    if (req.body.residentData && typeof req.body.residentData === "string") {
      try {
        const parsedData = JSON.parse(req.body.residentData);
        req.body = { ...req.body, ...parsedData };
      } catch (e) {
        // If parsing fails, validation will catch it
      }
    }
    next();
  },
  validate(updateResidentValidator),
  residentController.updateResident
);

/**
 * DELETE /api/residents/:id
 * Delete resident (soft delete - preserves record for compliance)
 * Only administrators (403 for others)
 */
router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(getResidentByIdValidator),
  residentController.deleteResident
);

/**
 * PATCH /api/residents/:residentId/tier
 * Assign billing tier to resident
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 * Note: Automatically generates pro-rated invoice from start date to end of current month
 */
router.patch(
  "/:residentId/tier",
  enforceTenantIsolation("tenantId"),
  validate(assignTierToResidentValidator),
  residentController.assignTierToResident
);

/**
 * PATCH /api/residents/:residentId/tier/end
 * End current billing tier assignment for resident
 * Roles: ADMIN, SUPER_ADMIN, STAFF
 */
router.patch(
  "/:residentId/tier/end",
  enforceTenantIsolation("tenantId"),
  validate(updateResidentTierValidator),
  residentController.updateResidentTier
);

/**
 * GET /api/residents/:residentId/billing
 * Get resident billing information
 * Roles: All authenticated users
 */
router.get(
  "/:residentId/billing",
  enforceTenantIsolation("tenantId"),
  validate(residentIdValidator),
  residentController.getResidentBilling
);

module.exports = router;
