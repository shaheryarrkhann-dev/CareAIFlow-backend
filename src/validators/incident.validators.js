const { body, param, query } = require("express-validator");

const INCIDENT_TYPES = [
  "Accident",
  "MedicationError",
  "Behavioral",
  "Complaint",
  "SuspectedAbuseOrNeglect",
  "Other",
];

const STATUSES = ["Open", "InReview", "Closed"];
const SEVERITIES = ["Low", "Medium", "High"];

const bodyMapValidators = [
  body("payload.bodyMapPoints").optional().isArray({ max: 50 }),
  body("payload.bodyMapPoints.*.id").optional().isString().isLength({ min: 1, max: 100 }),
  body("payload.bodyMapPoints.*.view").optional().isIn(["front", "back"]),
  body("payload.bodyMapPoints.*.xPct").optional().isFloat({ min: 0, max: 100 }),
  body("payload.bodyMapPoints.*.yPct").optional().isFloat({ min: 0, max: 100 }),
  body("payload.bodyMapPoints.*.severity").optional().isIn(SEVERITIES),
  body("payload.guidedResponses").optional().isObject(),
];

const createIncidentReportValidator = [
  body("residentId").trim().notEmpty().withMessage("residentId is required"),
  body("occurredAt")
    .notEmpty()
    .withMessage("occurredAt is required")
    .isISO8601()
    .withMessage("occurredAt must be ISO 8601"),
  body("incidentType")
    .trim()
    .notEmpty()
    .isIn(INCIDENT_TYPES)
    .withMessage(`incidentType must be one of: ${INCIDENT_TYPES.join(", ")}`),
  body("status").optional().trim().isIn(STATUSES),
  body("severity").optional().trim().isIn(SEVERITIES),
  body("severityReason").optional().trim().isLength({ max: 1000 }),
  body("incidentTypeOtherText")
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 }),
  body("location").optional().trim().isLength({ max: 500 }),
  body("payload").optional().isObject(),
  ...bodyMapValidators,
  body("tenantId").optional().trim().isUUID(),
  body("incidentType").custom((value, { req }) => {
    if (value === "Other" && !String(req.body.incidentTypeOtherText || "").trim()) {
      throw new Error("incidentTypeOtherText is required when incidentType is Other");
    }
    return true;
  }),
];

const updateIncidentReportValidator = [
  body("residentId").optional().trim().notEmpty(),
  body("occurredAt").optional().isISO8601(),
  body("incidentType").optional().trim().isIn(INCIDENT_TYPES),
  body("incidentTypeOtherText")
    .optional()
    .trim()
    .isLength({ min: 1, max: 500 }),
  body("status").optional().trim().isIn(STATUSES),
  body("severity").optional().trim().isIn(SEVERITIES),
  body("severityReason").optional().trim().isLength({ max: 1000 }),
  body("forceComplianceOverride").optional().isBoolean(),
  body("location").optional().trim().isLength({ max: 500 }),
  body("payload").optional().isObject(),
  ...bodyMapValidators,
  body("incidentType").custom((value, { req }) => {
    const incidentType = value ?? req.body.incidentType;
    if (
      incidentType === "Other" &&
      req.body.incidentTypeOtherText !== undefined &&
      !String(req.body.incidentTypeOtherText || "").trim()
    ) {
      throw new Error("incidentTypeOtherText is required when incidentType is Other");
    }
    return true;
  }),
];

const listIncidentReportsValidator = [
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("residentId").optional().trim(),
  query("incidentType").optional().trim().isIn(INCIDENT_TYPES),
  query("status").optional().trim().isIn(STATUSES),
  query("severity").optional().trim().isIn(SEVERITIES),
  query("complianceStatus").optional().trim().isIn(["PENDING", "PASS", "FAIL"]),
  query("dateFrom").optional().isISO8601(),
  query("dateTo").optional().isISO8601(),
  query("search").optional().trim().isLength({ max: 200 }),
  query("tenantId").optional().trim().isUUID(),
];

const incidentReportIdValidator = [
  param("id").trim().notEmpty().isUUID().withMessage("Invalid incident id"),
];

const aiDraftIncidentValidator = [
  body("freeText").optional().isString().trim().isLength({ min: 1, max: 10000 }),
  body("notes").optional().isString().trim().isLength({ min: 1, max: 10000 }),
  body("residentCondition").optional().isString().trim().isLength({ max: 2000 }),
  body("tenantId").optional().trim().isUUID(),
  body().custom((value) => {
    const freeText = String(value?.freeText || "").trim();
    const notes = String(value?.notes || "").trim();
    if (!freeText && !notes) {
      throw new Error("Either freeText or notes is required");
    }
    return true;
  }),
];

const complianceCheckValidator = [
  ...incidentReportIdValidator,
  body("force").optional().isBoolean(),
  body("mode").optional().trim().isIn(["draft", "preSubmit"]),
];

module.exports = {
  createIncidentReportValidator,
  updateIncidentReportValidator,
  listIncidentReportsValidator,
  incidentReportIdValidator,
  aiDraftIncidentValidator,
  complianceCheckValidator,
};
