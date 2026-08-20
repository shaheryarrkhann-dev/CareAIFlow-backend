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
  sendExistingUserOrgInviteEmail,
  sendPasswordChangedEmail,
  sendEmailVerificationEmail,
} = require("../../utils/email.util");
const { userHasAccessToTenant } = require("../../lib/tenantAccess");
const {
  storeAuthToken,
  findAuthToken,
} = require("../../utils/token-hash.util");

/**
 * Issue access + refresh tokens for a user (optional active tenant).
 */
async function issueSessionTokens(user, selectedTenant = null) {
  const selectedRole = user.role;
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

  return { accessToken, refreshToken };
}

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

  // Determine tenant
  let selectedTenant = null;

  if (isSuperAdmin) {
    // SUPER_ADMIN can access all tenants
    selectedTenant = tenantId || null;
  } else if (!user.tenantId) {
    // Self-serve onboarding: account exists before org bootstrap
    selectedTenant = null;
  } else {
    // Verify tenant is active
    if (user.tenant && !user.tenant.isActive) {
      throw new Error("Your organization is inactive. Please contact support.");
    }

    selectedTenant = user.tenantId;
  }

  const { accessToken, refreshToken } = await issueSessionTokens(
    user,
    selectedTenant,
  );

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
  await storeAuthToken(prisma, {
    rawToken: resetToken,
    userId: user.id,
    expiresAt,
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
  const storedToken = await findAuthToken(prisma, token, {
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

function inviteRoleLabel(role) {
  switch (String(role || "").toUpperCase()) {
    case "ADMIN":
      return "Facility Administrator";
    case "GUARDIAN":
      return "Guardian";
    case "STAFF":
      return "Caregiver / Staff";
    default:
      return "Team member";
  }
}

async function buildInvitePreviewPayload({
  user,
  tenantId,
  role,
  invitedByName,
  inviteKind,
  expiresAt,
}) {
  const tenant = tenantId
    ? await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true },
      })
    : null;

  const facilities = tenantId
    ? await prisma.facility.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
        take: 20,
      })
    : [];

  return {
    success: true,
    inviteKind: inviteKind || "new",
    email: user.email,
    name: user.name,
    role: role || user.role,
    roleLabel: inviteRoleLabel(role || user.role),
    invitedByName: invitedByName || null,
    organization: tenant
      ? { id: tenant.id, name: tenant.name }
      : null,
    facilities,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    emailVerified: Boolean(user.isEmailVerified),
  };
}

/**
 * Public preview for /accept-invite — shows org/role before joining.
 * Does not consume the token.
 */
async function getInvitePreview(token) {
  if (!token) {
    throw Object.assign(new Error("Invitation token is required"), {
      status: 400,
    });
  }

  let decoded;
  try {
    decoded = verifyEmailVerificationToken(token);
  } catch {
    throw Object.assign(
      new Error("This invitation link is invalid or has expired."),
      { status: 400, code: "INVITE_INVALID" },
    );
  }

  if (decoded.type !== "email-verification") {
    throw Object.assign(new Error("Invalid invitation token"), {
      status: 400,
      code: "INVITE_INVALID",
    });
  }

  const inviteKind = decoded.inviteKind || (decoded.tempPassword ? "new" : "existing");

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
  });
  if (!user || !user.isActive) {
    throw Object.assign(new Error("This invitation is no longer valid."), {
      status: 400,
      code: "INVITE_INVALID",
    });
  }

  const stored = await findAuthToken(prisma, token);

  if (inviteKind === "new") {
    if (!stored) {
      throw Object.assign(
        new Error("This invitation link is invalid or has already been used."),
        { status: 400, code: "INVITE_INVALID" },
      );
    }
    if (stored.used) {
      throw Object.assign(
        new Error(
          "This invitation has already been accepted. Please sign in.",
        ),
        { status: 400, code: "INVITE_USED" },
      );
    }
    if (new Date() > stored.expiresAt) {
      throw Object.assign(
        new Error(
          "This invitation has expired. Ask your administrator to send a new invite.",
        ),
        { status: 400, code: "INVITE_EXPIRED" },
      );
    }
  } else if (stored && new Date() > stored.expiresAt) {
    throw Object.assign(
      new Error(
        "This invitation has expired. Ask your administrator to send a new invite.",
      ),
      { status: 400, code: "INVITE_EXPIRED" },
    );
  }

  const tenantId = decoded.tenantId || user.tenantId;
  const role = decoded.role || user.role;
  const expiresAt = stored?.expiresAt || (decoded.exp ? decoded.exp * 1000 : null);

  return buildInvitePreviewPayload({
    user,
    tenantId,
    role,
    invitedByName: decoded.invitedByName || null,
    inviteKind,
    expiresAt,
  });
}

