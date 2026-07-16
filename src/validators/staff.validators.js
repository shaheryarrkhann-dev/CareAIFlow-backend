const { body, param, query } = require("express-validator");
const { contactPhoneValidation } = require("./facility.validators");

/**
 * Create staff member - link User (role STAFF) to document management
 */
const createStaffMemberValidator = [
  body("userId")
    .trim()
    .notEmpty()
    .withMessage("userId is required")
    .isUUID()
    .withMessage("userId must be a valid UUID"),
];

/**
 * Staff ID param
 */
const staffIdParam = [param("id").isUUID().withMessage("Invalid staff ID")];

/**
 * Staff ID param (for nested routes like /staff/:staffId/facilities)
 */
const staffIdParamNested = [
  param("staffId").isUUID().withMessage("Invalid staff ID"),
];

/**
 * Facility ID param
 */
const facilityIdParam = [
  param("facilityId").isUUID().withMessage("Invalid facility ID"),
];

/**
 * List staff members query
 */
const listStaffValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("Limit must be between 1 and 500")
    .toInt(),
  query("facilityId")
    .optional()
    .isUUID()
    .withMessage("facilityId must be a valid UUID"),
  query("search")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Search must not exceed 100 characters"),
];

/**
 * Assign staff to facility
 */
const assignFacilityValidator = [
  body("facilityId")
    .trim()
    .notEmpty()
    .withMessage("facilityId is required")
    .isUUID()
    .withMessage("facilityId must be a valid UUID"),
];

const updateStaffProfileValidator = [
  body("fullLegalName")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("fullLegalName must be at most 500 characters"),
  contactPhoneValidation("profilePhone"),
  body("profileEmail")
    .optional()
    .trim()
    .isLength({ max: 320 })
    .withMessage("profileEmail must be at most 320 characters"),
  body("address").optional().trim().isLength({ max: 5000 }),
  body("jobTitle").optional().trim().isLength({ max: 200 }),
  body("hireDate").optional({ nullable: true }),
  body("emergencyContact").optional().trim().isLength({ max: 5000 }),
  body("employmentStatus")
    .optional()
    .trim()
    .custom((v) => ["ACTIVE", "INACTIVE", "active", "inactive"].includes(String(v)))
    .withMessage("employmentStatus must be ACTIVE or INACTIVE"),
  body("separationTerminationRecord").optional().trim().isLength({ max: 10000 }),
  body("separationTerminationDate").optional({ nullable: true }),
  body("separationExitNotes").optional().trim().isLength({ max: 10000 }),
  body("separationArchivedPersonnelNote").optional().trim().isLength({ max: 10000 }),
  body("profilePhotoUrl").optional().trim().isLength({ max: 2000 }),
];

module.exports = {
  createStaffMemberValidator,
  staffIdParam,
  staffIdParamNested,
  facilityIdParam,
  listStaffValidator,
  assignFacilityValidator,
  updateStaffProfileValidator,
};
