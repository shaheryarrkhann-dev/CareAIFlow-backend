const { body, param, query } = require("express-validator");

/**
 * Record dose validation
 */
const recordDoseValidator = [
  body("medicationId")
    .trim()
    .notEmpty()
    .withMessage("medicationId is required")
    .isUUID()
    .withMessage("medicationId must be a valid UUID"),
  body("residentId").trim().notEmpty().withMessage("residentId is required"),
  body("administeredAt")
    .notEmpty()
    .withMessage("administeredAt is required")
    .isISO8601()
    .withMessage("administeredAt must be a valid ISO 8601 date"),
  body("scheduledTime")
    .optional()
    .isISO8601()
    .withMessage("scheduledTime must be a valid ISO 8601 date"),
  body("status")
    .trim()
    .notEmpty()
    .withMessage("status is required")
    .isIn(["Given", "NotGiven", "Refused"])
    .withMessage("status must be one of: Given, NotGiven, Refused"),
  body("notGivenReason")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("notGivenReason must not exceed 1000 characters")
    .custom((value, { req }) => {
      // If status is NotGiven, reason is required
      if (req.body.status === "NotGiven" && (!value || value.trim().length === 0)) {
        throw new Error("notGivenReason is required when status is 'NotGiven'");
      }
      return true;
    }),
  body("refusedReason")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("refusedReason must not exceed 1000 characters")
    .custom((value, { req }) => {
      // If status is Refused, reason is required
      if (req.body.status === "Refused" && (!value || value.trim().length === 0)) {
        throw new Error("refusedReason is required when status is 'Refused'");
      }
      return true;
    }),
  body("signature")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("signature must not exceed 10000 characters"),
  body("signatureType")
    .optional()
    .trim()
    .isIn(["drawing", "typed", "stored"])
    .withMessage("signatureType must be one of: drawing, typed, stored"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
  body("residentResponse")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("residentResponse must not exceed 5000 characters"),
  body("vitalsId")
    .optional()
    .isUUID()
    .withMessage("vitalsId must be a valid UUID"),
  body("vitals")
    .optional()
    .isObject()
    .withMessage("vitals must be an object")
    .custom((value) => {
      // Validate vitals object structure
      if (value && typeof value === "object") {
        // At least one vital should be provided
        const hasVital =
          value.temperature !== undefined ||
          value.pulse !== undefined ||
          value.bloodPressureSystolic !== undefined ||
          value.bloodPressureDiastolic !== undefined ||
          value.oxygenSaturation !== undefined ||
          value.weight !== undefined;
        if (!hasVital) {
          throw new Error(
            "At least one vital sign must be provided in vitals object"
          );
        }
      }
      return true;
    }),
  body("vitals.temperature")
    .optional()
    .isFloat({ min: 90, max: 110 })
    .withMessage("Temperature (Fahrenheit) must be between 90 and 110"),
  body("vitals.temperatureUnit")
    .optional()
    .trim()
    .isIn(["F", "C"])
    .withMessage("temperatureUnit must be 'F' or 'C'"),
  body("vitals.bloodPressureSystolic")
    .optional()
    .isInt({ min: 50, max: 250 })
    .withMessage("Systolic blood pressure must be between 50 and 250"),
  body("vitals.bloodPressureDiastolic")
    .optional()
    .isInt({ min: 30, max: 150 })
    .withMessage("Diastolic blood pressure must be between 30 and 150"),
  body("vitals.pulse")
    .optional()
    .isInt({ min: 30, max: 200 })
    .withMessage("Pulse must be between 30 and 200"),
  body("vitals.oxygenSaturation")
    .optional()
    .isInt({ min: 70, max: 100 })
    .withMessage("Oxygen saturation must be between 70 and 100"),
  body("vitals.weight")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Weight must be positive"),
  body("vitals.weightUnit")
    .optional()
    .trim()
    .isIn(["lbs", "kg"])
    .withMessage("weightUnit must be 'lbs' or 'kg'"),
  body("vitals.recordedAt")
    .optional()
    .isISO8601()
    .withMessage("vitals.recordedAt must be a valid ISO 8601 date"),
  body("vitals.notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("vitals.notes must not exceed 5000 characters"),
  body("scheduleId")
    .optional()
    .isUUID()
    .withMessage("scheduleId must be a valid UUID"),
];

/**
 * Update MAR record validation
 */
const updateMarRecordValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("MAR record ID is required")
    .isUUID()
    .withMessage("MAR record ID must be a valid UUID"),
  body("administeredAt")
    .optional()
    .isISO8601()
    .withMessage("administeredAt must be a valid ISO 8601 date"),
  body("scheduledTime")
    .optional()
    .isISO8601()
    .withMessage("scheduledTime must be a valid ISO 8601 date"),
  body("status")
    .optional()
    .trim()
    .isIn(["Given", "NotGiven", "Refused"])
    .withMessage("status must be one of: Given, NotGiven, Refused"),
  body("notGivenReason")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("notGivenReason must not exceed 1000 characters")
    .custom((value, { req }) => {
      // If status is being updated to NotGiven, reason is required
      if (req.body.status === "NotGiven" && (!value || value.trim().length === 0)) {
        throw new Error("notGivenReason is required when status is 'NotGiven'");
      }
      return true;
    }),
  body("refusedReason")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("refusedReason must not exceed 1000 characters")
    .custom((value, { req }) => {
      // If status is being updated to Refused, reason is required
      if (req.body.status === "Refused" && (!value || value.trim().length === 0)) {
        throw new Error("refusedReason is required when status is 'Refused'");
      }
      return true;
    }),
  body("signature")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("signature must not exceed 10000 characters"),
  body("signatureType")
    .optional()
    .trim()
    .isIn(["drawing", "typed", "stored"])
    .withMessage("signatureType must be one of: drawing, typed, stored"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
  body("residentResponse")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("residentResponse must not exceed 5000 characters"),
  body("vitalsId")
    .optional()
    .isUUID()
    .withMessage("vitalsId must be a valid UUID"),
];

/**
 * Get MAR records query validation
 */
const getMarRecordsValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("medicationId")
    .optional()
    .isUUID()
    .withMessage("medicationId must be a valid UUID"),
  query("status")
    .optional()
    .trim()
    .custom((value) => {
      const validStatuses = [
        "Given",
        "NotGiven",
        "Refused",
        "GIVEN",
        "NOTGIVEN",
        "NOT_GIVEN",
        "REFUSED",
        // Legacy statuses for backward compatibility
        "Missed",
        "Late",
        "Skipped",
        "Hold",
        "MISSED",
        "LATE",
        "SKIPPED",
        "HOLD",
        "HELD",
      ];
      return validStatuses.includes(value);
    })
    .withMessage(
      "status must be one of: Given, NotGiven, Refused (case-insensitive)"
    ),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * MAR record ID param validation
 */
const marRecordIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("MAR record ID is required")
    .isUUID()
    .withMessage("MAR record ID must be a valid UUID"),
];

/**
 * Get schedules for medication query validation
 */
const getSchedulesValidator = [
  query("medicationId")
    .trim()
    .notEmpty()
    .withMessage("medicationId is required")
    .isUUID()
    .withMessage("medicationId must be a valid UUID"),
  query("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  query("date")
    .trim()
    .notEmpty()
    .withMessage("date is required")
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date (YYYY-MM-DD)"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

module.exports = {
  recordDoseValidator,
  updateMarRecordValidator,
  getMarRecordsValidator,
  marRecordIdValidator,
  getSchedulesValidator,
};
