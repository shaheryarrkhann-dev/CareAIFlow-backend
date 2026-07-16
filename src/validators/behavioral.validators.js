const { body, param, query } = require("express-validator");

/**
 * Create behavioral log validation
 */
const createBehavioralLogValidator = [
  body("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  body("residentName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("residentName must not exceed 200 characters"),
  body("dateTime")
    .notEmpty()
    .withMessage("dateTime is required")
    .isISO8601()
    .withMessage("dateTime must be a valid ISO 8601 date"),
  body("duration")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("duration must not exceed 100 characters"),
  body("behaviorType")
    .trim()
    .notEmpty()
    .withMessage("behaviorType is required")
    .isIn([
      "Aggression",
      "SelfHarm",
      "Withdrawal",
      "NonCompliance",
      "MoodChanges",
      "Anxiety",
      "Agitation",
      "VerbalAbuse",
      "PhysicalAbuse",
      "PropertyDamage",
      "Wandering",
      "InappropriateBehavior",
      "Other",
    ])
    .withMessage(
      "behaviorType must be one of: Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other"
    ),
  body("severity")
    .trim()
    .notEmpty()
    .withMessage("severity is required")
    .isIn(["Low", "Moderate", "High"])
    .withMessage("severity must be one of: Low, Moderate, High"),
  body("trigger")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("trigger must not exceed 5000 characters"),
  body("staffNotes")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("staffNotes must not exceed 10000 characters"),
  body("residentExplanation")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("residentExplanation must not exceed 10000 characters"),
  body("outcome")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("outcome must not exceed 10000 characters"),
  body("interventions")
    .notEmpty()
    .withMessage("interventions is required")
    .isArray()
    .withMessage("interventions must be an array")
    .custom((value) => {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error("interventions must be a non-empty array");
      }
      const validInterventions = [
        "Redirect",
        "Counseling",
        "PrnMedication",
        "TimeOut",
        "DeEscalation",
        "EnvironmentalModification",
        "StaffSupport",
        "FamilyNotification",
        "PhysicianNotification",
        "EmergencyResponse",
        "Other",
      ];
      const invalid = value.filter(
        (item) => !validInterventions.includes(item)
      );
      if (invalid.length > 0) {
        throw new Error(
          `Invalid intervention types: ${invalid.join(", ")}. Valid types are: ${validInterventions.join(", ")}`
        );
      }
      return true;
    }),
  body("interventionDetails")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("interventionDetails must not exceed 5000 characters"),
  body("prnRecordId")
    .optional()
    .isUUID()
    .withMessage("prnRecordId must be a valid UUID"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Update behavioral log validation
 */
const updateBehavioralLogValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Behavioral log ID is required")
    .isUUID()
    .withMessage("Behavioral log ID must be a valid UUID"),
  body("dateTime")
    .optional()
    .isISO8601()
    .withMessage("dateTime must be a valid ISO 8601 date"),
  body("behaviorType")
    .optional()
    .trim()
    .isIn([
      "Aggression",
      "SelfHarm",
      "Withdrawal",
      "NonCompliance",
      "MoodChanges",
      "Anxiety",
      "Agitation",
      "VerbalAbuse",
      "PhysicalAbuse",
      "PropertyDamage",
      "Wandering",
      "InappropriateBehavior",
      "Other",
    ])
    .withMessage(
      "behaviorType must be one of: Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other"
    ),
  body("severity")
    .optional()
    .trim()
    .isIn(["Low", "Moderate", "High"])
    .withMessage("severity must be one of: Low, Moderate, High"),
  body("trigger")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("trigger must not exceed 5000 characters"),
  body("staffNotes")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("staffNotes must not exceed 10000 characters"),
  body("residentExplanation")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("residentExplanation must not exceed 10000 characters"),
  body("outcome")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("outcome must not exceed 10000 characters"),
  body("interventions")
    .optional()
    .isArray()
    .withMessage("interventions must be an array")
    .custom((value) => {
      if (value !== undefined && value !== null) {
        if (!Array.isArray(value) || value.length === 0) {
          throw new Error("interventions must be a non-empty array when provided");
        }
        const validInterventions = [
          "Redirect",
          "Counseling",
          "PrnMedication",
          "TimeOut",
          "DeEscalation",
          "EnvironmentalModification",
          "StaffSupport",
          "FamilyNotification",
          "PhysicianNotification",
          "EmergencyResponse",
          "Other",
        ];
        const invalid = value.filter(
          (item) => !validInterventions.includes(item)
        );
        if (invalid.length > 0) {
          throw new Error(
            `Invalid intervention types: ${invalid.join(", ")}. Valid types are: ${validInterventions.join(", ")}`
          );
        }
      }
      return true;
    }),
  body("interventionDetails")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("interventionDetails must not exceed 5000 characters"),
  body("duration")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("duration must not exceed 100 characters"),
  body("prnRecordId")
    .optional()
    .custom((value) => {
      if (value === null || value === "") {
        return true; // Allow null/empty to unlink PRN record
      }
      // If provided, must be valid UUID
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) {
        throw new Error("prnRecordId must be a valid UUID or null");
      }
      return true;
    }),
];

