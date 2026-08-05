const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const prisma = require("../../lib/prisma");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signResetPasswordToken,
  verifyResetPasswordToken,
  signEmailVerificationToken,
  verifyEmailVerificationToken,
  signPasswordChangeToken,
  verifyPasswordChangeToken,
} = require("../../utils/jwt.util");
const {
  sendPasswordResetEmail,
  sendUserInvitationEmail,
  sendPasswordChangedEmail,
} = require("../../utils/email.util");
const { userHasAccessToTenant } = require("../../lib/tenantAccess");

/**
 * Login user
 */
async function login({ email, password, tenantId }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      tenant: true,
    },
  });

  if (!user || !user.isActive) {
    throw new Error("Invalid credentials");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  // Check if user is SUPER_ADMIN
  const isSuperAdmin = user.role === "SUPER_ADMIN";

  // Determine tenant and role
  let selectedTenant = null;
  let selectedRole = user.role;

  if (isSuperAdmin) {
    // SUPER_ADMIN can access all tenants
    selectedTenant = tenantId || null;
  } else {
    // Regular user must belong to a tenant
    if (!user.tenantId) {
      throw new Error("User is not associated with any organization");
    }

    // Verify tenant is active
    if (user.tenant && !user.tenant.isActive) {
      throw new Error("Your organization is inactive. Please contact support.");
    }

    selectedTenant = user.tenantId;
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: selectedRole,
    tenantId: selectedTenant,
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    tenantId: selectedTenant,
  });

  const decoded = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      tenantId: selectedTenant,
      expiresAt,
    },
  });

  // Remove password hash from response
  const { passwordHash, ...userWithoutPassword } = user;

  const tenants = await getTenantsForUser(user.id);

  return {
    user: userWithoutPassword,
    accessToken,
    refreshToken,
    tenants,
  };
}

/**
 * Refresh access token
 */
async function refreshAccessToken(oldRefreshToken) {
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: oldRefreshToken },
    include: {
      user: true,
    },
  });

  if (!storedToken || storedToken.revoked) {
    throw new Error("Invalid refresh token");
  }

  if (new Date() > storedToken.expiresAt) {
    throw new Error("Refresh token expired");
  }

  const decoded = verifyRefreshToken(oldRefreshToken);

  // Use user's role
  const role = storedToken.user.role;

  // Issue new tokens
  const accessToken = signAccessToken({
    sub: decoded.sub,
    email: storedToken.user.email,
    role: role,
    tenantId: decoded.tenantId,
  });

  const newRefreshToken = signRefreshToken({
    sub: decoded.sub,
    tenantId: decoded.tenantId,
  });

  const newDecoded = verifyRefreshToken(newRefreshToken);
  const expiresAt = new Date(newDecoded.exp * 1000);

  // Revoke old token and create new one in transaction
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: decoded.sub,
        tenantId: decoded.tenantId,
        expiresAt,
      },
    }),
  ]);

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Logout user (revoke refresh token)
 */
async function logout(refreshToken) {
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken },
    data: { revoked: true },
  });

  return { success: true, message: "Logged out successfully" };
}

/**
 * Parse optional date of birth for profile update (null clears).
 * @param {unknown} value
 * @returns {Date|null}
 */
function parseProfileDateOfBirth(value) {
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid date of birth");
    err.status = 400;
    throw err;
  }
  return d;
}

/**
 * Update current user's profile (self-service).
 * @param {string} userId
 * @param {{ name?: string, dateOfBirth?: string | null }} payload
 */
