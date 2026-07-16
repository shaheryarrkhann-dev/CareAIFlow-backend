const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const validate = require("../../middlewares/validate.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const dashboardController = require("../../controllers/dashboard/dashboard.controller");
const { getHomeDashboardValidator } = require("../../validators/dashboard.validators");

router.use(authenticate());

router.get(
  "/home",
  enforceTenantIsolation("tenantId"),
  validate(getHomeDashboardValidator),
  dashboardController.getHomeDashboard
);

module.exports = router;
