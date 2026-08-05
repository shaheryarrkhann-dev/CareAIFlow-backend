const express = require('express');
const router = express.Router();

const userController = require('../../controllers/user/user.controller');
const authenticate = require('../../middlewares/auth.middleware');
const {
  requirePermission,
  requireAdminOrSuperAdminForDelete,
} = require('../../middlewares/permission.middleware');
const {
  attachTenantContext,
  enforceTenantIsolation,
} = require('../../middlewares/tenant.middleware');
const validate = require('../../middlewares/validate.middleware');
const { apiLimiter } = require('../../middlewares/rateLimit.middleware');
const { body, param, query } = require('express-validator');
const {
  assignRoleValidator,
  setPrimaryRoleValidator,
  userRoleIdParam,
} = require('../../validators/role.validators');

// All user routes require authentication
router.use(authenticate());
router.use(attachTenantContext);

// Validators
const userIdValidator = [
  param('id').isUUID().withMessage('Valid user ID is required')
];

const updateUserValidator = [
  body('name').optional().isString().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('role').optional().isIn(['STAFF', 'ADMIN', 'GUARDIAN', 'SUPER_ADMIN']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('isEmailVerified').optional().isBoolean().withMessage('isEmailVerified must be a boolean')
];

const paginationValidator = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be at least 1'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('role').optional().isIn(['STAFF', 'ADMIN', 'GUARDIAN', 'SUPER_ADMIN']).withMessage('Invalid role'),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  query('tenantId').optional().isUUID().withMessage('tenantId must be a valid UUID'),
];

/**
 * GET /api/users/stats
 * Get user statistics. Requires: ADMINISTRATION:view_users (aligned with Invite Member / user list)
 */
router.get(
  '/stats',
  requirePermission('ADMINISTRATION', 'view_users'),
  userController.getUserStats
);

/**
 * GET /api/users
 * Get all users (tenant-scoped). Requires: ADMINISTRATION:view_users
 */
router.get(
  '/',
  requirePermission('ADMINISTRATION', 'view_users'),
  enforceTenantIsolation('tenantId'),
  validate(paginationValidator),
  userController.getUsers
);

/**
 * GET /api/users/:id/roles
 * List role assignments for user. Requires: manage_roles permission
 */
router.get(
  '/:id/roles',
  requirePermission('ADMINISTRATION', 'manage_roles'),
  validate(userIdValidator),
  userController.getUserRoles
);

/**
 * POST /api/users/:id/roles
 * Assign role to user. Body: { roleId, isPrimary? }. Requires: manage_roles permission
 */
router.post(
  '/:id/roles',
  apiLimiter,
  requirePermission('ADMINISTRATION', 'manage_roles'),
  validate(userIdValidator),
  validate(assignRoleValidator),
  userController.assignRole
);

/**
 * PATCH /api/users/:id/roles/primary
 * Set primary role. Body: { roleId }. Requires: manage_roles permission
 */
router.patch(
  '/:id/roles/primary',
  requirePermission('ADMINISTRATION', 'manage_roles'),
  validate(userIdValidator),
  validate(setPrimaryRoleValidator),
  userController.setPrimaryRole
);

/**
 * DELETE /api/users/:id/roles/:roleId
 * Unassign role from user. Requires: manage_roles permission
 */
router.delete(
  '/:id/roles/:roleId',
  requirePermission('ADMINISTRATION', 'manage_roles'),
  requireAdminOrSuperAdminForDelete(),
  validate(userIdValidator),
  validate(userRoleIdParam),
  userController.unassignRole
);

/**
 * GET /api/users/:id
 * Get user by ID. Requires: ADMINISTRATION:view_users
 */
router.get(
  '/:id',
  requirePermission('ADMINISTRATION', 'view_users'),
  validate(userIdValidator),
  userController.getUserById
);

/**
 * PATCH /api/users/:id
 * Update user. Requires: ADMINISTRATION:update_user
 */
router.patch(
  '/:id',
  apiLimiter,
  requirePermission('ADMINISTRATION', 'update_user'),
  validate([...userIdValidator, ...updateUserValidator]),
  userController.updateUser
);

/**
 * DELETE /api/users/:id
 * Delete user. Requires: ADMINISTRATION:update_user
 */
router.delete(
  '/:id',
  apiLimiter,
  requirePermission('ADMINISTRATION', 'update_user'),
  requireAdminOrSuperAdminForDelete(),
  validate(userIdValidator),
  userController.deleteUser
);

/**
 * POST /api/users/:id/activate
 * Activate user. Requires: ADMINISTRATION:update_user
 */
router.post(
  '/:id/activate',
  apiLimiter,
  requirePermission('ADMINISTRATION', 'update_user'),
  validate(userIdValidator),
  userController.activateUser
);

/**
 * POST /api/users/:id/deactivate
 * Deactivate user. Requires: ADMINISTRATION:update_user
 */
router.post(
  '/:id/deactivate',
  apiLimiter,
  requirePermission('ADMINISTRATION', 'update_user'),
  validate(userIdValidator),
  userController.deactivateUser
);

/**
 * POST /api/users/:id/resend-invitation
 * Resend invitation email. Requires: ADMINISTRATION:invite_user
 */
router.post(
  '/:id/resend-invitation',
  apiLimiter,
  requirePermission('ADMINISTRATION', 'invite_user'),
  validate(userIdValidator),
  userController.resendInvitation
);

module.exports = router;