async function updateMyProfile(userId, payload) {
  const { name, dateOfBirth, phone } = payload;
  if (name === undefined && dateOfBirth === undefined && phone === undefined) {
    const err = new Error("Provide at least one of: name, dateOfBirth, phone");
    err.status = 400;
    throw err;
  }

  const data = {};
  if (name !== undefined) {
    data.name = String(name).trim();
  }
  if (dateOfBirth !== undefined) {
    data.dateOfBirth = parseProfileDateOfBirth(dateOfBirth);
  }
  if (phone !== undefined) {
    data.phone = phone === null || phone === '' ? null : String(phone).trim();
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
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

  const { passwordHash, ...userWithoutPassword } = updated;
  return userWithoutPassword;
}

/**
 * Get list of tenants (and first facility per tenant) the user can access. For facility/tenant switcher.
 * @param {string} userId
 * @returns {Promise<Array<{ tenantId, tenantName, slug, facilityId?, facilityName? }>>}
 */
async function getTenantsForUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, role: true },
  });
  if (!user) return [];

  if (user.role === "SUPER_ADMIN") {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        facilities: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
    return tenants.map((t) => ({
      tenantId: t.id,
      tenantName: t.name,
      slug: t.slug,
      facilityId: t.facilities[0]?.id ?? null,
      facilityName: t.facilities[0]?.name ?? t.name,
    }));
  }

  const userTenants = await prisma.userTenant.findMany({
    where: { userId },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          facilities: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
        },
      },
    },
  });

  const list = userTenants
    .filter((ut) => ut.tenant?.isActive)
    .map((ut) => ({
      tenantId: ut.tenant.id,
      tenantName: ut.tenant.name,
      slug: ut.tenant.slug,
      facilityId: ut.tenant.facilities[0]?.id ?? null,
      facilityName: ut.tenant.facilities[0]?.name ?? ut.tenant.name,
    }));

  if (list.length > 0) return list;
  if (user.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        facilities: { take: 1, orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
      },
    });
    if (tenant?.isActive) {
      return [
        {
          tenantId: tenant.id,
          tenantName: tenant.name,
          slug: tenant.slug,
          facilityId: tenant.facilities[0]?.id ?? null,
          facilityName: tenant.facilities[0]?.name ?? tenant.name,
        },
      ];
    }
  }
  return [];
}

/**
 * Switch active tenant (for users with multiple tenants/facilities).
 * Issues new tokens with the selected tenantId. Optionally rotates refresh token if provided.
 * @param {string} userId - Current user id
 * @param {string} tenantId - Tenant to switch to
 * @param {string} [refreshToken] - Optional current refresh token; if provided, it is revoked and new one returned
 * @returns {Promise<{ accessToken, refreshToken?, user }>}
 */
async function switchTenant(userId, tenantId, refreshToken) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  });
  if (!user || !user.isActive) {
    throw new Error("User not found or inactive");
  }

  const isSuperAdmin = user.role === "SUPER_ADMIN";
  let role = user.role;
  let hasAccess = false;

  if (isSuperAdmin) {
    hasAccess = true;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, isActive: true },
    });
    if (!tenant) throw new Error("Tenant not found");
    if (!tenant.isActive) throw new Error("Tenant is inactive");
    role = user.role;
  } else {
    const userTenant = await prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
      include: { tenant: true },
    });
    if (userTenant) {
      hasAccess = true;
      role = userTenant.role;
      if (!userTenant.tenant?.isActive) {
        throw new Error("Tenant is inactive");
      }
    }
    if (!hasAccess && user.tenantId === tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { isActive: true },
      });
      if (tenant?.isActive) {
        hasAccess = true;
      }
    }
  }

  if (!hasAccess) {
    throw new Error("You do not have access to this organization");
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role,
    tenantId,
  });

  let newRefreshToken = null;
  if (refreshToken) {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    if (storedToken && !storedToken.revoked && storedToken.userId === userId) {
      newRefreshToken = signRefreshToken({ sub: user.id, tenantId });
      const newDecoded = verifyRefreshToken(newRefreshToken);
      const expiresAt = new Date(newDecoded.exp * 1000);
      await prisma.$transaction([
        prisma.refreshToken.update({
          where: { id: storedToken.id },
          data: { revoked: true },
        }),
        prisma.refreshToken.create({
          data: {
            token: newRefreshToken,
            userId: user.id,
            tenantId,
            expiresAt,
          },
        }),
      ]);
    }
  }

  const { passwordHash, ...userWithoutPassword } = user;
  return {
    accessToken,
    ...(newRefreshToken && { refreshToken: newRefreshToken }),
    user: userWithoutPassword,
  };
}

