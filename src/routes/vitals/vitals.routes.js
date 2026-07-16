const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const vitalsController = require("../../controllers/vitals/vitals.controller");
const {
  recordVitalsValidator,
  updateVitalsValidator,
  getVitalsValidator,
  getVitalsTrendsValidator,
  vitalsIdValidator,
} = require("../../validators/vitals.validators");

// All routes require authentication and EMAR:view (aligned with frontend eMAR Vitals)
router.use(authenticate());
router.use(requirePermission("EMAR", "view"));

router.post(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(recordVitalsValidator),
  vitalsController.record
);

router.get(
  "/trends",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getVitalsTrendsValidator),
  vitalsController.getTrends
);

router.get(
  "/",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getVitalsValidator),
  vitalsController.list
);

router.get("/:id", validate(vitalsIdValidator), vitalsController.getById);

router.put("/:id", validate(updateVitalsValidator), vitalsController.update);

router.delete(
  "/:id",
  requireAdminOrSuperAdminForDelete(),
  validate(vitalsIdValidator),
  vitalsController.delete
);

module.exports = router;
