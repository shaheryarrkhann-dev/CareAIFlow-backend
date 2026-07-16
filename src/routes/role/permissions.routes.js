const express = require("express");
const router = express.Router();
const authenticate = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const validate = require("../../middlewares/validate.middleware");
const permissionController = require("../../controllers/role/permission.controller");
const { listPermissionsQuery } = require("../../validators/role.validators");

/** List permissions is used by Roles & Permissions UI - require manage_roles */
router.use(authenticate());
router.use(requirePermission("ADMINISTRATION", "manage_roles"));

/**
 * GET /api/permissions
 * List all permissions, optionally filter by module (e.g. ?module=RESIDENTS)
 */
router.get(
  "/",
  validate(listPermissionsQuery),
  permissionController.listPermissions
);

module.exports = router;