/**
 * Request password reset
 */
async function forgotPassword(email) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    // Don't reveal if user exists
    return {
      success: true,
      message:
        "If an account with that email exists, a password reset link has been sent",
    };
  }

  const resetToken = signResetPasswordToken({
    sub: user.id,
    email: user.email,
    type: "password-reset",
  });

  const decoded = verifyResetPasswordToken(resetToken);
  const expiresAt = new Date(decoded.exp * 1000);

  // Store reset token in database
  await prisma.passwordResetToken.create({
    data: {
      token: resetToken,
      userId: user.id,
      expiresAt,
    },
  });

  // Send email
  await sendPasswordResetEmail(user.email, resetToken, user.name);

  return {
    success: true,
    message:
      "If an account with that email exists, a password reset link has been sent",
  };
}

/**
 * Reset password using token
 */
async function resetPassword(token, newPassword) {
  const storedToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!storedToken || storedToken.used) {
    throw new Error("Invalid or expired reset token");
  }

  if (new Date() > storedToken.expiresAt) {
    throw new Error("Reset token has expired");
  }

  const decoded = verifyResetPasswordToken(token);
  if (decoded.type !== "password-reset") {
    throw new Error("Invalid token type");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password and mark token as used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: storedToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: storedToken.id },
      data: { used: true },
    }),
    // Revoke all refresh tokens for security
    prisma.refreshToken.updateMany({
      where: { userId: storedToken.userId },
      data: { revoked: true },
    }),
  ]);

  // Send notification email
  await sendPasswordChangedEmail(storedToken.user.email, storedToken.user.name);

  return {
    success: true,
    message: "Password has been reset successfully",
  };
}

/**
 * Set initial password after email verification
 * Uses password change token (no current password required)
 */
async function setInitialPassword(token, newPassword) {
  // Verify the password change token
  let decoded;
  try {
    decoded = verifyPasswordChangeToken(token);
    if (decoded.type !== "password-change") {
      throw new Error("Invalid token type");
    }
  } catch (err) {
    throw new Error("Invalid or expired password change token");
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password and revoke all refresh tokens for security
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    // Revoke all refresh tokens for security
    prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revoked: true },
    }),
  ]);

  // Send notification email
  await sendPasswordChangedEmail(user.email, user.name);

  return {
    success: true,
    message: "Password has been set successfully. You can now login.",
  };
}

/**
 * Invite user to organization
 * Only ADMIN and SUPER_ADMIN can invite users
 */
function parseOptionalInviteDateOfBirth(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (s === "") return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date of birth");
  }
  return d;
}

