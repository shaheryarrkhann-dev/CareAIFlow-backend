const { validationResult } = require('express-validator');
const userService = require('../../services/user/user.service');
const userRoleAssignmentService = require('../../services/role/userRoleAssignment.service');
const { createAuditLog } = require('../../services/compliance/audit.service');


function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const msg = first.msg || 'Validation error';
    const field = first.param;
    const error = new Error(`${msg}${field ? ` (${field})` : ''}`);
    error.status = 400;
    throw error;
  }
}

/**
 * GET /api/users
 * Get all users (tenant-scoped)
 */
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search, isActive, tenantId } = req.query;
    const result = await userService.getUsers(req.user, {
      page: parseInt(page),
      limit: parseInt(limit),
      role,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : null,
      tenantId: tenantId || null,
    });
    return res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/:id
 * Get user by ID
 */
exports.getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id, req.user);
    return res.json({
      success: true,
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/users/:id
 * Update user
 */
exports.updateUser = async (req, res, next) => {
  try {
    handleValidation(req);
    const { id } = req.params;
    const user = await userService.updateUser(id, req.body, req.user);
    return res.json({
      success: true,
      message: 'User updated successfully',
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/users/:id
 * Delete user
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await userService.deleteUser(id, req.user);
    return res.json({
      success: true,
      message: 'User deleted successfully',
      ...result
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users/:id/deactivate
 * Deactivate user
 */
exports.deactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await userService.deactivateUser(id, req.user);
    return res.json({
      success: true,
      message: 'User deactivated successfully',
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users/:id/activate
 * Activate user
 */
exports.activateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await userService.activateUser(id, req.user);
    return res.json({
      success: true,
      message: 'User activated successfully',
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users/:id/resend-invitation
 * Resend invitation email
 */
exports.resendInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await userService.resendInvitation(id, req.user);
    return res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/stats
 * Get user statistics
 */
exports.getUserStats = async (req, res, next) => {
  try {
    const stats = await userService.getUserStats(req.user);
    return res.json({
      success: true,
      stats
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/:id/roles
 * List role assignments for a user
 */
exports.getUserRoles = async (req, res, next) => {
  try {
    const { id: userId } = req.params;
    const targetUser = await userService.getUserById(userId, req.user);
    const tenantId = userRoleAssignmentService.resolveTenantId(req.user, targetUser.tenantId);
    if (!tenantId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const assignments = await userRoleAssignmentService.listAssignments(userId, tenantId);
    if (assignments === null) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.json({ success: true, assignments });
  } catch (err) {
    if (err.message === "User not found or access denied") {
      err.status = 404;
    }
    next(err);
  }
};

/**
 * POST /api/users/:id/roles
 * Assign a role to a user. Body: { roleId, isPrimary? }
 */
exports.assignRole = async (req, res, next) => {
  try {
    handleValidation(req);
    const { id: userId } = req.params;
    const targetUser = await userService.getUserById(userId, req.user);
    const tenantId = userRoleAssignmentService.resolveTenantId(req.user, targetUser.tenantId);
    if (!tenantId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const assignment = await userRoleAssignmentService.assignRole(
      userId,
      tenantId,
      { roleId: req.body.roleId, isPrimary: req.body.isPrimary },
      req.user.id
    );
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId,
      action: "USER_ROLE_ASSIGNED",
      resource: "user",
      resourceId: userId,
      description: `Role "${assignment.role?.name}" assigned to user`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
      metadata: { roleId: req.body.roleId, roleName: assignment.role?.name, isPrimary: assignment.isPrimary },
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.status(201).json({ success: true, assignment });
  } catch (err) {
    if (err.message === "User not found or access denied") err.status = 404;
    if (err.message === "Role not found") err.status = 404;
    if (err.message?.includes("already has this role") || err.message?.includes("system template")) err.status = 400;
    next(err);
  }
};

/**
 * DELETE /api/users/:id/roles/:roleId
 * Unassign a role from a user
 */
exports.unassignRole = async (req, res, next) => {
  try {
    const { id: userId, roleId } = req.params;
    const targetUser = await userService.getUserById(userId, req.user);
    const tenantId = userRoleAssignmentService.resolveTenantId(req.user, targetUser.tenantId);
    if (!tenantId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const result = await userRoleAssignmentService.unassignRole(userId, roleId, tenantId);
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId,
      action: "USER_ROLE_UNASSIGNED",
      resource: "user",
      resourceId: userId,
      description: `Role "${result.roleName}" unassigned from user`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
      metadata: { roleId, roleName: result.roleName },
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.json({ success: true, message: "Role unassigned" });
  } catch (err) {
    if (err.message === "User not found or access denied") err.status = 404;
    if (err.message === "Assignment not found") err.status = 404;
    next(err);
  }
};

/**
 * PATCH /api/users/:id/roles/primary
 * Set primary role. Body: { roleId }
 */
exports.setPrimaryRole = async (req, res, next) => {
  try {
    handleValidation(req);
    const { id: userId } = req.params;
    const targetUser = await userService.getUserById(userId, req.user);
    const tenantId = userRoleAssignmentService.resolveTenantId(req.user, targetUser.tenantId);
    if (!tenantId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const assignment = await userRoleAssignmentService.setPrimaryRole(userId, tenantId, req.body.roleId);
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId,
      action: "USER_ROLE_ASSIGNED",
      resource: "user",
      resourceId: userId,
      description: `Primary role set to "${assignment.role?.name}"`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
      metadata: { roleId: req.body.roleId, primaryChange: true },
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.json({ success: true, message: "Primary role updated" });
  } catch (err) {
    if (err.message === "User not found or access denied") err.status = 404;
    if (err.message === "User does not have this role assigned") err.status = 400;
    next(err);
  }
};




