const { body, query } = require("express-validator");

const tokenQueryValidator = [
  query("t").notEmpty().withMessage("Token is required").trim(),
];

const VISITOR_DURATION_MINUTES = [15, 30, 45, 60];

const submitValidator = [
  body("token").notEmpty().withMessage("Token is required").trim(),
  body("visitorName")
    .trim()
    .notEmpty()
    .withMessage("Visitor name is required")
    .isLength({ max: 255 })
    .withMessage("Visitor name must not exceed 255 characters"),
  body("personVisitedName")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Person visited name must not exceed 255 characters"),
  body("visitorEmail")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email")
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters"),
  body("visitorPhone")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Visitor phone must not exceed 50 characters"),
  body("expectedDurationMinutes")
    .notEmpty()
    .withMessage("Expected visit duration is required")
    .isInt({ min: 15, max: 60 })
    .withMessage("Expected duration must be 15, 30, or 60 minutes")
    .custom((v) => VISITOR_DURATION_MINUTES.includes(Number(v)))
    .withMessage("Expected duration must be 15, 30, 45, or 60"),
  body("purpose").optional().trim().isLength({ max: 2000 }).withMessage("Purpose must not exceed 2000 characters"),
];

module.exports = {
  tokenQueryValidator,
  submitValidator,
};
