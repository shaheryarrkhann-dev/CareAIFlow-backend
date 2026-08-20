const express = require("express");
const router = express.Router();
const multer = require("multer");

const facilityController = require("../../controllers/facility/facility.controller");
const facilityFolderController = require("../../controllers/facility/facility-folder.controller");
const facilityDocumentController = require("../../controllers/facility/facility-document.controller");
const evacuationDrillController = require("../../controllers/facility/evacuation-drill.controller");
const visitorLogController = require("../../controllers/facility/visitor-log.controller");
const facilityQrController = require("../../controllers/facility/facility-qr.controller");
const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const {
  attachTenantContext,
  enforceTenantIsolation,
} = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const {
  createFacilityValidator,
  facilityIdParam,
  facilityIdOptionalValidator,
  updateFacilityProfileValidator,
  profilePhotoUploadValidator,
  bulkResidentCapacityValidator,
} = require("../../validators/facility.validators");
const {
  createFolderValidator,
  updateFolderValidator,
  folderIdParam,
} = require("../../validators/facility-folder.validators");
const {
  documentIdParam,
  listDocumentsValidator,
  updateDocumentValidator,
} = require("../../validators/facility-document.validators");
const {
  createDrillValidator,
  completeDrillValidator,
  drillIdParam,
} = require("../../validators/evacuation-drill.validators");
const {
  listVisitorsValidator,
  checkInValidator,
  exportVisitorValidator,
  checkOutValidator,
  linkResidentValidator,
} = require("../../validators/visitor-log.validators");
const { requireFacilityFolderAdmin } = require("../../middlewares/facility-folder-admin.middleware");
const {
  facilityIdQueryValidator,
  updateCustomizationValidator,
  logoUploadValidator,
} = require("../../validators/facility-qr.validators");

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes((file.mimetype || "").toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Logo must be JPEG, PNG, GIF, or WebP"));
    }
  },
});

const uploadProfilePhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes((file.mimetype || "").toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error("Photo must be JPEG, PNG, GIF, or WebP"));
    }
  },
});

// All facility routes require authentication and FACILITY:view (aligned with frontend Facility section)
router.use(authenticate());
router.use(attachTenantContext);
router.use(requirePermission("FACILITY", "view"));

/**
 * GET /api/facility/facilities
 * List all facilities for current tenant
 */
router.get(
  "/facilities",
  enforceTenantIsolation("tenantId"),
  facilityController.listFacilities
);

/**
 * GET /api/facility/facilities/all-mine
 * List facilities across all tenants the user can access (for facility/tenant switcher).
 */
router.get(
  "/facilities/all-mine",
  facilityController.listAllMyFacilities
);

/**
 * PUT /api/facility/facilities/bulk-resident-capacity
 * Super Admin: set active resident limit (6|7|8) for selected or all facilities in an org.
 * Must be registered before /facilities/:id.
 */
router.put(
  "/facilities/bulk-resident-capacity",
  requirePermission("FACILITY", "update"),
  validate(bulkResidentCapacityValidator),
  facilityController.bulkSetResidentCapacityLimit
);

/**
 * POST /api/facility/facilities
 * Create a new facility for current tenant
 * Roles: ADMIN, SUPER_ADMIN
 */
router.post(
  "/facilities",
  enforceTenantIsolation("tenantId"),
  validate(createFacilityValidator),
  facilityController.createFacility
);

/**
 * POST /api/facility/facilities/independent
 * Create a completely independent account (new Tenant + one Facility); link user to that tenant.
 * Only shared element is login. Requires FACILITY:create.
 */
router.post(
  "/facilities/independent",
  requirePermission("FACILITY", "create"),
  validate(createFacilityValidator),
  facilityController.createIndependentFacility
);

/**
 * GET /api/facility/facilities/:id
 * Get a single facility by ID (must belong to tenant)
 * Roles: ADMIN, STAFF, SUPER_ADMIN
 */
router.get(
  "/facilities/:id",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdParam),
  facilityController.getFacility
);

/**
 * PUT /api/facility/facilities/:id
 * Update a facility (must belong to tenant)
 * Roles: ADMIN, SUPER_ADMIN
 */
router.put(
  "/facilities/:id",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdParam),
  validate(updateFacilityProfileValidator),
  facilityController.updateFacility
);

/**
 * DELETE /api/facility/facilities/:id
 * Delete a facility (must belong to tenant)
 * Roles: ADMIN, SUPER_ADMIN
 */
router.delete(
  "/facilities/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(facilityIdParam),
  facilityController.deleteFacility
);

/**
 * GET /api/facility/profile
 * Get facility profile for current tenant
 * Roles: ADMIN, STAFF (with tenantId), SUPER_ADMIN (with tenantId in query)
 */
router.get(
  "/profile",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdOptionalValidator),
  facilityController.getFacilityProfile
);

/**
 * PUT /api/facility/profile
 * Update facility profile
 * Roles: ADMIN, STAFF, SUPER_ADMIN
 */
router.put(
  "/profile",
  enforceTenantIsolation("tenantId"),
  validate([...facilityIdOptionalValidator, ...updateFacilityProfileValidator]),
  facilityController.updateFacilityProfile
);

router.post(
  "/profile/photo-upload",
  enforceTenantIsolation("tenantId"),
  uploadProfilePhoto.single("file"),
  validate(profilePhotoUploadValidator),
  facilityController.uploadFacilityProfilePhoto
);

