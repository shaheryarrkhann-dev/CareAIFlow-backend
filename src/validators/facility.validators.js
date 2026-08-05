const { body, param, query } = require("express-validator");

/** Stored in `contactInformation`; UI collects a phone number only. */
function contactPhoneValidation(field = "contactInformation") {
  return body(field)
    .optional({ nullable: true })
    .trim()
    .custom((value) => {
      if (value == null || value === "") return true;
      if (value.length > 32) {
        throw new Error("Phone number must not exceed 32 characters");
      }
      if (!/^[\d+\s().-]+$/.test(value)) {
        throw new Error(
          "Phone number may only contain digits, spaces, +, -, (, )"
        );
      }
      const digits = value.replace(/\D/g, "");
      if (digits.length < 7) {
        throw new Error("Phone number must include at least 7 digits");
      }
      if (digits.length > 15) {
        throw new Error("Phone number must not exceed 15 digits");
      }
      return true;
    });
}

/**
 * Create facility validation
 */
const createFacilityValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 1, max: 255 })
    .withMessage("Name must be between 1 and 255 characters"),
  body("licenseNumber")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("License number must not exceed 100 characters"),
  body("address")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Address must not exceed 500 characters"),
  body("capacity")
    .optional()
    .isInt({ min: 0, max: 9999 })
    .withMessage("Capacity must be a non-negative integer"),
  body("licenseExpirationDate")
    .optional()
    .isISO8601()
    .withMessage("License expiration date must be a valid date"),
  body("profilePhotoUrl")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2048 })
    .withMessage("Profile photo URL must not exceed 2048 characters"),
  contactPhoneValidation("contactInformation"),
  body("contactEmail")
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address")
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters"),
  body("website")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2048 })
    .withMessage("Website must not exceed 2048 characters")
    .custom((value) => {
      if (value == null || value === "") return true;
      try {
        const u = value.includes("://") ? value : `https://${value}`;
        // eslint-disable-next-line no-new
        new URL(u);
      } catch {
        throw new Error("Enter a valid website URL");
      }
      return true;
    }),
];

/**
 * Facility ID param validation (for routes like GET /facilities/:id)
 */
const facilityIdParam = [
  param("id").isUUID().withMessage("Invalid facility ID"),
];

/**
 * Facility ID in query/body (optional - for profile, update, etc.)
 */
const facilityIdOptionalValidator = [
  query("facilityId")
    .optional()
    .isUUID()
    .withMessage("Invalid facility ID"),
  body("facilityId")
    .optional()
    .isUUID()
    .withMessage("Invalid facility ID"),
];

/**
 * Update facility profile validation
 */
const updateFacilityProfileValidator = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ min: 1, max: 255 })
    .withMessage("Name must be between 1 and 255 characters"),
  body("licenseNumber")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("License number must not exceed 100 characters"),
  body("address")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Address must not exceed 500 characters"),
  body("capacity")
    .optional()
    .isInt({ min: 0, max: 9999 })
    .withMessage("Capacity must be a non-negative integer"),
  body("licenseExpirationDate")
    .optional()
    .isISO8601()
    .withMessage("License expiration date must be a valid date")
    .toDate(),
  body("profilePhotoUrl")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2048 })
    .withMessage("Profile photo URL must not exceed 2048 characters"),
  contactPhoneValidation("contactInformation"),
  body("contactEmail")
    .optional({ nullable: true })
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address")
    .isLength({ max: 255 })
    .withMessage("Email must not exceed 255 characters"),
  body("website")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2048 })
    .withMessage("Website must not exceed 2048 characters")
    .custom((value) => {
      if (value == null || value === "") return true;
      try {
        const u = value.includes("://") ? value : `https://${value}`;
        // eslint-disable-next-line no-new
        new URL(u);
      } catch {
        throw new Error("Enter a valid website URL");
      }
      return true;
    }),
];

const profilePhotoUploadValidator = [
  body("facilityId")
    .notEmpty()
    .withMessage("facilityId is required")
    .isUUID()
    .withMessage("Invalid facility ID"),
  body("tenantId")
    .optional({ nullable: true })
    .isUUID()
    .withMessage("Invalid organization ID"),
];

module.exports = {
  createFacilityValidator,
  facilityIdParam,
  facilityIdOptionalValidator,
  updateFacilityProfileValidator,
  profilePhotoUploadValidator,
  contactPhoneValidation,
};