/**
 * Get behavioral logs query validation
 */
const getBehavioralLogsValidator = [
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
  query("behaviorType")
    .optional()
    .trim()
    .isIn([
      "Aggression",
      "SelfHarm",
      "Withdrawal",
      "NonCompliance",
      "MoodChanges",
      "Anxiety",
      "Agitation",
      "VerbalAbuse",
      "PhysicalAbuse",
      "PropertyDamage",
      "Wandering",
      "InappropriateBehavior",
      "Other",
    ])
    .withMessage(
      "behaviorType must be one of: Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other"
    ),
  query("severity")
    .optional()
    .trim()
    .isIn(["Low", "Moderate", "High"])
    .withMessage("severity must be one of: Low, Moderate, High"),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("dateFrom must be a valid ISO 8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("dateTo must be a valid ISO 8601 date"),
  query("staffId")
    .optional()
    .isUUID()
    .withMessage("staffId must be a valid UUID"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Behavioral log ID param validation
 */
const behavioralLogIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Behavioral log ID is required")
    .isUUID()
    .withMessage("Behavioral log ID must be a valid UUID"),
];

/**
 * Generate behavioral note validation
 */
const generateBehavioralNoteValidator = [
  body("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  body("startDate")
    .notEmpty()
    .withMessage("startDate is required")
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date"),
  body("endDate")
    .notEmpty()
    .withMessage("endDate is required")
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date")
    .custom((value, { req }) => {
      if (req.body.startDate) {
        const startDate = new Date(req.body.startDate);
        const endDate = new Date(value);
        if (endDate < startDate) {
          throw new Error("endDate must be after or equal to startDate");
        }
        // Check if date range is reasonable (not more than 1 year)
        const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
        if (daysDiff > 365) {
          throw new Error("Date range cannot exceed 365 days");
        }
      }
      return true;
    }),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Update behavioral note validation
 */
const updateBehavioralNoteValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Behavioral note ID is required")
    .isUUID()
    .withMessage("Behavioral note ID must be a valid UUID"),
  body("narrative")
    .trim()
    .notEmpty()
    .withMessage("narrative is required")
    .isLength({ min: 10, max: 50000 })
    .withMessage("narrative must be between 10 and 50000 characters"),
];

/**
 * Behavioral note ID param validation
 */
const behavioralNoteIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Behavioral note ID is required")
    .isUUID()
    .withMessage("Behavioral note ID must be a valid UUID"),
];

/**
 * Get behavioral notes query validation
 */
const getBehavioralNotesValidator = [
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
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date"),
  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date")
    .custom((value, { req }) => {
      if (req.query.startDate && value) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(value);
        if (endDate < startDate) {
          throw new Error("endDate must be after or equal to startDate");
        }
      }
      return true;
    }),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Get behavioral dashboard query validation
 */
const getBehavioralDashboardValidator = [
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("month")
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12"),
  query("year")
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100"),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Get behavior trends query validation
 */
const getBehaviorTrendsValidator = [
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("startDate")
    .notEmpty()
    .withMessage("startDate is required")
    .isISO8601()
    .withMessage("startDate must be a valid ISO 8601 date"),
  query("endDate")
    .notEmpty()
    .withMessage("endDate is required")
    .isISO8601()
    .withMessage("endDate must be a valid ISO 8601 date")
    .custom((value, { req }) => {
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(value);
        if (endDate < startDate) {
          throw new Error("endDate must be after or equal to startDate");
        }
        // Check if date range is reasonable (not more than 1 year)
        const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
        if (daysDiff > 365) {
          throw new Error("Date range cannot exceed 365 days");
        }
      }
      return true;
    }),
  query("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Export behavioral report query validation
 */
const exportBehavioralReportValidator = [
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("behaviorType")
    .optional()
    .trim()
    .isIn([
      "Aggression",
      "SelfHarm",
      "Withdrawal",
      "NonCompliance",
      "MoodChanges",
      "Anxiety",
      "Agitation",
      "VerbalAbuse",
      "PhysicalAbuse",
      "PropertyDamage",
      "Wandering",
      "InappropriateBehavior",
      "Other",
    ])
    .withMessage(
      "behaviorType must be one of: Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other"
    ),
  query("severity")
    .optional()
    .trim()
    .isIn(["Low", "Moderate", "High"])
    .withMessage("severity must be one of: Low, Moderate, High"),
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
 * Batch create behavioral logs validation
 */
const createBehavioralLogsBatchValidator = [
  body("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  body("date")
    .notEmpty()
    .withMessage("date is required")
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date"),
  body("services")
    .isArray({ min: 1, max: 31 })
    .withMessage("services must be an array with 1-31 items"),
  body("services.*.index")
    .optional()
    .isInt({ min: 1 })
    .withMessage("index must be a positive integer"),
  body("services.*.timeOrDuration")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("timeOrDuration must not exceed 100 characters"),
  body("services.*.behaviorType")
    .trim()
    .notEmpty()
    .withMessage("behaviorType is required for each service")
    .isIn([
      "Aggression",
      "SelfHarm",
      "Withdrawal",
      "NonCompliance",
      "MoodChanges",
      "Anxiety",
      "Agitation",
      "VerbalAbuse",
      "PhysicalAbuse",
      "PropertyDamage",
      "Wandering",
      "InappropriateBehavior",
      "Other",
    ])
    .withMessage(
      "behaviorType must be one of: Aggression, SelfHarm, Withdrawal, NonCompliance, MoodChanges, Anxiety, Agitation, VerbalAbuse, PhysicalAbuse, PropertyDamage, Wandering, InappropriateBehavior, Other"
    ),
  body("services.*.severity")
    .optional()
    .trim()
    .isIn(["Low", "Moderate", "High"])
    .withMessage("severity must be one of: Low, Moderate, High"),
  body("services.*.residentExplanation")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("residentExplanation must not exceed 10000 characters"),
  body("services.*.interventions")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("interventions must not exceed 5000 characters"),
  body("services.*.staffName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("staffName must not exceed 200 characters"),
  body("services.*.outcome")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("outcome must not exceed 10000 characters"),
  body("services.*.signature")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("signature must not exceed 200 characters"),
  body("services.*.summary")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("summary must not exceed 10000 characters"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Generate summary validation
 */
const generateSummaryValidator = [
  body("serviceIndex")
    .notEmpty()
    .withMessage("serviceIndex is required")
    .isInt({ min: 1 })
    .withMessage("serviceIndex must be a positive integer"),
  body("date")
    .notEmpty()
    .withMessage("date is required")
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date"),
  body("timeOrDuration")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("timeOrDuration must not exceed 100 characters"),
  body("observedBehavior")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("observedBehavior must not exceed 200 characters"),
  body("residentExplanation")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("residentExplanation must not exceed 10000 characters"),
  body("interventions")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("interventions must not exceed 5000 characters"),
  body("staffName")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("staffName must not exceed 200 characters"),
  body("outcome")
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage("outcome must not exceed 10000 characters"),
];

/**
 * Generate outcome validation (observedBehaviors required; interventions optional)
 */
const generateOutcomeValidator = [
  body("observedBehaviors")
    .isArray({ min: 1 })
    .withMessage("observedBehaviors must be a non-empty array"),
  body("observedBehaviors.*")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("each behavior must be a non-empty string"),
  body("interventions")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("interventions must not exceed 5000 characters"),
];

module.exports = {
  createBehavioralLogValidator,
  updateBehavioralLogValidator,
  getBehavioralLogsValidator,
  behavioralLogIdValidator,
  generateBehavioralNoteValidator,
  updateBehavioralNoteValidator,
  behavioralNoteIdValidator,
  getBehavioralNotesValidator,
  getBehavioralDashboardValidator,
  getBehaviorTrendsValidator,
  exportBehavioralReportValidator,
  createBehavioralLogsBatchValidator,
  generateSummaryValidator,
  generateOutcomeValidator,
};

