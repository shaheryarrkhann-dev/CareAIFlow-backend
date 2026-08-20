const { body, param, query } = require("express-validator");

/**
 * Create medication validation
 */
const createMedicationValidator = [
  body("residentId").trim().notEmpty().withMessage("residentId is required"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ min: 2, max: 200 })
    .withMessage("name must be between 2 and 200 characters"),
  body("dosage")
    .trim()
    .notEmpty()
    .withMessage("dosage is required")
    .isLength({ max: 100 })
    .withMessage("dosage must not exceed 100 characters"),
  body("route")
    .trim()
    .notEmpty()
    .withMessage("route is required")
    .isIn([
      "Oral",
      "IM",
      "IV",
      "Topical",
      "Eye",
      "Ear",
      "Sublingual",
      "Nasal",
      "Other",
    ])
    .withMessage(
      "route must be one of: Oral, IM, IV, Topical, Eye, Ear, Sublingual, Nasal, Other"
    ),
  body("frequency")
    .trim()
    .notEmpty()
    .withMessage("frequency is required")
    .isLength({ max: 200 })
    .withMessage("frequency must not exceed 200 characters"),
  body("startDate")
    .notEmpty()
    .withMessage("startDate is required")
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date")
    .custom((value) => {
      const date = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        throw new Error("startDate cannot be in the past");
      }
      return true;
    }),
  body("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date")
    .custom((value, { req }) => {
      if (value) {
        const endDate = new Date(value);
        const startDate = new Date(req.body.startDate);
        if (endDate <= startDate) {
          throw new Error("endDate must be after startDate");
        }
      }
      return true;
    }),
  body("isPrn")
    .optional()
    .isBoolean()
    .withMessage("isPrn must be a boolean")
    .custom((value, { req }) => {
      // If isPrn is true, frequency should be PRN-related or empty
      if (value === true && req.body.frequency) {
        const frequencyLower = req.body.frequency.toLowerCase();
        if (!frequencyLower.includes("prn") &&
            !frequencyLower.includes("as needed") &&
            !frequencyLower.includes("as required")) {
          throw new Error(
            "PRN medications cannot have scheduled frequencies. " +
            "If this medication needs both scheduled and PRN administration, " +
            "please create two separate medication entries."
          );
        }
      }
      return true;
    }),
  body("requiresVitals")
    .optional()
    .isBoolean()
    .withMessage("requiresVitals must be a boolean"),
  body("vitalsType")
    .optional()
    .trim()
    .isIn(["Temperature", "BloodPressure", "Pulse", "All"])
    .withMessage(
      "vitalsType must be one of: Temperature, BloodPressure, Pulse, All"
    )
    .custom((value, { req }) => {
      if (req.body.requiresVitals && !value) {
        throw new Error("vitalsType is required when requiresVitals is true");
      }
      return true;
    }),
  body("prescriberName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("prescriberName must not exceed 200 characters"),
  body("prescriberPhone")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("prescriberPhone must not exceed 50 characters"),
  body("pharmacyName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("pharmacyName must not exceed 200 characters"),
  body("pharmacyPhone")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("pharmacyPhone must not exceed 50 characters"),
  body("specialInstructions")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("specialInstructions must not exceed 5000 characters"),
];

/**
 * Update medication validation
 */
const updateMedicationValidator = [
  param("id").trim().notEmpty().withMessage("Medication ID is required"),
  body("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage("name must be between 2 and 200 characters"),
  body("dosage")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("dosage must not exceed 100 characters"),
  body("route")
    .optional()
    .trim()
    .isIn([
      "Oral",
      "IM",
      "IV",
      "Topical",
      "Eye",
      "Ear",
      "Sublingual",
      "Nasal",
      "Other",
    ])
    .withMessage(
      "route must be one of: Oral, IM, IV, Topical, Eye, Ear, Sublingual, Nasal, Other"
    ),
  body("frequency")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("frequency must not exceed 200 characters"),
  body("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date")
    .custom((value) => {
      if (value) {
        const date = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) {
          throw new Error("startDate cannot be in the past");
        }
      }
      return true;
    }),
  body("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date")
    .custom((value, { req }) => {
      if (value && req.body.startDate) {
        const endDate = new Date(value);
        const startDate = new Date(req.body.startDate);
        if (endDate <= startDate) {
          throw new Error("endDate must be after startDate");
        }
      }
      return true;
    }),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
  body("isPrn").optional().isBoolean().withMessage("isPrn must be a boolean"),
  body("requiresVitals")
    .optional()
    .isBoolean()
    .withMessage("requiresVitals must be a boolean"),
  body("vitalsType")
    .optional()
    .trim()
    .isIn(["Temperature", "BloodPressure", "Pulse", "All"])
    .withMessage(
      "vitalsType must be one of: Temperature, BloodPressure, Pulse, All"
    ),
  body("prescriberName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("prescriberName must not exceed 200 characters"),
  body("prescriberPhone")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("prescriberPhone must not exceed 50 characters"),
  body("pharmacyName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("pharmacyName must not exceed 200 characters"),
  body("pharmacyPhone")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("pharmacyPhone must not exceed 50 characters"),
  body("specialInstructions")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("specialInstructions must not exceed 5000 characters"),
];

/**
 * Get medications query validation
 */
const getMedicationsValidator = [
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
  query("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean"),
  query("isPrn").optional().isBoolean().withMessage("isPrn must be a boolean"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Medication ID param validation
 */
const medicationIdValidator = [
  param("id").trim().notEmpty().withMessage("Medication ID is required"),
];

module.exports = {
  createMedicationValidator,
  updateMedicationValidator,
  getMedicationsValidator,
  medicationIdValidator,
};
