const { validationResult } = require("express-validator");
const authService = require("../../services/auth/auth.service");
const auditService = require("../../services/compliance/audit.service");
const { uploadUserAvatarToS3, buildPublicS3ObjectUrl, deleteFileFromS3 } = require("../../utils/s3.util");
const prisma = require("../../lib/prisma");

/**
 * Handle validation errors
 */
function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const msg = first.msg || "Validation error";
    const field = first.param;
    const error = new Error(`${msg}${field ? ` (${field})` : ""}`);
    error.status = 400;
    throw error;
  }
}

/**
 * POST /api/auth/login
 * Login user
 */
exports.login = async (req, res, next) => {
  try {
    handleValidation(req);
    const { email, password } = req.body;
    const result = await authService.login({ email, password });

    // Log successful login with full user details (await so IP geo is persisted before response)
    await auditService.createAuditLog({
      userId: result.user.id,
      userName: result.user.name,
      userEmail: result.user.email,
      userRole: result.user.role,
      tenantId: result.user.tenantId,
      action: "LOGIN_SUCCESS",
      resource: "auth",
      method: req.method,
      endpoint: req.originalUrl || req.url,
      statusCode: 200,
      req,
      metadata: {
        loginTime: new Date().toISOString(),
        isEmailVerified: result.user.isEmailVerified,
      },
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    // Log failed login attempt
    const { email } = req.body;
    await auditService.createAuditLog({
      userEmail: email,
      action: "LOGIN_FAILED",
      resource: "auth",
      method: req.method,
      endpoint: req.originalUrl || req.url,
      statusCode: 401,
      req,
      errorMessage: err.message,
      metadata: {
        attemptedEmail: email,
        failureTime: new Date().toISOString(),
      },
    });

    if (!err.status && err.message === "Invalid credentials") {
      err.status = 401;
    }
    next(err);
  }
};

/**
 * POST /api/auth/refresh-token
 * Refresh access token
 */
exports.refreshToken = async (req, res, next) => {
  try {
    handleValidation(req);
    const { refreshToken } = req.body;
    const tokens = await authService.refreshAccessToken(refreshToken);
    return res.json({
      success: true,
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Logout user (revoke refresh token)
 */
exports.logout = async (req, res, next) => {
  try {
    handleValidation(req);
    const { refreshToken } = req.body;
    const result = await authService.logout(refreshToken);

    // Log logout event
    if (req.user) {
      auditService.createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId: req.user.tenantId,
        action: "LOGOUT",
        resource: "auth",
        method: req.method,
        endpoint: req.originalUrl || req.url,
        statusCode: 200,
        req,
        metadata: {
          logoutTime: new Date().toISOString(),
        },
      });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/switch-tenant
 * Switch active tenant (for users with multiple facilities/accounts). Returns new tokens.
 */
exports.switchTenant = async (req, res, next) => {
  try {
    handleValidation(req);
    const { tenantId, refreshToken } = req.body;
    const result = await authService.switchTenant(req.user.id, tenantId, refreshToken);
    return res.json({
      success: true,
      message: "Switched organization successfully",
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    handleValidation(req);
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
exports.resetPassword = async (req, res, next) => {
  try {
    handleValidation(req);
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword(token, newPassword);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/invite-user
 * Invite new user to organization (ADMIN/SUPER_ADMIN only)
 */
exports.inviteUser = async (req, res, next) => {
  try {
    handleValidation(req);
    const { email, name, role, tenantId, defaultRoleId, dateOfBirth } = req.body;
    const result = await authService.inviteUser({
      email,
      name,
      role,
      tenantId,
      invitedBy: req.user.id,
      defaultRoleId: defaultRoleId || undefined,
      dateOfBirth,
    });
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/verify-email
 * Verify user email with token
 */
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    const result = await authService.verifyEmail(token);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/set-initial-password
 * Set initial password after email verification
 */
exports.setInitialPassword = async (req, res, next) => {
  try {
    handleValidation(req);
    const { token, newPassword } = req.body;
    const result = await authService.setInitialPassword(token, newPassword);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Get current authenticated user and effective permissions.
 * Permissions are not embedded in JWT; they are resolved here and on each request
 * by the permission middleware, so they stay in sync after role assignment changes.
 */
/**
 * PATCH /api/auth/me
 * Update current user's name and/or date of birth.
 */
exports.updateMe = async (req, res, next) => {
  try {
    handleValidation(req);
    const user = await authService.updateMyProfile(req.user.id, req.body);
    return res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (err) {
    next(err);
  }
};

exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const { buffer, mimetype, originalname } = req.file;
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: "File too large. Max 5MB." });
    }
    const { s3Key, s3Url } = await uploadUserAvatarToS3({
      userId: req.user.id,
      buffer,
      mimeType: mimetype,
      fileName: originalname,
    });
    // Delete old avatar from S3 if present
    const existing = await prisma.user.findUnique({ where: { id: req.user.id }, select: { avatarS3Key: true } });
    if (existing?.avatarS3Key) {
      await deleteFileFromS3(existing.avatarS3Key).catch(() => {});
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: s3Url, avatarS3Key: s3Key },
      select: { id: true, name: true, email: true, phone: true, avatarUrl: true, role: true },
    });
    return res.json({ success: true, user: updated });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const prisma = require("../../lib/prisma");
    const {
      getEffectivePermissions,
    } = require("../../services/role/permissionResolver.service");

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const { passwordHash, ...userWithoutPassword } = user;

    // Compute effective permissions for this user
    let permissions = [];
    try {
      permissions = await getEffectivePermissions(
        req.user.id,
        req.user.tenantId || null,
        req.user.role,
      );
    } catch (permErr) {
      console.error("Failed to resolve permissions for /me:", permErr?.message);
    }

    return res.json({
      success: true,
      user: userWithoutPassword,
      permissions,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me/tenants
 * List tenants (and first facility) the current user can access. For facility/tenant switcher.
 */
exports.getMyTenants = async (req, res, next) => {
  try {
    const tenants = await authService.getTenantsForUser(req.user.id);
    return res.json({
      success: true,
      tenants,
    });
  } catch (err) {
    next(err);
  }
};
