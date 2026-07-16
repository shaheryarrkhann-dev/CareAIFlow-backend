const { body, param, query } = require("express-validator");

const INCIDENT_TYPES = [
  "Accident",
  "MedicationError",
  "Behavioral",
  "Complaint",
  "SuspectedAbuseOrNeglect",
];

const STATUSES = ["Open", "InReview", "Closed"];

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
  body("location").optional().trim().isLength({ max: 500 }),
  body("payload").optional().isObject(),
  body("tenantId").optional().trim().isUUID(),
];

const updateIncidentReportValidator = [
  body("residentId").optional().trim().notEmpty(),
  body("occurredAt").optional().isISO8601(),
  body("incidentType").optional().trim().isIn(INCIDENT_TYPES),
  body("status").optional().trim().isIn(STATUSES),
  body("location").optional().trim().isLength({ max: 500 }),
  body("payload").optional().isObject(),
];

const listIncidentReportsValidator = [
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("residentId").optional().trim(),
  query("incidentType").optional().trim().isIn(INCIDENT_TYPES),
  query("status").optional().trim().isIn(STATUSES),
  query("dateFrom").optional().isISO8601(),
  query("dateTo").optional().isISO8601(),
  query("search").optional().trim().isLength({ max: 200 }),
  query("tenantId").optional().trim().isUUID(),
];

const incidentReportIdValidator = [
  param("id").trim().notEmpty().isUUID().withMessage("Invalid incident id"),
];

module.exports = {
  createIncidentReportValidator,
  updateIncidentReportValidator,
  listIncidentReportsValidator,
  incidentReportIdValidator,
};
