const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const prisma = require('../../lib/prisma');
const { getTenantFilter } = require('../../middlewares/tenant.middleware');
const { sendUserInvitationEmail } = require('../../utils/email.util');


async function getUsers(user, { page = 1, limit = 10, role = null, search = '', isActive = null, tenantId: tenantIdOverride = null }) {
  const skip = (page - 1) * limit;
  const tenantFilter =
    user.role === "SUPER_ADMIN" && tenantIdOverride
      ? { tenantId: tenantIdOverride }
      : getTenantFilter(user);

  const where = {
    ...tenantFilter,
    ...(role && { role }),
    ...(isActive !== null && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    })
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isEmailVerified: true,
        isActive: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        userRoleAssignments: {
          where: { isPrimary: true },
          take: 1,
          select: {
            role: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    }),
    prisma.user.count({ where })
  ]);

  const usersWithPrimaryRole = users.map((u) => {
    const { userRoleAssignments, ...rest } = u;
    const primary = userRoleAssignments?.[0]?.role;
    return {
      ...rest,
      primaryRoleName: primary?.name ?? null,
      primaryRoleId: primary?.id ?? null
    };
  });

  return {
    users: usersWithPrimaryRole,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get user by ID (tenant-scoped)
 */
async function getUserById(userId, requestingUser) {
  const tenantFilter = getTenantFilter(requestingUser);

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      ...tenantFilter
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isEmailVerified: true,
      isActive: true,
      tenantId: true,
      createdAt: true,
      updatedAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true
        }
      },
      userRoleAssignments: {
        where: { isPrimary: true },
        take: 1,
        select: { role: { select: { id: true, name: true } } }
      }
    }
  });

  if (!user) {
    throw new Error('User not found or access denied');
  }

  const primary = user.userRoleAssignments?.[0]?.role;
  const { userRoleAssignments, ...rest } = user;
  return {
    ...rest,
    primaryRoleName: primary?.name ?? null,
    primaryRoleId: primary?.id ?? null
  };
}

/**
 * Invite new user (tenant-scoped)
 */
async function inviteUser({ email, name, role, invitedBy }) {
  const inviter = await prisma.user.findUnique({
    where: { id: invitedBy },
    include: { tenant: true }
  });

  if (!inviter) {
    throw new Error('Inviter not found');
  }

  // Check permissions
  if (inviter.role !== 'ADMIN' && inviter.role !== 'SUPER_ADMIN') {
    throw new Error('Only ADMIN or SUPER_ADMIN can invite users');
  }

  // Ensure tenant is active
  if (!inviter.tenant.isActive) {
    throw new Error('Cannot invite users to inactive organization');
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Generate temporary password
  const temporaryPassword = nanoid(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  // Create user with inviter's tenant
  const newUser = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: role || 'STAFF',
      tenantId: inviter.tenantId,
      isActive: true,
      isEmailVerified: false
    },
    include: {
      tenant: {
        select: {
          name: true
        }
      }
    }
  });

  // Send invitation email
  try {
    await sendUserInvitationEmail(
      email,
      inviter.name,
      temporaryPassword,
      newUser.tenant.name
    );
  } catch (emailError) {
    console.error('Failed to send invitation email:', emailError);
    // Continue even if email fails
  }

  // Remove password hash from response
  const { passwordHash: _, ...userWithoutPassword } = newUser;

  return {
    user: userWithoutPassword,
    temporaryPassword: process.env.NODE_ENV === 'development' ? temporaryPassword : undefined
  };
}

/**
 * Update user (tenant-scoped)
 */
