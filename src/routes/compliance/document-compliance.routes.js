/**
 * Document compliance folder catalogs & monitoring (Phase 1–2).
 * Distinct from /api/compliance (WAC/RCW form regulation).
 */
const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const documentComplianceController = require("../../controllers/compliance/document-compliance.controller");

router.use(authenticate());
router.use(
  require("../../middlewares/plan-entitlement.middleware").requirePlanModule(
    "expandedCompliance",
  ),
);

router.get("/catalog", documentComplianceController.getCatalog);

/** Any authenticated tenant user (aggregates residents, staff, facilities). */
router.get("/dashboard", documentComplianceController.getDashboard);

router.get("/dashboard/export", documentComplianceController.exportDashboard);

router.get("/notifications", documentComplianceController.getNotifications);

router.patch(
  "/notifications/:id/read",
  documentComplianceController.markNotificationAsRead
);

router.get("/audit-logs", documentComplianceController.getAuditLogs);

router.get("/settings", documentComplianceController.getComplianceSettings);
router.put("/settings", documentComplianceController.updateComplianceSettings);
router.post("/refresh-cache", documentComplianceController.refreshCache);
router.post("/trigger-digest", documentComplianceController.triggerDigest);
router.post("/trigger-digest-all", documentComplianceController.triggerDigestAll);

router.get(
  "/residents/:residentId",
  requirePermission("RESIDENTS", "view"),
  documentComplianceController.getResidentStatus
);

router.get(
  "/staff/:staffId",
  requirePermission("STAFF", "view"),
  documentComplianceController.getStaffStatus
);

router.get(
  "/facility",
  requirePermission("FACILITY", "view"),
  documentComplianceController.getFacilityStatus
);

module.exports = router;
