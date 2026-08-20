const { body } = require("express-validator");

const FACILITY_OPTIONS = ["1", "2-3", "4+"];
const POPULATION_OPTIONS = ["1-6", "7-15", "16+"];

const submitLeadValidator = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ max: 200 })
    .withMessage("Full name must not exceed 200 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Work email is required")
    .isEmail()
    .withMessage("Invalid email")
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters")
    .normalizeEmail(),
  body("organization")
    .trim()
    .notEmpty()
    .withMessage("Organization name is required")
    .isLength({ max: 255 })
    .withMessage("Organization name must not exceed 255 characters"),
  body("role")
    .trim()
    .notEmpty()
    .withMessage("Role is required")
    .isLength({ max: 120 })
    .withMessage("Role must not exceed 120 characters"),
  body("facilities")
    .trim()
    .notEmpty()
    .withMessage("Number of facilities is required")
    .custom((v) => FACILITY_OPTIONS.includes(String(v)))
    .withMessage("Invalid facilities selection"),
  body("population")
    .trim()
    .notEmpty()
    .withMessage("Resident population is required")
    .custom((v) => POPULATION_OPTIONS.includes(String(v)))
    .withMessage("Invalid population selection"),
  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 50 })
    .withMessage("Phone must not exceed 50 characters"),
  body("currentSystem")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 200 })
    .withMessage("Current system must not exceed 200 characters"),
  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required")
    .isLength({ max: 5000 })
    .withMessage("Message must not exceed 5000 characters"),
  body("privacyAccepted")
    .custom((v) => v === true || v === "true" || v === "on" || v === "1")
    .withMessage("Privacy policy consent is required"),
  body("source")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 80 })
    .withMessage("Source must not exceed 80 characters"),
];

module.exports = {
  submitLeadValidator,
  FACILITY_OPTIONS,
  POPULATION_OPTIONS,
};