/**
 * Accept staff invite: verify email + set password + issue session.
 */
async function acceptInvite({ token, password, name }) {
  if (!token || !password) {
    throw Object.assign(new Error("Invitation token and password are required"), {
      status: 400,
    });
  }

  let decoded;
  try {
    decoded = verifyEmailVerificationToken(token);
  } catch {
    throw Object.assign(
      new Error("This invitation link is invalid or has expired."),
      { status: 400, code: "INVITE_INVALID" },
    );
  }

  if (decoded.type !== "email-verification") {
    throw Object.assign(new Error("Invalid invitation token"), {
      status: 400,
      code: "INVITE_INVALID",
    });
  }

  const inviteKind = decoded.inviteKind || (decoded.tempPassword ? "new" : "existing");
  if (inviteKind === "existing") {
    throw Object.assign(
      new Error(
        "Your account already exists. Sign in with your current password to access this organization.",
      ),
      { status: 400, code: "INVITE_EXISTING_SIGN_IN" },
    );
  }

  const stored = await findAuthToken(prisma, token, {
    include: { user: true },
  });

  if (!stored || stored.used) {
    throw Object.assign(
      new Error(
        "This invitation link is invalid or has already been used.",
      ),
      { status: 400, code: "INVITE_INVALID" },
    );
  }
  if (new Date() > stored.expiresAt) {
    throw Object.assign(
      new Error(
        "This invitation has expired. Ask your administrator to send a new invite.",
      ),
      { status: 400, code: "INVITE_EXPIRED" },
    );
  }

  const trimmedName =
    typeof name === "string" && name.trim().length >= 2
      ? name.trim().slice(0, 120)
      : null;

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: stored.userId },
      data: {
        isEmailVerified: true,
        passwordHash,
        ...(trimmedName ? { name: trimmedName } : {}),
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: stored.id },
      data: { used: true },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId },
      data: { revoked: true },
    }),
  ]);

  const freshUser = await prisma.user.findUnique({
    where: { id: stored.userId },
  });
  const session = await issueSessionTokens(
    freshUser,
    freshUser.tenantId || decoded.tenantId || null,
  );
  const tenants = await getTenantsForUser(freshUser.id);
  const { passwordHash: _, ...userWithoutPassword } = freshUser;

  return {
    success: true,
    message: "Welcome! Your account is ready.",
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: userWithoutPassword,
    tenants,
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

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const inviteRole = role || "STAFF";

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    if (existingUser.id === invitedBy) {
      throw new Error(
        "You cannot invite yourself — use a teammate’s work email instead.",
      );
    }

    const alreadyLinked = await prisma.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId: existingUser.id,
          tenantId,
        },
      },
    });
    if (
      alreadyLinked ||
      existingUser.tenantId === tenantId
    ) {
      throw new Error(
        "This person is already a member of this organization.",
      );
    }

    // Existing account elsewhere: attach to this org (keep their password).
    await prisma.userTenant.upsert({
      where: {
        userId_tenantId: {
          userId: existingUser.id,
          tenantId,
        },
      },
      create: {
        userId: existingUser.id,
        tenantId,
        role: inviteRole,
        isPrimary: !existingUser.tenantId,
      },
      update: {
        role: inviteRole,
      },
    });

    if (!existingUser.tenantId) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { tenantId, role: inviteRole },
      });
    }

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
            userId: existingUser.id,
            roleId: customRole.id,
            tenantId,
            isPrimary: true,
            assignedBy: invitedBy,
          },
        });
      }
    }

    const noticeToken = signEmailVerificationToken({
      sub: existingUser.id,
      email: existingUser.email,
      inviteKind: "existing",
      tenantId,
      role: inviteRole,
      invitedByName: inviter.name,
    });
    const noticeDecoded = verifyEmailVerificationToken(noticeToken);
    await storeAuthToken(prisma, {
      rawToken: noticeToken,
      userId: existingUser.id,
      expiresAt: new Date(noticeDecoded.exp * 1000),
    });

    await sendExistingUserOrgInviteEmail(
      normalizedEmail,
      inviter.name,
      tenant.name,
      inviteRoleLabel(inviteRole),
      noticeToken,
    );

    const { passwordHash: _pw, ...userWithoutPassword } = existingUser;
    return {
      success: true,
      message:
        "Existing account added to this organization. They can sign in with their current password.",
      user: userWithoutPassword,
      existingUser: true,
    };
  }

  // Generate temporary password for new user
  const temporaryPassword = nanoid(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const dob = parseOptionalInviteDateOfBirth(dateOfBirth);
  const userCreateData = {
    email: normalizedEmail,
    passwordHash,
    name,
    tenantId,
    role: inviteRole,
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

  await prisma.userTenant.create({
    data: {
      userId: newUser.id,
      tenantId,
      role: inviteRole,
      isPrimary: true,
    },
  });

  // Generate email verification token (include temporary password for password change flow)
  const verificationToken = signEmailVerificationToken({
    sub: newUser.id,
    email: newUser.email,
    tempPassword: temporaryPassword,
    inviteKind: "new",
    tenantId,
    role: inviteRole,
    invitedByName: inviter.name,
  });

  const decoded = verifyEmailVerificationToken(verificationToken);
  const expiresAt = new Date(decoded.exp * 1000);

  // Store verification token
  await storeAuthToken(prisma, {
    rawToken: verificationToken,
    userId: newUser.id,
    expiresAt,
  });

  // Send invitation email with accept-invite link
  await sendUserInvitationEmail(
    normalizedEmail,
    inviter.name,
    temporaryPassword,
    tenant.name,
    verificationToken,
    inviteRoleLabel(inviteRole),
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
  const storedToken = await findAuthToken(prisma, token, {
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

  // Self-serve signup (no invite temp password): issue session so onboarding can continue
  let accessToken = null;
  let refreshToken = null;
  let userWithoutPassword = null;
  if (!tempPassword) {
    const freshUser = await prisma.user.findUnique({
      where: { id: storedToken.userId },
    });
    const session = await issueSessionTokens(freshUser, freshUser.tenantId || null);
    accessToken = session.accessToken;
    refreshToken = session.refreshToken;
    const { passwordHash: _, ...rest } = freshUser;
    userWithoutPassword = rest;
  }

  return {
    success: true,
    message: tempPassword
      ? "Email verified successfully. Please set your password."
      : "Email verified successfully. You can now continue setup.",
    ...(passwordChangeToken && { passwordChangeToken }),
    ...(tempPassword && { tempPassword }),
    ...(accessToken && { accessToken, refreshToken, user: userWithoutPassword }),
  };
}

/**
 * Self-serve registration for subscription onboarding.
 * Creates user with chosen password (no tenant yet) and sends verification email.
 */
async function register({ email, password, name, phone }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const trimmedName = String(name || "").trim();

  if (!normalizedEmail || !trimmedName || !password) {
    throw new Error("Name, email, and password are required");
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    throw new Error("User with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: trimmedName,
      phone: phone?.trim() || null,
      role: "ADMIN",
      tenantId: null,
      isActive: true,
      isEmailVerified: false,
    },
  });

  await createAndSendVerificationEmail(user);

  const { passwordHash: _, ...userWithoutPassword } = user;
  return {
    success: true,
    message: "Account created. Please check your email to verify.",
    user: userWithoutPassword,
  };
}

/**
 * Resend self-serve verification email.
 */
async function resendVerification(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Avoid email enumeration
  if (!user || !user.isActive) {
    return {
      success: true,
      message: "If an account exists for this email, a verification link was sent.",
    };
  }

  if (user.isEmailVerified) {
    return {
      success: true,
      message: "Email is already verified. You can continue setup.",
      alreadyVerified: true,
    };
  }

  await createAndSendVerificationEmail(user);

  return {
    success: true,
    message: "If an account exists for this email, a verification link was sent.",
  };
}

/**
 * Public check whether an email is verified (for onboarding "I've verified" poll).
 */
async function getEmailVerificationStatus(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { isEmailVerified: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return { success: true, verified: false, exists: false };
  }

  return {
    success: true,
    verified: Boolean(user.isEmailVerified),
    exists: true,
  };
}

async function createAndSendVerificationEmail(user) {
  // Invalidate prior unused verification tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: {
      userId: user.id,
      used: false,
      expiresAt: { gt: new Date() },
    },
    data: { used: true },
  });

  const verificationToken = signEmailVerificationToken({
    sub: user.id,
    email: user.email,
    type: "email-verification",
  });

  const decoded = verifyEmailVerificationToken(verificationToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await storeAuthToken(prisma, {
    rawToken: verificationToken,
    userId: user.id,
    expiresAt,
  });

  await sendEmailVerificationEmail(user.email, user.name, verificationToken);
}

module.exports = {
  login,
  register,
  resendVerification,
  getEmailVerificationStatus,
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
  getInvitePreview,
  acceptInvite,
  createAndSendVerificationEmail,
};
