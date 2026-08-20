const express = require("express");
const router = express.Router();
const multer = require("multer");

const staffMemberController = require("../../controllers/staff/staff-member.controller");
const staffFolderController = require("../../controllers/staff/staff-folder.controller");
const staffDocumentController = require("../../controllers/staff/staff-document.controller");
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
  createStaffMemberValidator,
  staffIdParam,
  facilityIdParam,
  listStaffValidator,
  assignFacilityValidator,
  updateStaffProfileValidator,
} = require("../../validators/staff.validators");
const {
  staffIdParam: staffIdParamNested,
  folderIdParam,
  createFolderValidator,
  updateFolderValidator,
} = require("../../validators/staff-folder.validators");
const {
  documentIdParam,
  listDocumentsValidator,
} = require("../../validators/staff-document.validators");
const {
  assertOwnStaffMemberOrAdmin,
  requireStaffDocumentsAdmin,
} = require("../../middlewares/staff-self-access.middleware");

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadStaffProfilePhoto = multer({
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

// All staff routes require authentication and STAFF:view (aligned with frontend Staff section)
router.use(authenticate());
router.use(attachTenantContext);
router.use(requirePermission("STAFF", "view"));

/**
 * GET /api/staff/available-users
 * Get Users with role STAFF not yet StaffMembers (for create dropdown)
 * Must come before /:id
 */
router.get(
  "/available-users",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  staffMemberController.getAvailableStaffUsers
);

/**
 * GET /api/staff/compliance-summary
 * List all staff with compliance status for dashboard
 * Must come before /:id
 */
router.get(
  "/compliance-summary",
  enforceTenantIsolation("tenantId"),
  staffDocumentController.getComplianceSummary
);

/**
 * GET /api/staff/alerts
 * Get staff document alerts (expired / expiring soon) for current tenant
 * Must come before /:id
 */
router.get(
  "/alerts",
  enforceTenantIsolation("tenantId"),
  staffDocumentController.getStaffAlerts
);

/**
 * GET /api/staff/audit-history
 * Get staff document audit logs for current tenant
 * Must come before /:id
 */
router.get(
  "/audit-history",
  enforceTenantIsolation("tenantId"),
  staffMemberController.getStaffAuditHistory
);

/**
 * GET /api/staff
 * List staff members (paginated)
 */
router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(listStaffValidator),
  staffMemberController.listStaffMembers
);

/**
 * POST /api/staff
 * Create staff member (link User with role STAFF to document management)
 */
router.post(
  "/",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  validate(createStaffMemberValidator),
  staffMemberController.createStaffMember
);

/**
 * PATCH /api/staff/:id/profile
 * Update employee profile (admin only)
 */
router.patch(
  "/:id/profile",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  validate([...staffIdParam, ...updateStaffProfileValidator]),
  staffMemberController.updateStaffProfile
);

/**
 * POST /api/staff/:id/profile-photo
 * Upload employee profile photo (admin only)
 */
router.post(
  "/:id/profile-photo",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  uploadStaffProfilePhoto.single("file"),
  (err, req, res, next) => {
    if (err && err.message && String(err.message).includes("Photo must be")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  },
  validate(staffIdParam),
  staffMemberController.uploadStaffProfilePhoto
);

/**
 * GET /api/staff/:id
 * Get staff member by ID
 */
router.get(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(staffIdParam),
  assertOwnStaffMemberOrAdmin("id"),
  staffMemberController.getStaffMember
);

/**
 * DELETE /api/staff/:id
 * Delete staff member (ADMIN / SUPER_ADMIN only)
 */
router.delete(
  "/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate(staffIdParam),
  staffMemberController.deleteStaffMember
);

/**
 * POST /api/staff/:id/facilities
 * Assign staff to facility
 */
router.post(
  "/:id/facilities",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  validate([...staffIdParam, ...assignFacilityValidator]),
  staffMemberController.assignFacility
);

/**
 * DELETE /api/staff/:id/facilities/:facilityId
 * Unassign staff from facility
 */
router.delete(
  "/:id/facilities/:facilityId",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  validate([...staffIdParam, ...facilityIdParam]),
  staffMemberController.unassignFacility
);

// Nested routes - use :staffId for clarity (same as :id)
// Folders
router.get(
  "/:staffId/folders",
  enforceTenantIsolation("tenantId"),
  validate(staffIdParamNested),
  assertOwnStaffMemberOrAdmin("staffId"),
  staffFolderController.getFolders
);
router.get(
  "/:staffId/folders/:id/contents",
  enforceTenantIsolation("tenantId"),
  validate([...staffIdParamNested, ...folderIdParam]),
  assertOwnStaffMemberOrAdmin("staffId"),
  staffFolderController.getFolderContents
);
router.post(
  "/:staffId/folders",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  validate([...staffIdParamNested, ...createFolderValidator]),
  staffFolderController.createFolder
);
router.put(
  "/:staffId/folders/:id",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  validate([...staffIdParamNested, ...folderIdParam, ...updateFolderValidator]),
  staffFolderController.updateFolder
);
router.delete(
  "/:staffId/folders/:id",
  enforceTenantIsolation("tenantId"),
  requireStaffDocumentsAdmin,
  validate([...staffIdParamNested, ...folderIdParam]),
  staffFolderController.deleteFolder
);

// Documents - upload before :id
router.get(
  "/:staffId/documents",
  enforceTenantIsolation("tenantId"),
  validate([...staffIdParamNested, ...listDocumentsValidator]),
  assertOwnStaffMemberOrAdmin("staffId"),
  staffDocumentController.listDocuments
);
router.post(
  "/:staffId/documents/upload",
  enforceTenantIsolation("tenantId"),
  validate(staffIdParamNested),
  assertOwnStaffMemberOrAdmin("staffId"),
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
  staffDocumentController.uploadDocument
);
router.get(
  "/:staffId/documents/:id/download",
  enforceTenantIsolation("tenantId"),
  validate([...staffIdParamNested, ...documentIdParam]),
  assertOwnStaffMemberOrAdmin("staffId"),
  staffDocumentController.downloadDocument
);
router.get(
  "/:staffId/documents/:id/view-url",
  enforceTenantIsolation("tenantId"),
  validate([...staffIdParamNested, ...documentIdParam]),
  assertOwnStaffMemberOrAdmin("staffId"),
  staffDocumentController.getViewUrl
);
router.delete(
  "/:staffId/documents/:id",
  enforceTenantIsolation("tenantId"),
  requireAdminOrSuperAdminForDelete(),
  validate([...staffIdParamNested, ...documentIdParam]),
  assertOwnStaffMemberOrAdmin("staffId"),
  staffDocumentController.deleteDocument
);

// Compliance
router.get(
  "/:staffId/compliance",
  enforceTenantIsolation("tenantId"),
  validate(staffIdParamNested),
  assertOwnStaffMemberOrAdmin("staffId"),
  staffDocumentController.getComplianceStatus
);

module.exports = router;