/**
 * GET /api/facility/audit-history
 * Get facility-specific audit logs (profile, folders, documents, drills, visitors)
 * Query: action, resource, startDate, endDate, page, limit
 * Roles: ADMIN, STAFF, SUPER_ADMIN
 */
router.get(
  "/audit-history",
  enforceTenantIsolation("tenantId"),
  facilityController.getFacilityAuditHistory
);

// Folders — GET /folders/:folderId/contents must come before /folders/:id
router.get(
  "/folders",
  enforceTenantIsolation("tenantId"),
  facilityFolderController.getFolders
);
router.get(
  "/folders/:folderId/contents",
  enforceTenantIsolation("tenantId"),
  facilityFolderController.getFolderContents
);
router.post(
  "/folders",
  enforceTenantIsolation("tenantId"),
  requireFacilityFolderAdmin,
  validate(createFolderValidator),
  facilityFolderController.createFolder
);
router.put(
  "/folders/:id",
  enforceTenantIsolation("tenantId"),
  requireFacilityFolderAdmin,
  validate(updateFolderValidator),
  facilityFolderController.updateFolder
);
router.delete(
  "/folders/:id",
  enforceTenantIsolation("tenantId"),
  requireFacilityFolderAdmin,
  validate(folderIdParam),
  facilityFolderController.deleteFolder
);

// Documents - upload route must come before :id
router.get(
  "/documents",
  enforceTenantIsolation("tenantId"),
  validate(listDocumentsValidator),
  facilityDocumentController.listDocuments
);
router.post(
  "/documents/upload",
  enforceTenantIsolation("tenantId"),
  uploadDoc.single("file"),
  (err, req, res, next) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "File too large. Maximum size is 50MB.",
      });
    }
    next(err);
  },
  facilityDocumentController.uploadDocument
);
router.get(
  "/documents/:id/download",
  enforceTenantIsolation("tenantId"),
  validate(documentIdParam),
  facilityDocumentController.downloadDocument
);
router.get(
  "/documents/:id/view-url",
  enforceTenantIsolation("tenantId"),
  validate(documentIdParam),
  facilityDocumentController.getViewUrl
);
router.patch(
  "/documents/:id",
  enforceTenantIsolation("tenantId"),
  validate(updateDocumentValidator),
  facilityDocumentController.updateDocument
);
router.delete(
  "/documents/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(documentIdParam),
  facilityDocumentController.deleteDocument
);

// Evacuation drills - /compliance and /alerts must come before /:id
router.get(
  "/drills/compliance",
  enforceTenantIsolation("tenantId"),
  evacuationDrillController.getComplianceStatus
);
router.get(
  "/drills/alerts",
  enforceTenantIsolation("tenantId"),
  evacuationDrillController.getDrillAlerts
);
router.get(
  "/drills",
  enforceTenantIsolation("tenantId"),
  evacuationDrillController.listDrills
);
router.post(
  "/drills",
  enforceTenantIsolation("tenantId"),
  validate(createDrillValidator),
  evacuationDrillController.createDrill
);
router.patch(
  "/drills/:id/complete",
  enforceTenantIsolation("tenantId"),
  validate(completeDrillValidator),
  evacuationDrillController.completeDrill
);
router.delete(
  "/drills/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(drillIdParam),
  evacuationDrillController.deleteDrill
);

// Visitor QR (must come before /visitors/:id)
router.get(
  "/visitor-qr/config",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdQueryValidator),
  facilityQrController.getConfig
);
router.post(
  "/visitor-qr/regenerate",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdQueryValidator),
  facilityQrController.regenerateToken
);
router.put(
  "/visitor-qr/config",
  enforceTenantIsolation("tenantId"),
  validate(updateCustomizationValidator),
  facilityQrController.updateCustomization
);
router.get(
  "/visitor-qr/print-data",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdQueryValidator),
  facilityQrController.getPrintData
);
router.get(
  "/visitor-qr/print-pdf",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdQueryValidator),
  facilityQrController.getPrintPdf
);
router.get(
  "/visitor-qr/qr-image",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdQueryValidator),
  facilityQrController.getQrImage
);
router.post(
  "/visitor-qr/logo-upload",
  enforceTenantIsolation("tenantId"),
  uploadLogo.single("file"),
  validate(logoUploadValidator),
  facilityQrController.uploadLogo
);
router.get(
  "/visitor-qr/logo",
  enforceTenantIsolation("tenantId"),
  validate(facilityIdQueryValidator),
  facilityQrController.getLogo
);

// Visitor log - /export must come before /:id
router.get(
  "/visitors",
  enforceTenantIsolation("tenantId"),
  validate(listVisitorsValidator),
  visitorLogController.listVisitors
);
router.post(
  "/visitors/check-in",
  enforceTenantIsolation("tenantId"),
  validate(checkInValidator),
  visitorLogController.checkIn
);
router.get(
  "/visitors/export",
  enforceTenantIsolation("tenantId"),
  validate(exportVisitorValidator),
  visitorLogController.exportVisitors
);
router.patch(
  "/visitors/:id/check-out",
  enforceTenantIsolation("tenantId"),
  validate(checkOutValidator),
  visitorLogController.checkOut
);
router.patch(
  "/visitors/:id/link-resident",
  enforceTenantIsolation("tenantId"),
  validate(linkResidentValidator),
  visitorLogController.linkResident
);

module.exports = router;
