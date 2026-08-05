const express = require("express");
const router = express.Router();
const multer = require("multer");

const authController = require("../../controllers/auth/auth.controller");
const authenticate = require("../../middlewares/auth.middleware");
const {
  authorize,
  checkTenantAccess,
} = require("../../middlewares/rbac.middleware");
const validate = require("../../middlewares/validate.middleware");
const {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
} = require("../../middlewares/rateLimit.middleware");
const {
  loginValidator,
  refreshTokenValidator,
  logoutValidator,
  switchTenantValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  setInitialPasswordValidator,
  inviteUserValidator,
  updateMyProfileValidator,
} = require("../../validators/auth.validators");

/**
 * POST /api/auth/login
 * Login user
 * Rate limited: 5 attempts per 15 minutes
 */
router.post(
  "/login",
  authLimiter,
  validate(loginValidator),
  authController.login
);

/**
 * POST /api/auth/refresh-token
 * Refresh access token
 */
router.post(
  "/refresh-token",
  validate(refreshTokenValidator),
  authController.refreshToken
);

/**
 * POST /api/auth/logout
 * Logout user (revoke refresh token)
 */
router.post("/logout", validate(logoutValidator), authController.logout);

/**
 * POST /api/auth/switch-tenant
 * Switch active tenant (facility/account). Returns new access token and optionally new refresh token.
 * Requires authentication.
 */
router.post(
  "/switch-tenant",
  authenticate(),
  validate(switchTenantValidator),
  authController.switchTenant
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 * Rate limited: 3 attempts per hour
 */
router.post(
  "/forgot-password",
  passwordResetLimiter,
  validate(forgotPasswordValidator),
  authController.forgotPassword
);

/**
 * POST /api/auth/reset-password
 * Reset password using token
 * Rate limited: 5 attempts per 15 minutes
 */
router.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordValidator),
  authController.resetPassword
);

/**
 * POST /api/auth/invite-user
 * Invite new user to organization
 * Requires: ADMIN or SUPER_ADMIN role
 * Rate limited: 5 attempts per 15 minutes
 */
router.post(
  "/invite-user",
  authLimiter,
  authenticate(),
  authorize("ADMIN", "SUPER_ADMIN"),
  checkTenantAccess,
  validate(inviteUserValidator),
  authController.inviteUser
);

/**
 * GET /api/auth/verify-email
 * Verify user email with token from invitation email
 * Public endpoint (no authentication required)
 */
router.get("/verify-email", authController.verifyEmail);

/**
 * POST /api/auth/set-initial-password
 * Set initial password after email verification
 * Public endpoint (no authentication required, uses token)
 * Rate limited: 5 attempts per 15 minutes
 */
router.post(
  "/set-initial-password",
  authLimiter,
  validate(setInitialPasswordValidator),
  authController.setInitialPassword
);

/**
 * GET /api/auth/me
 * Get current authenticated user
 * Requires: Valid access token
 */
router.get("/me", authenticate(), authController.me);

/**
 * PATCH /api/auth/me
 * Update own profile (name, date of birth). Rate limited.
 */
router.patch(
  "/me",
  apiLimiter,
  authenticate(),
  validate(updateMyProfileValidator),
  authController.updateMe
);

/**
 * POST /api/auth/me/avatar
 * Upload profile avatar image. Max 5MB, images only.
 */
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post("/me/avatar", apiLimiter, authenticate(), avatarUpload.single("avatar"), authController.uploadAvatar);

/**
 * GET /api/auth/me/tenants
 * List tenants (and first facility per tenant) the user can access. For facility switcher.
 */
router.get("/me/tenants", authenticate(), authController.getMyTenants);

module.exports = router;
