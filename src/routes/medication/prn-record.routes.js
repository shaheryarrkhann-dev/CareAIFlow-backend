const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const prnController = require("../../controllers/medication/prn-record.controller");
const {
  recordPrnValidator,
  recordPrnResponseValidator,
  getPrnRecordsValidator,
  getPendingFollowupsValidator,
  prnRecordIdValidator,
} = require("../../validators/prn-record.validators");

// All routes require authentication and EMAR:view (aligned with frontend eMAR)
router.use(authenticate());
router.use(requirePermission("EMAR", "view"));

router.post(
  "/record",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(recordPrnValidator),
  prnController.recordPrnDose
);

router.get(
  "/pending-followups",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getPendingFollowupsValidator),
  prnController.getPendingFollowups
);

router.get(
  "/records",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getPrnRecordsValidator),
  prnController.getPrnRecords
);

router.get(
  "/records/:id",
  validate(prnRecordIdValidator),
  prnController.getPrnRecordById
);

router.put(
  "/records/:id/response",
  validate(recordPrnResponseValidator),
  prnController.recordPrnResponse
);

router.post(
  "/records/:id/notify-physician",
  validate(prnRecordIdValidator),
  prnController.notifyPhysician
);

module.exports = router;
