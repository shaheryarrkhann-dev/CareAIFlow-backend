const { body } = require('express-validator');

/**
 * Login validation
 */
const loginValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isString()
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * Refresh token validation
 */
const refreshTokenValidator = [
  body('refreshToken')
    .isString()
    .notEmpty()
    .withMessage('Refresh token is required')
];

/**
 * Logout validation
 */
const logoutValidator = [
  body('refreshToken')
    .isString()
    .notEmpty()
    .withMessage('Refresh token is required')
];

/**
 * Forgot password validation
 */
const forgotPasswordValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail()
];

/**
 * Reset password validation
 */
const resetPasswordValidator = [
  body('token')
    .isString()
    .notEmpty()
    .withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

/**
 * Set initial password validation (after email verification)
 */
const setInitialPasswordValidator = [
  body('token')
    .isString()
    .notEmpty()
    .withMessage('Password change token is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

/**
 * Invite user validation
 */
const inviteUserValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('name')
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Name must be between 2 and 120 characters'),
  body('role')
    .optional()
    .isIn(['STAFF', 'GUARDIAN', 'ADMIN'])
    .withMessage('Role must be one of: STAFF, GUARDIAN, or ADMIN'),
  body('tenantId')
    .isString()
    .notEmpty()
    .withMessage('Tenant ID is required')
    .isUUID()
    .withMessage('Tenant ID must be a valid UUID'),
  body('dateOfBirth')
    .optional({ nullable: true })
    .trim()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new Error('dateOfBirth must be a valid date');
      }
      return true;
    }),
  body('defaultRoleId')
    .optional()
    .isUUID()
    .withMessage('Default role ID must be a valid UUID')
];

/**
 * Switch tenant validation (for multi-tenant / facility switcher)
 */
const switchTenantValidator = [
  body('tenantId')
    .isString()
    .notEmpty()
    .withMessage('Tenant ID is required')
    .isUUID()
    .withMessage('Tenant ID must be a valid UUID'),
  body('refreshToken')
    .optional()
    .isString()
    .withMessage('Refresh token must be a string')
];

/**
 * PATCH /api/auth/me — update own profile (name, date of birth)
 */
const updateMyProfileValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('Name must be between 2 and 120 characters'),
  body('phone')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone must be at most 30 characters'),
  body('dateOfBirth')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === '' || value === null || value === undefined) return true;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new Error('dateOfBirth must be a valid date');
      }
      return true;
    }),
];

module.exports = {
  loginValidator,
  refreshTokenValidator,
  logoutValidator,
  switchTenantValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  setInitialPasswordValidator,
  inviteUserValidator,
  updateMyProfileValidator,
};