async function inviteUser({
  email,
  name,
  role,
  tenantId,
  invitedBy,
  defaultRoleId,
  dateOfBirth,
}) {
  const inviter = await prisma.user.findUnique({
    where: { id: invitedBy },
  });

  if (!inviter) {
    throw new Error("Inviter not found");
  }

  const isSuperAdmin = inviter.role === "SUPER_ADMIN";
  const isAdmin = inviter.role === "ADMIN";
  const hasTenantLink =
    isAdmin &&
    (await userHasAccessToTenant(
      inviter.id,
      inviter.tenantId || null,
      tenantId,
    ));

  if (!isSuperAdmin && !(isAdmin && hasTenantLink)) {
    throw new Error(
      "You do not have permission to invite users to this organization",
    );
  }

  // Ensure tenant exists and is active
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error("Organization not found");
  }

  if (!tenant.isActive) {
    throw new Error("Cannot invite users to inactive organization");
  }

  // Validate defaultRoleId before creating user (fail fast)
  if (defaultRoleId) {
    const defaultRole = await prisma.customRole.findUnique({
      where: { id: defaultRoleId },
      select: { id: true, tenantId: true, isSystemTemplate: true },
    });
    if (!defaultRole) {
      throw new Error("Default role not found");
    }
    // Allow system templates (global roles available to all tenants) or tenant-specific roles
    if (!defaultRole.isSystemTemplate && defaultRole.tenantId !== tenantId) {
      throw new Error(
        "Default role does not belong to the selected organization",
      );
    }
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("User with this email already exists");
  }

  // Generate temporary password for new user
  const temporaryPassword = nanoid(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const dob = parseOptionalInviteDateOfBirth(dateOfBirth);
  const userCreateData = {
    email,
    passwordHash,
    name,
    tenantId,
    role: role || "STAFF",
    isActive: true,
    isEmailVerified: false,
  };
  if (dob !== undefined) {
    userCreateData.dateOfBirth = dob;
  }

  // Create user
  const newUser = await prisma.user.create({
    data: userCreateData,
  });

  // Generate email verification token (include temporary password for password change flow)
  const verificationToken = signEmailVerificationToken({
    sub: newUser.id,
    email: newUser.email,
    type: "email-verification",
    tempPassword: temporaryPassword, // Include temporary password in token
  });

  const decoded = verifyEmailVerificationToken(verificationToken);
  const expiresAt = new Date(decoded.exp * 1000);

  // Store verification token
  await prisma.passwordResetToken.create({
    data: {
      token: verificationToken,
      userId: newUser.id,
      expiresAt,
    },
  });

  // Send invitation email with verification link
  await sendUserInvitationEmail(
    email,
    inviter.name,
    temporaryPassword,
    tenant.name,
    verificationToken,
  );

  // Optionally assign a default custom role
  if (defaultRoleId) {
    const customRole = await prisma.customRole.findUnique({
      where: { id: defaultRoleId },
      select: { id: true, tenantId: true, isSystemTemplate: true },
    });
    if (
      customRole &&
      (customRole.isSystemTemplate || customRole.tenantId === tenantId)
    ) {
      await prisma.userRoleAssignment.create({
        data: {
          userId: newUser.id,
          roleId: customRole.id,
          tenantId,
          isPrimary: true,
          assignedBy: invitedBy,
        },
      });
    }
  }

  const { passwordHash: _, ...userWithoutPassword } = newUser;

  return {
    success: true,
    message: "User invited successfully. Please check email to verify.",
    user: userWithoutPassword,
  };
}

/**
 * Verify user email
 */
async function verifyEmail(token) {
  const storedToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!storedToken || storedToken.used) {
    throw new Error("Invalid or expired verification token");
  }

  if (new Date() > storedToken.expiresAt) {
    throw new Error("Verification token has expired");
  }

  const decoded = verifyEmailVerificationToken(token);
  if (decoded.type !== "email-verification") {
    throw new Error("Invalid token type");
  }

  // Update user email verification status and mark token as used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: storedToken.userId },
      data: { isEmailVerified: true },
    }),
    prisma.passwordResetToken.update({
      where: { id: storedToken.id },
      data: { used: true },
    }),
  ]);

  // Extract temporary password from token (if available)
  // Only return password change token for newly invited users (who have tempPassword)
  const tempPassword = decoded.tempPassword || null;

  let passwordChangeToken = null;
  if (tempPassword) {
    // Generate password change token only for newly invited users
    passwordChangeToken = signPasswordChangeToken({
      sub: storedToken.userId,
      email: storedToken.user.email,
      tempPassword: tempPassword, // Include temporary password for pre-filling
    });
  }

  return {
    success: true,
    message: tempPassword
      ? "Email verified successfully. Please set your password."
      : "Email verified successfully. You can now login.",
    ...(passwordChangeToken && { passwordChangeToken }),
    ...(tempPassword && { tempPassword }), // Return temp password for pre-filling (optional, can be extracted from token)
  };
}

module.exports = {
  login,
  refreshAccessToken,
  logout,
  getTenantsForUser,
  switchTenant,
  forgotPassword,
  resetPassword,
  inviteUser,
  verifyEmail,
  setInitialPassword,
  updateMyProfile,
};