async function updateUser(userId, updateData, requestingUser) {
  // Check access to user
  const existingUser = await getUserById(userId, requestingUser);

  // Validate role changes
  if (updateData.role) {
    // Only ADMIN and SUPER_ADMIN can change roles
    if (requestingUser.role !== 'ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
      throw new Error('You do not have permission to change user roles');
    }

    // ADMIN cannot create SUPER_ADMIN
    if (updateData.role === 'SUPER_ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
      throw new Error('Only SUPER_ADMIN can create or modify SUPER_ADMIN users');
    }

    // Cannot change own role
    if (userId === requestingUser.id) {
      throw new Error('You cannot change your own role');
    }
  }

  // Prevent self-deactivation
  if (updateData.isActive === false && userId === requestingUser.id) {
    throw new Error('You cannot deactivate your own account');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(updateData.name && { name: updateData.name }),
      ...(updateData.role && { role: updateData.role }),
      ...(updateData.isActive !== undefined && { isActive: updateData.isActive }),
      ...(updateData.isEmailVerified !== undefined && { isEmailVerified: updateData.isEmailVerified })
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isEmailVerified: true,
      isActive: true,
      tenantId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return updatedUser;
}

/**
 * Deactivate user (soft delete)
 */
async function deactivateUser(userId, requestingUser) {
  // Check access to user
  await getUserById(userId, requestingUser);

  // Check permissions
  if (requestingUser.role !== 'ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
    throw new Error('Only ADMIN or SUPER_ADMIN can deactivate users');
  }

  // Prevent self-deactivation
  if (userId === requestingUser.id) {
    throw new Error('You cannot deactivate your own account');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false }
  });

  // Revoke all refresh tokens
  await prisma.refreshToken.updateMany({
    where: { userId },
    data: { revoked: true }
  });

  return user;
}

/**
 * Activate user
 */
async function activateUser(userId, requestingUser) {
  // Check access to user
  await getUserById(userId, requestingUser);

  // Check permissions
  if (requestingUser.role !== 'ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
    throw new Error('Only ADMIN or SUPER_ADMIN can activate users');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: true }
  });

  return user;
}

/**
 * Delete user (hard delete)
 * Only SUPER_ADMIN or ADMIN can delete users from their tenant
 */
async function deleteUser(userId, requestingUser) {
  // Check access to user
  const existingUser = await getUserById(userId, requestingUser);

  // Check permissions
  if (requestingUser.role !== 'ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
    throw new Error('Only an administrator can delete this.');
  }

  // Prevent self-deletion
  if (userId === requestingUser.id) {
    throw new Error('You cannot delete your own account');
  }

  // Delete user (cascade delete will handle related records)
  await prisma.user.delete({
    where: { id: userId }
  });

  return {
    deletedUser: {
      id: existingUser.id,
      name: existingUser.name,
      email: existingUser.email
    }
  };
}

/**
 * Resend invitation email to user
 */
async function resendInvitation(userId, requestingUser) {
  // Check access to user
  const user = await getUserById(userId, requestingUser);

  // Check permissions
  if (requestingUser.role !== 'ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
    throw new Error('Only ADMIN or SUPER_ADMIN can resend invitations');
  }

  // Generate new temporary password
  const temporaryPassword = nanoid(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  // Update user password
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });

  // Send invitation email
  await sendUserInvitationEmail(
    user.email,
    requestingUser.name,
    temporaryPassword,
    user.tenant.name
  );

  return {
    success: true,
    message: 'Invitation email sent successfully',
    temporaryPassword: process.env.NODE_ENV === 'development' ? temporaryPassword : undefined
  };
}

/**
 * Get user statistics (tenant-scoped).
 * @param {object} [options]
 * @param {string} [options.tenantId] - When requesting user is SUPER_ADMIN, scope stats to this tenant only.
 */
async function getUserStats(requestingUser, options = {}) {
  const overrideTenantId = options.tenantId;
  const tenantFilter =
    requestingUser.role === "SUPER_ADMIN" && overrideTenantId
      ? { tenantId: overrideTenantId }
      : getTenantFilter(requestingUser);

  const [
    total,
    active,
    inactive,
    byRole,
    recentUsers
  ] = await Promise.all([
    prisma.user.count({ where: tenantFilter }),
    prisma.user.count({ where: { ...tenantFilter, isActive: true } }),
    prisma.user.count({ where: { ...tenantFilter, isActive: false } }),
    prisma.user.groupBy({
      by: ['role'],
      where: tenantFilter,
      _count: true
    }),
    prisma.user.count({
      where: {
        ...tenantFilter,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    })
  ]);

  const roleStats = {};
  byRole.forEach(item => {
    roleStats[item.role.toLowerCase()] = item._count;
  });

  return {
    total,
    active,
    inactive,
    byRole: roleStats,
    recentUsers // Last 30 days
  };
}

module.exports = {
  getUsers,
  getUserById,
  inviteUser,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
  resendInvitation,
  getUserStats
};

