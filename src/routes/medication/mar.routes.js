const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const marController = require("../../controllers/medication/mar.controller");
const {
  recordDoseValidator,
  updateMarRecordValidator,
  getMarRecordsValidator,
  marRecordIdValidator,
  getSchedulesValidator,
} = require("../../validators/mar.validators");

// All routes require authentication and EMAR:view (aligned with frontend eMAR)
router.use(authenticate());
router.use(requirePermission("EMAR", "view"));

router.post(
  "/record",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(recordDoseValidator),
  marController.recordDose
);

router.get(
  "/records",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getMarRecordsValidator),
  marController.getMarRecords
);

router.get(
  "/records/:id",
  validate(marRecordIdValidator),
  marController.getMarRecordById
);

router.put(
  "/records/:id",
  validate(updateMarRecordValidator),
  marController.updateMarRecord
);

/**
 * DELETE /api/mar/records/:id
 * Delete MAR record
 * Roles: ADMIN, SUPER_ADMIN only
 */
router.delete(
  "/records/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(marRecordIdValidator),
  marController.deleteMarRecord
);

router.post(
  "/records/:id/lock",
  validate(marRecordIdValidator),
  marController.lockMarRecord
);

router.post(
  "/records/:id/unlock",
  validate(marRecordIdValidator),
  marController.unlockMarRecord
);

router.get(
  "/schedules",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getSchedulesValidator),
  marController.getSchedules
);

router.post(
  "/sync-schedules",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  marController.syncSchedules
);

module.exports = router;
