const express = require("express");
const router = express.Router();

const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { enforceTenantIsolation } = require("../../middlewares/tenant.middleware");
const validate = require("../../middlewares/validate.middleware");
const appointmentController = require("../../controllers/appointment/appointment.controller");
const {
  createAppointmentValidator,
  updateAppointmentValidator,
  listAppointmentsValidator,
  calendarValidator,
  exportAppointmentsValidator,
  appointmentIdValidator,
  listNotificationsValidator,
  notificationIdValidator,
} = require("../../validators/appointment.validators");

router.use(authenticate());
router.use(requirePermission("APPOINTMENTS", "view"));

router.get(
  "/notifications",
  validate(listNotificationsValidator),
  appointmentController.listNotifications
);

router.patch(
  "/notifications/:id/read",
  validate(notificationIdValidator),
  appointmentController.markNotificationReadHandler
);

router.get(
  "/calendar",
  enforceTenantIsolation("tenantId"),
  validate(calendarValidator),
  appointmentController.calendar
);

router.get(
  "/export",
  enforceTenantIsolation("tenantId"),
  validate(exportAppointmentsValidator),
  appointmentController.export
);

router.post(
  "/",
  enforceTenantIsolation("tenantId"),
  requirePermission("APPOINTMENTS", "create"),
  validate(createAppointmentValidator),
  appointmentController.create
);

router.get(
  "/",
  enforceTenantIsolation("tenantId"),
  validate(listAppointmentsValidator),
  appointmentController.list
);

router.get(
  "/:id",
  validate(appointmentIdValidator),
  appointmentController.getById
);

router.put(
  "/:id",
  requirePermission("APPOINTMENTS", "update"),
  validate(updateAppointmentValidator),
  appointmentController.update
);

router.delete(
  "/:id",
  requirePermission("APPOINTMENTS", "delete"),
  validate(appointmentIdValidator),
  appointmentController.remove
);

module.exports = router;
