const { body, param, query } = require("express-validator");

const roleIdParam = [
  param("id").isUUID().withMessage("Valid role ID is required"),
];

const createRoleValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Role name is required")
    .isLength({ min: 1, max: 255 })
    .withMessage("Role name must be between 1 and 255 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Description must not exceed 2000 characters"),
  body("tenantId")
    .optional()
    .isUUID()
    .withMessage("Invalid tenant ID"),
];

const updateRoleValidator = [
  ...roleIdParam,
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Role name cannot be empty")
    .isLength({ min: 1, max: 255 })
    .withMessage("Role name must be between 1 and 255 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage("Description must not exceed 2000 characters"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
];

const setPermissionsValidator = [
  ...roleIdParam,
  body("permissionIds")
    .isArray()
    .withMessage("permissionIds must be an array"),
  body("permissionIds.*")
    .isUUID()
    .withMessage("Each permission ID must be a valid UUID"),
];

const listPermissionsQuery = [
  query("module").optional().trim().isLength({ max: 100 }).withMessage("Module filter must be a string"),
];

const listRolesQuery = [
  query("tenantId").optional().isUUID().withMessage("Invalid tenant ID"),
  query("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
];

const fromTemplateValidator = [
  body("templateRoleId")
    .isUUID()
    .withMessage("Valid template role ID is required"),
  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Name must be between 1 and 255 characters"),
  body("tenantId").optional().isUUID().withMessage("Invalid tenant ID"),
];

const assignRoleValidator = [
  body("roleId").isUUID().withMessage("Valid role ID is required"),
  body("isPrimary").optional().isBoolean().withMessage("isPrimary must be a boolean"),
];

const setPrimaryRoleValidator = [
  body("roleId").isUUID().withMessage("Valid role ID is required"),
];

const userRoleIdParam = [
  param("roleId").isUUID().withMessage("Valid role ID is required"),
];

module.exports = {
  roleIdParam,
  createRoleValidator,
  updateRoleValidator,
  setPermissionsValidator,
  listPermissionsQuery,
  listRolesQuery,
  fromTemplateValidator,
  assignRoleValidator,
  setPrimaryRoleValidator,
  userRoleIdParam,
};
