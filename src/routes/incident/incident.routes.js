const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const incidentController = require("../../controllers/incident/incident.controller");
const {
  createIncidentReportValidator,
  updateIncidentReportValidator,
  listIncidentReportsValidator,
  incidentReportIdValidator,
} = require("../../validators/incident.validators");

router.use(authenticate());
router.use(requirePermission("INCIDENT_REPORTS", "view"));

router.post(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(createIncidentReportValidator),
  incidentController.create,
);

router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(listIncidentReportsValidator),
  incidentController.list,
);

router.get(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(incidentReportIdValidator),
  incidentController.getById,
);

router.patch(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate([...incidentReportIdValidator, ...updateIncidentReportValidator]),
  incidentController.update,
);

router.delete(
  "/:id",
  enforceTenantIsolation("tenantId"),
  validate(incidentReportIdValidator),
  incidentController.remove,
);

module.exports = router;
