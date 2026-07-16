const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const marGridController = require("../../controllers/medication/mar-grid.controller");
const {
  getMarGridValidator,
  getMarGridRangeValidator,
  getResidentMedicationDashboardValidator,
} = require("../../validators/mar-grid.validators");

// All routes require authentication and EMAR:view (aligned with frontend eMAR)
router.use(authenticate());
router.use(requirePermission("EMAR", "view"));

router.get(
  "/grid",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getMarGridValidator),
  marGridController.getMarGrid
);

router.get(
  "/grid/range",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getMarGridRangeValidator),
  marGridController.getMarGridRange
);

router.get(
  "/dashboard",
  enforceTenantIsolation("tenantId"), // Validates tenantId from query if provided
  validate(getResidentMedicationDashboardValidator),
  marGridController.getResidentMedicationDashboard
);

module.exports = router;
