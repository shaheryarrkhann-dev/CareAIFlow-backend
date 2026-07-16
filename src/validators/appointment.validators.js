const { body, param, query } = require("express-validator");

const APPOINTMENT_TYPES = ["MEDICAL", "THERAPY", "INSPECTION", "INTERNAL_OTHER"];
const APPOINTMENT_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"];

/**
 * Create appointment validation
 * At least one of residentId, staffId, facilityId is required
 */
const createAppointmentValidator = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("title is required")
    .isLength({ max: 500 })
    .withMessage("title must not exceed 500 characters"),
  body("scheduledAt")
    .notEmpty()
    .withMessage("scheduledAt is required")
    .isISO8601()
    .withMessage("scheduledAt must be a valid ISO 8601 date-time"),
  body("durationMinutes")
    .optional()
    .isInt({ min: 15, max: 60 })
    .withMessage("durationMinutes must be 15, 30, 45, or 60")
    .isIn([15, 30, 45, 60])
    .withMessage("durationMinutes must be one of: 15, 30, 45, 60"),
  body("appointmentType")
    .trim()
    .notEmpty()
    .withMessage("appointmentType is required")
    .isIn(APPOINTMENT_TYPES)
    .withMessage(`appointmentType must be one of: ${APPOINTMENT_TYPES.join(", ")}`),
  body("residentId").optional().trim().isUUID().withMessage("residentId must be a valid UUID"),
  body("staffId").optional().trim().isUUID().withMessage("staffId must be a valid UUID"),
  body("facilityId").optional().trim().isUUID().withMessage("facilityId must be a valid UUID"),
  body("location")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("location must not exceed 500 characters"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("notes must not exceed 10000 characters"),
  body("reminderMinutesBefore")
    .optional()
    .isArray()
    .withMessage("reminderMinutesBefore must be an array"),
  body("reminderMinutesBefore.*")
    .optional()
    .isInt({ min: 0 })
    .withMessage("each reminderMinutesBefore value must be a non-negative integer"),
  body("status")
    .optional()
    .trim()
    .isIn(APPOINTMENT_STATUSES)
    .withMessage(`status must be one of: ${APPOINTMENT_STATUSES.join(", ")}`),
  body()
    .custom((value, { req }) => {
      const { residentId, staffId, facilityId } = req.body || {};
      const hasLink = [residentId, staffId, facilityId].some(
        (v) => v != null && String(v).trim() !== ""
      );
      if (!hasLink) {
        throw new Error("At least one of residentId, staffId, or facilityId is required");
      }
      return true;
    }),
];

/**
 * Update appointment validation - all fields optional
 */
const updateAppointmentValidator = [
  param("id").trim().notEmpty().withMessage("Appointment ID is required"),
  body("title")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("title cannot be empty")
    .isLength({ max: 500 })
    .withMessage("title must not exceed 500 characters"),
  body("scheduledAt")
    .optional()
    .isISO8601()
    .withMessage("scheduledAt must be a valid ISO 8601 date-time"),
  body("durationMinutes")
    .optional()
    .isInt({ min: 15, max: 60 })
    .withMessage("durationMinutes must be 15, 30, 45, or 60")
    .isIn([15, 30, 45, 60])
    .withMessage("durationMinutes must be one of: 15, 30, 45, 60"),
  body("appointmentType")
    .optional()
    .trim()
    .isIn(APPOINTMENT_TYPES)
    .withMessage(`appointmentType must be one of: ${APPOINTMENT_TYPES.join(", ")}`),
  body("residentId").optional({ values: "null" }).trim().isUUID().withMessage("residentId must be a valid UUID"),
  body("staffId").optional({ values: "null" }).trim().isUUID().withMessage("staffId must be a valid UUID"),
  body("facilityId").optional({ values: "null" }).trim().isUUID().withMessage("facilityId must be a valid UUID"),
  body("location")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("location must not exceed 500 characters"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("notes must not exceed 10000 characters"),
  body("reminderMinutesBefore")
    .optional()
    .isArray()
    .withMessage("reminderMinutesBefore must be an array"),
  body("reminderMinutesBefore.*")
    .optional()
    .isInt({ min: 0 })
    .withMessage("each reminderMinutesBefore value must be a non-negative integer"),
  body("status")
    .optional()
    .trim()
    .isIn(APPOINTMENT_STATUSES)
    .withMessage(`status must be one of: ${APPOINTMENT_STATUSES.join(", ")}`),
];

/**
 * List appointments query validation
 */
const listAppointmentsValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("residentId").optional().trim().isUUID().withMessage("residentId must be a valid UUID"),
  query("staffId").optional().trim().isUUID().withMessage("staffId must be a valid UUID"),
  query("facilityId").optional().trim().isUUID().withMessage("facilityId must be a valid UUID"),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
  query("type")
    .optional()
    .trim()
    .isIn(APPOINTMENT_TYPES)
    .withMessage(`type must be one of: ${APPOINTMENT_TYPES.join(", ")}`),
  query("status")
    .optional()
    .trim()
    .isIn(APPOINTMENT_STATUSES)
    .withMessage(`status must be one of: ${APPOINTMENT_STATUSES.join(", ")}`),
  query("tenantId").optional().isUUID().withMessage("tenantId must be a valid UUID"),
];

/**
 * Appointment ID param validation
 */
const appointmentIdValidator = [
  param("id").trim().notEmpty().withMessage("Appointment ID is required"),
];

/**
 * Export appointments query validation
 */
const EXPORT_FORMATS = ["csv", "pdf"];
const exportAppointmentsValidator = [
  query("dateFrom")
    .trim()
    .notEmpty()
    .withMessage("dateFrom is required for export")
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .trim()
    .notEmpty()
    .withMessage("dateTo is required for export")
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
  query("format")
    .optional()
    .trim()
    .isIn(EXPORT_FORMATS)
    .withMessage(`format must be one of: ${EXPORT_FORMATS.join(", ")}`),
  query("tenantId").optional().isUUID().withMessage("tenantId must be a valid UUID"),
];

/**
 * Calendar query validation - view (day|week|month) and date (YYYY-MM-DD)
 */
const CALENDAR_VIEWS = ["day", "week", "month"];
const calendarValidator = [
  query("view")
    .optional()
    .trim()
    .isIn(CALENDAR_VIEWS)
    .withMessage(`view must be one of: ${CALENDAR_VIEWS.join(", ")}`),
  query("date")
    .trim()
    .notEmpty()
    .withMessage("date is required for calendar (YYYY-MM-DD)")
    .isDate()
    .withMessage("date must be a valid date (YYYY-MM-DD)"),
  query("tenantId").optional().isUUID().withMessage("tenantId must be a valid UUID"),
];

/**
 * List notifications query validation
 */
const listNotificationsValidator = [
  query("unreadOnly")
    .optional()
    .isIn(["true", "false", "1", "0"])
    .withMessage("unreadOnly must be true or false"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
];

/**
 * Notification ID param (for PATCH .../notifications/:id/read)
 */
const notificationIdValidator = [
  param("id").trim().notEmpty().withMessage("Notification ID is required"),
];

module.exports = {
  createAppointmentValidator,
  updateAppointmentValidator,
  listAppointmentsValidator,
  calendarValidator,
  exportAppointmentsValidator,
  appointmentIdValidator,
  listNotificationsValidator,
  notificationIdValidator,
};
