const { body, param } = require("express-validator");

const residentIdParam = [
  param("residentId")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required")
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),
];

const folderIdParam = [
  ...residentIdParam,
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Folder ID is required")
    .isUUID()
    .withMessage("Folder ID must be a valid UUID"),
];

const createFolderValidator = [
  ...residentIdParam,
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 255 })
    .withMessage("Name must not exceed 255 characters"),
  body("parentId")
    .optional({ nullable: true })
    .isUUID()
    .withMessage("Parent ID must be a valid UUID"),
  body("size")
    .optional()
    .isIn(["SMALL", "MEDIUM", "LARGE"])
    .withMessage("Size must be SMALL, MEDIUM, or LARGE"),
  body("color")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("Color must not exceed 50 characters"),
  body("password")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 200 })
    .withMessage("Password must not exceed 200 characters"),
  body("allowedRoles")
    .optional({ nullable: true })
    .isArray()
    .withMessage("allowedRoles must be an array"),
  body("allowedRoles.*")
    .optional()
    .isIn(["ADMIN", "STAFF", "GUARDIAN"])
    .withMessage("Each role must be ADMIN, STAFF, or GUARDIAN"),
];

const updateFolderValidator = [
  param("residentId")
    .trim()
    .notEmpty()
    .withMessage("Resident ID is required")
    .isUUID()
    .withMessage("Resident ID must be a valid UUID"),
  param("id")
    .trim()
    .notEmpty()
    .withMessage("Folder ID is required")
    .isUUID()
    .withMessage("Folder ID must be a valid UUID"),
  body("name")
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Name must not exceed 255 characters"),
  body("size")
    .optional()
    .isIn(["SMALL", "MEDIUM", "LARGE"])
    .withMessage("Size must be SMALL, MEDIUM, or LARGE"),
  body("color")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("Color must not exceed 50 characters"),
  body("password")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 200 })
    .withMessage("Password must not exceed 200 characters"),
  body("currentPassword")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 200 })
    .withMessage("Current password must not exceed 200 characters"),
  body("allowedRoles")
    .optional({ nullable: true })
    .isArray()
    .withMessage("allowedRoles must be an array"),
  body("allowedRoles.*")
    .optional()
    .isIn(["ADMIN", "STAFF", "GUARDIAN"])
    .withMessage("Each role must be ADMIN, STAFF, or GUARDIAN"),
];

module.exports = {
  residentIdParam,
  folderIdParam,
  createFolderValidator,
  updateFolderValidator,
};
