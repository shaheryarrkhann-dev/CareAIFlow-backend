const { body, param, query } = require("express-validator");

/**
 * Record PRN dose validation
 */
const recordPrnValidator = [
  body("medicationId")
    .trim()
    .notEmpty()
    .withMessage("medicationId is required")
    .isUUID()
    .withMessage("medicationId must be a valid UUID"),
  body("residentId").trim().notEmpty().withMessage("residentId is required"),
  body("whyGiven")
    .optional()
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage("whyGiven must be between 10 and 5000 characters"),
  body("symptom")
    .optional()
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage("symptom must be between 10 and 5000 characters")
    .custom((value, { req }) => {
      // Either whyGiven or symptom must be provided
      if (!value && (!req.body.whyGiven || req.body.whyGiven.trim().length === 0)) {
        throw new Error("Either 'whyGiven' or 'symptom' is required");
      }
      return true;
    }),
  body("symptomsNoted")
    .trim()
    .notEmpty()
    .withMessage("symptomsNoted is required")
    .isLength({ min: 10, max: 5000 })
    .withMessage("symptomsNoted must be between 10 and 5000 characters"),
  body("givenAt")
    .notEmpty()
    .withMessage("givenAt is required")
    .isISO8601()
    .withMessage("givenAt must be a valid ISO 8601 date"),
  body("signature")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("signature must not exceed 10000 characters"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
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
    .withMessage("recordedAt must be a valid ISO 8601 date"),
  body("vitals.notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("vitals notes must not exceed 5000 characters"),
];

/**
 * Record PRN response validation
 */
const recordPrnResponseValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("PRN record ID is required")
    .isUUID()
    .withMessage("PRN record ID must be a valid UUID"),
  body("response")
    .optional()
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage("response must be between 10 and 5000 characters")
    .custom((value, { req }) => {
      // Either response or effectiveness must be provided
      if (!value && (!req.body.effectiveness || req.body.effectiveness.trim().length === 0)) {
        throw new Error("Either 'response' or 'effectiveness' is required for follow-up");
      }
      return true;
    }),
  body("effectiveness")
    .optional()
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage("effectiveness must be between 10 and 5000 characters")
    .custom((value, { req }) => {
      // Either response or effectiveness must be provided
      if (!value && (!req.body.response || req.body.response.trim().length === 0)) {
        throw new Error("Either 'response' or 'effectiveness' is required for follow-up");
      }
      return true;
    }),
  body("physicianNotified")
    .optional()
    .isBoolean()
    .withMessage("physicianNotified must be a boolean"),
  body("physicianNotes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("physicianNotes must not exceed 5000 characters"),
];

/**
 * Get PRN records query validation
 */
const getPrnRecordsValidator = [
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
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
  query("hasResponse")
    .optional()
    .isBoolean()
    .withMessage("hasResponse must be a boolean"),
  query("physicianNotified")
    .optional()
    .isBoolean()
    .withMessage("physicianNotified must be a boolean"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Get pending follow-ups query validation
 */
const getPendingFollowupsValidator = [
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * PRN record ID param validation
 */
const prnRecordIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("PRN record ID is required")
    .isUUID()
    .withMessage("PRN record ID must be a valid UUID"),
];

module.exports = {
  recordPrnValidator,
  recordPrnResponseValidator,
  getPrnRecordsValidator,
  getPendingFollowupsValidator,
  prnRecordIdValidator,
};
