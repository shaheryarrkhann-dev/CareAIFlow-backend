const { body, param, query } = require("express-validator");

const VISITOR_DURATION_MINUTES = [15, 30, 45, 60];

const checkInValidator = [
  body("visitorName")
    .trim()
    .notEmpty()
    .withMessage("Visitor name is required")
    .isLength({ max: 255 }),
  body("residentId").optional().isUUID(),
  body("personVisitedName").optional().trim().isLength({ max: 255 }),
  body("visitorEmail").optional().trim().isEmail().isLength({ max: 255 }),
  body("visitorPhone").optional().trim().isLength({ max: 50 }),
  body("expectedDurationMinutes")
    .optional()
    .isInt({ min: 15, max: 60 })
    .custom((v) => !v || VISITOR_DURATION_MINUTES.includes(Number(v)))
    .withMessage("Expected duration must be 15, 30, 45, or 60"),
  body("notes").optional().trim().isLength({ max: 2000 }),
];

const checkOutValidator = [param("id").isUUID().withMessage("Invalid log ID")];

const linkResidentValidator = [
  param("id").isUUID().withMessage("Invalid log ID"),
  body("residentId")
    .isUUID()
    .withMessage("residentId is required and must be a valid UUID"),
];

const listVisitorsValidator = [
  query("residentId").optional().isUUID(),
  query("startDate").optional().isISO8601(),
  query("endDate").optional().isISO8601(),
  query("activeOnly").optional().isIn(["true", "false"]),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
];

const exportVisitorValidator = [
  query("residentId").optional().isUUID(),
  query("startDate").optional().isISO8601(),
  query("endDate").optional().isISO8601(),
];

module.exports = {
  checkInValidator,
  checkOutValidator,
  linkResidentValidator,
  listVisitorsValidator,
  exportVisitorValidator,
};
