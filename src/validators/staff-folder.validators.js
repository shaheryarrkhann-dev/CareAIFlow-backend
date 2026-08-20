const { body, param } = require("express-validator");

const staffIdParam = [
  param("staffId").isUUID().withMessage("Staff ID must be a valid UUID"),
];

const folderIdParam = [
  param("id").isUUID().withMessage("Folder ID must be a valid UUID"),
];

const createFolderValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 255 })
    .withMessage("Name must not exceed 255 characters"),
  body("parentId")
    .optional()
    .isUUID()
    .withMessage("Parent ID must be a valid UUID"),
  body("size")
    .optional()
    .isIn(["SMALL", "MEDIUM", "LARGE"])
    .withMessage("Size must be SMALL, MEDIUM, or LARGE"),
  body("color")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Color must not exceed 50 characters"),
  body("password")
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage("Password must not exceed 200 characters"),
];

const updateFolderValidator = [
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
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Color must not exceed 50 characters"),
  body("password")
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage("Password must not exceed 200 characters"),
  body("currentPassword")
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage("Current password must not exceed 200 characters"),
];

module.exports = {
  staffIdParam,
  folderIdParam,
  createFolderValidator,
  updateFolderValidator,
};
