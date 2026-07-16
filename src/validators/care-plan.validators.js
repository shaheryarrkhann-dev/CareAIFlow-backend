const { body, param, query } = require("express-validator");

/**
 * Create care plan validation
 */
const createCarePlanValidator = [
  body("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  body("title")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("title must not exceed 200 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("description must not exceed 5000 characters"),
  body("status")
    .optional()
    .trim()
    .isIn(["Active", "Archived", "Draft", "PendingReview"])
    .withMessage(
      "status must be one of: Active, Archived, Draft, PendingReview"
    ),
  body("nextReviewDate")
    .optional()
    .isISO8601()
    .withMessage("nextReviewDate must be a valid ISO 8601 date"),
  body("reviewIntervalDays")
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage("reviewIntervalDays must be between 1 and 365"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Update care plan validation
 */
const updateCarePlanValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Care plan ID is required")
    .isUUID()
    .withMessage("Care plan ID must be a valid UUID"),
  body("title")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("title must not exceed 200 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("description must not exceed 5000 characters"),
  body("status")
    .optional()
    .trim()
    .isIn(["Active", "Archived", "Draft", "PendingReview"])
    .withMessage(
      "status must be one of: Active, Archived, Draft, PendingReview"
    ),
  body("nextReviewDate")
    .optional()
    .isISO8601()
    .withMessage("nextReviewDate must be a valid ISO 8601 date"),
  body("reviewIntervalDays")
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage("reviewIntervalDays must be between 1 and 365"),
];

/**
 * Care plan ID validation
 */
const carePlanIdValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Care plan ID is required")
    .isUUID()
    .withMessage("Care plan ID must be a valid UUID"),
];

/**
 * Get care plans validation
 */
const getCarePlansValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("residentId")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("residentId cannot be empty"),
  query("status")
    .optional()
    .trim()
    .isIn(["Active", "Archived", "Draft", "PendingReview"])
    .withMessage(
      "status must be one of: Active, Archived, Draft, PendingReview"
    ),
  query("createdBy")
    .optional()
    .isUUID()
    .withMessage("createdBy must be a valid UUID"),
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
 * Resident ID validation
 * Note: residentId should be a UUID from the Resident model
 */
const residentIdValidator = [
  param("residentId")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required"),
];

/**
 * Add problem validation
 */
const addProblemValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Care plan ID is required")
    .isUUID()
    .withMessage("Care plan ID must be a valid UUID"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("description is required")
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("category")
    .trim()
    .notEmpty()
    .withMessage("category is required")
    .isIn(["Medical", "Behavioral", "Functional", "Social", "Other"])
    .withMessage(
      "category must be one of: Medical, Behavioral, Functional, Social, Other"
    ),
  body("priority")
    .optional()
    .trim()
    .isIn(["Low", "Medium", "High"])
    .withMessage("priority must be one of: Low, Medium, High"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
];

/**
 * Update problem validation
 */
const updateProblemValidator = [
  param("problemId")
    .trim()
    .notEmpty()
    .withMessage("Problem ID is required")
    .isUUID()
    .withMessage("Problem ID must be a valid UUID"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("category")
    .optional()
    .trim()
    .isIn(["Medical", "Behavioral", "Functional", "Social", "Other"])
    .withMessage(
      "category must be one of: Medical, Behavioral, Functional, Social, Other"
    ),
  body("priority")
    .optional()
    .trim()
    .isIn(["Low", "Medium", "High"])
    .withMessage("priority must be one of: Low, Medium, High"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
];

/**
 * Problem ID validation
 */
const problemIdValidator = [
  param("problemId")
    .trim()
    .notEmpty()
    .withMessage("Problem ID is required")
    .isUUID()
    .withMessage("Problem ID must be a valid UUID"),
];

/**
 * Add goal validation
 */
const addGoalValidator = [
  param("problemId")
    .trim()
    .notEmpty()
    .withMessage("Problem ID is required")
    .isUUID()
    .withMessage("Problem ID must be a valid UUID"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("description is required")
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("targetDate")
    .optional()
    .isISO8601()
    .withMessage("targetDate must be a valid ISO 8601 date"),
  body("status")
    .optional()
    .trim()
    .isIn(["InProgress", "Achieved", "NotAchieved", "Discontinued"])
    .withMessage(
      "status must be one of: InProgress, Achieved, NotAchieved, Discontinued"
    ),
];

/**
 * Update goal validation
 */
const updateGoalValidator = [
  param("goalId")
    .trim()
    .notEmpty()
    .withMessage("Goal ID is required")
    .isUUID()
    .withMessage("Goal ID must be a valid UUID"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("targetDate")
    .optional()
    .isISO8601()
    .withMessage("targetDate must be a valid ISO 8601 date"),
  body("status")
    .optional()
    .trim()
    .isIn(["InProgress", "Achieved", "NotAchieved", "Discontinued"])
    .withMessage(
      "status must be one of: InProgress, Achieved, NotAchieved, Discontinued"
    ),
];

/**
 * Goal ID validation
 */
const goalIdValidator = [
  param("goalId")
    .trim()
    .notEmpty()
    .withMessage("Goal ID is required")
    .isUUID()
    .withMessage("Goal ID must be a valid UUID"),
];

/**
 * Add intervention validation
 */
const addInterventionValidator = [
  param("goalId")
    .trim()
    .notEmpty()
    .withMessage("Goal ID is required")
    .isUUID()
    .withMessage("Goal ID must be a valid UUID"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("description is required")
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("frequency")
    .optional()
    .trim()
    .isIn([
      "Daily",
      "TwiceDaily",
      "Weekly",
      "PRN",
      "AsNeeded",
      "Custom",
    ])
    .withMessage(
      "frequency must be one of: Daily, TwiceDaily, Weekly, PRN, AsNeeded, Custom"
    ),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
];

/**
 * Update intervention validation
 */
const updateInterventionValidator = [
  param("interventionId")
    .trim()
    .notEmpty()
    .withMessage("Intervention ID is required")
    .isUUID()
    .withMessage("Intervention ID must be a valid UUID"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("description must not exceed 2000 characters"),
  body("frequency")
    .optional()
    .trim()
    .isIn([
      "Daily",
      "TwiceDaily",
      "Weekly",
      "PRN",
      "AsNeeded",
      "Custom",
    ])
    .withMessage(
      "frequency must be one of: Daily, TwiceDaily, Weekly, PRN, AsNeeded, Custom"
    ),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("notes must not exceed 5000 characters"),
];

/**
 * Intervention ID validation
 */
const interventionIdValidator = [
  param("interventionId")
    .trim()
    .notEmpty()
    .withMessage("Intervention ID is required")
    .isUUID()
    .withMessage("Intervention ID must be a valid UUID"),
];

/**
 * Version ID validation
 */
const versionIdValidator = [
  param("versionId")
    .trim()
    .notEmpty()
    .withMessage("Version ID is required")
    .isUUID()
    .withMessage("Version ID must be a valid UUID"),
];

/**
 * Compare versions validation
 */
const compareVersionsValidator = [
  query("versionId1")
    .trim()
    .notEmpty()
    .withMessage("versionId1 is required")
    .isUUID()
    .withMessage("versionId1 must be a valid UUID"),
  query("versionId2")
    .trim()
    .notEmpty()
    .withMessage("versionId2 is required")
    .isUUID()
    .withMessage("versionId2 must be a valid UUID"),
];

/**
 * Rollback to version validation
 */
const rollbackToVersionValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Care plan ID is required")
    .isUUID()
    .withMessage("Care plan ID must be a valid UUID"),
  body("versionId")
    .trim()
    .notEmpty()
    .withMessage("versionId is required")
    .isUUID()
    .withMessage("versionId must be a valid UUID"),
];

/**
 * Get alerts validation
 */
const getAlertsValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("carePlanId")
    .optional()
    .isUUID()
    .withMessage("carePlanId must be a valid UUID"),
  query("alertType")
    .optional()
    .trim()
    .isIn(["ReviewDue", "NewDiagnosis", "GoalNotMet", "InterventionOverdue"])
    .withMessage(
      "alertType must be one of: ReviewDue, NewDiagnosis, GoalNotMet, InterventionOverdue"
    ),
  query("isDismissed")
    .optional()
    .isBoolean()
    .withMessage("isDismissed must be a boolean"),
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
 * Alert ID validation
 */
const alertIdValidator = [
  param("alertId")
    .trim()
    .notEmpty()
    .withMessage("Alert ID is required")
    .isUUID()
    .withMessage("Alert ID must be a valid UUID"),
];

/**
 * Schedule review reminder validation
 */
const scheduleReviewReminderValidator = [
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Care plan ID is required")
    .isUUID()
    .withMessage("Care plan ID must be a valid UUID"),
  body("reviewDate")
    .trim()
    .notEmpty()
    .withMessage("reviewDate is required")
    .isISO8601()
    .withMessage("reviewDate must be a valid ISO 8601 date"),
];

/**
 * Detect problems validation
 */
const detectProblemsValidator = [
  body("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  body("assessmentData")
    .notEmpty()
    .withMessage("assessmentData is required")
    .isObject()
    .withMessage("assessmentData must be an object"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Generate draft validation
 */
const generateDraftValidator = [
  body("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  body("assessmentData")
    .notEmpty()
    .withMessage("assessmentData is required")
    .isObject()
    .withMessage("assessmentData must be an object"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("tenantId must be a valid UUID"),
];

/**
 * Detect problems from notes validation
 */
const detectProblemsFromNotesValidator = [
  body("residentId")
    .trim()
    .notEmpty()
    .withMessage("residentId is required"),
  body("noteIds")
    .notEmpty()
    .withMessage("noteIds is required")
    .isArray()
    .withMessage("noteIds must be an array")
    .custom((value) => {
      if (value.length === 0) {
        throw new Error("noteIds must be a non-empty array");
      }
      return true;
    }),
];

module.exports = {
  createCarePlanValidator,
  updateCarePlanValidator,
  carePlanIdValidator,
  getCarePlansValidator,
  residentIdValidator,
  addProblemValidator,
  updateProblemValidator,
  problemIdValidator,
  addGoalValidator,
  updateGoalValidator,
  goalIdValidator,
  addInterventionValidator,
  updateInterventionValidator,
  interventionIdValidator,
  versionIdValidator,
  compareVersionsValidator,
  rollbackToVersionValidator,
  getAlertsValidator,
  alertIdValidator,
  scheduleReviewReminderValidator,
  detectProblemsValidator,
  generateDraftValidator,
  detectProblemsFromNotesValidator,
};

