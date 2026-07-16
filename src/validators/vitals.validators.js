const { body, param, query } = require("express-validator");

/**
 * Record vitals validation
 */
const recordVitalsValidator = [
  body("residentId").trim().notEmpty().withMessage("residentId is required"),
  body("recordedAt")
    .notEmpty()
    .withMessage("recordedAt is required")
    .isISO8601()
    .withMessage("recordedAt must be a valid ISO 8601 date"),
  body("bloodPressureSystolic")
    .optional()
    .isInt({ min: 50, max: 250 })
    .withMessage("Systolic blood pressure must be between 50 and 250"),
  body("bloodPressureDiastolic")
    .optional()
    .isInt({ min: 30, max: 150 })
    .withMessage("Diastolic blood pressure must be between 30 and 150"),
  body("pulse")
    .optional()
    .isInt({ min: 30, max: 200 })
    .withMessage("Pulse must be between 30 and 200"),
  body("temperature")
    .optional()
    .isFloat({ min: 90, max: 110 })
    .withMessage("Temperature (Fahrenheit) must be between 90 and 110")
    .custom((value, { req }) => {
      const unit = req.body.temperatureUnit || "F";
      if (unit === "C") {
        const celsius = Number.parseFloat(value);
        if (celsius < 32 || celsius > 43) {
          throw new Error("Temperature (Celsius) must be between 32 and 43");
        }
      }
      return true;
    }),
  body("temperatureUnit")
    .optional()
    .trim()
    .isIn(["F", "C"])
    .withMessage("temperatureUnit must be 'F' or 'C'"),
  body("oxygenSaturation")
    .optional()
    .isInt({ min: 70, max: 100 })
    .withMessage("Oxygen saturation must be between 70 and 100"),
  body("weight")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Weight must be positive"),
  body("weightUnit")
    .optional()
    .trim()
    .isIn(["lbs", "kg"])
    .withMessage("weightUnit must be 'lbs' or 'kg'"),
  body("medicationId")
    .optional()
    .isUUID()
    .withMessage("medicationId must be a valid UUID"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
  body().custom((value) => {
    // At least one vital sign must be provided
    const hasVital =
      value.bloodPressureSystolic !== undefined ||
      value.bloodPressureDiastolic !== undefined ||
      value.pulse !== undefined ||
      value.temperature !== undefined ||
      value.oxygenSaturation !== undefined ||
      value.weight !== undefined;

    if (!hasVital) {
      throw new Error(
        "At least one vital sign must be provided (bloodPressure, pulse, temperature, oxygenSaturation, or weight)"
      );
    }
    return true;
  }),
];

/**
 * Update vitals validation
 */
const updateVitalsValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Vitals record ID is required")
    .isUUID()
    .withMessage("Vitals record ID must be a valid UUID"),
  body("recordedAt")
    .optional()
    .isISO8601()
    .withMessage("recordedAt must be a valid ISO 8601 date"),
  body("bloodPressureSystolic")
    .optional()
    .isInt({ min: 50, max: 250 })
    .withMessage("Systolic blood pressure must be between 50 and 250"),
  body("bloodPressureDiastolic")
    .optional()
    .isInt({ min: 30, max: 150 })
    .withMessage("Diastolic blood pressure must be between 30 and 150"),
  body("pulse")
    .optional()
    .isInt({ min: 30, max: 200 })
    .withMessage("Pulse must be between 30 and 200"),
  body("temperature")
    .optional()
    .isFloat({ min: 90, max: 110 })
    .withMessage("Temperature (Fahrenheit) must be between 90 and 110")
    .custom((value, { req }) => {
      if (value !== undefined && value !== null) {
        const unit = req.body.temperatureUnit || "F";
        if (unit === "C") {
          const celsius = Number.parseFloat(value);
          if (celsius < 32 || celsius > 43) {
            throw new Error("Temperature (Celsius) must be between 32 and 43");
          }
        }
      }
      return true;
    }),
  body("temperatureUnit")
    .optional()
    .trim()
    .isIn(["F", "C"])
    .withMessage("temperatureUnit must be 'F' or 'C'"),
  body("oxygenSaturation")
    .optional()
    .isInt({ min: 70, max: 100 })
    .withMessage("Oxygen saturation must be between 70 and 100"),
  body("weight")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Weight must be positive"),
  body("weightUnit")
    .optional()
    .trim()
    .isIn(["lbs", "kg"])
    .withMessage("weightUnit must be 'lbs' or 'kg'"),
  body("medicationId")
    .optional()
    .isUUID()
    .withMessage("medicationId must be a valid UUID"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
];

/**
 * Get vitals query validation
 */
const getVitalsValidator = [
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
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
  query("forRecordCreation")
    .optional()
    .isBoolean()
    .withMessage("forRecordCreation must be a boolean"),
];

/**
 * Get vitals trends query validation
 */
const getVitalsTrendsValidator = [
  query("residentId").trim().notEmpty().withMessage("residentId is required"),
  query("startDate")
    .notEmpty()
    .withMessage("startDate is required")
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date"),
  query("endDate")
    .notEmpty()
    .withMessage("endDate is required")
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Vitals record ID param validation
 */
const vitalsIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Vitals record ID is required")
    .isUUID()
    .withMessage("Vitals record ID must be a valid UUID"),
];

module.exports = {
  recordVitalsValidator,
  updateVitalsValidator,
  getVitalsValidator,
  getVitalsTrendsValidator,
  vitalsIdValidator,
};
