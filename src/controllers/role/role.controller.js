const roleService = require("../../services/role/role.service");
const { createAuditLog } = require("../../services/compliance/audit.service");

function getTenantId(req) {
  return roleService.resolveTenantId(req.user, {
    tenantId: req.body?.tenantId || req.query?.tenantId,
  });
}

exports.listTemplates = async (req, res, next) => {
  try {
    const templates = await roleService.getTemplates();
    return res.json({ success: true, templates });
  } catch (err) {
    next(err);
  }
};

exports.createRoleFromTemplate = async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          req.user.role === "SUPER_ADMIN"
            ? "tenantId is required: select which organization to create this role in"
            : "tenantId is required to create a role from template",
      });
    }
    const role = await roleService.createRoleFromTemplate(tenantId, req.body);
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId,
      action: "ROLE_CREATED",
      resource: "role",
      resourceId: role.id,
      description: `Role created from template: ${req.body.templateRoleId}`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
      metadata: { fromTemplate: req.body.templateRoleId, roleName: role.name },
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.status(201).json({ success: true, role });
  } catch (err) {
    if (err.message === "Template role not found" || err.message?.includes("not a system template")) {
      err.status = 404;
    }
    if (err.message?.includes("already exists")) {
      err.status = 400;
    }
    next(err);
  }
};

exports.listRoles = async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";
    if (!tenantId && !isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required for listing roles",
      });
    }
    const isActive = req.query.isActive;
    let isActiveFilter;
    if (isActive === "true") isActiveFilter = true;
    else if (isActive === "false") isActiveFilter = false;
    if (!tenantId && isSuperAdmin) {
      const roles = await roleService.listAllCustomRolesForSuperAdmin({
        isActive: isActiveFilter,
      });
      return res.json({ success: true, roles });
    }
    const roles = await roleService.listRoles(tenantId, {
      isActive: isActiveFilter,
    });
    return res.json({ success: true, roles });
  } catch (err) {
    next(err);
  }
};

exports.getRoleById = async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const role = await roleService.getRoleById(req.params.id, tenantId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }
    return res.json({ success: true, role });
  } catch (err) {
    next(err);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          req.user.role === "SUPER_ADMIN"
            ? "tenantId is required: select which organization this role belongs to"
            : "tenantId is required to create a role",
      });
    }
    const role = await roleService.createRole(tenantId, req.body);
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId,
      action: "ROLE_CREATED",
      resource: "role",
      resourceId: role.id,
      description: `Role created: ${role.name}`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.status(201).json({ success: true, role });
  } catch (err) {
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";
    if (!tenantId && !isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const role = await roleService.updateRole(req.params.id, tenantId, req.body, {
      superAdmin: isSuperAdmin,
    });
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId: role.tenantId || tenantId,
      action: "ROLE_UPDATED",
      resource: "role",
      resourceId: role.id,
      description: `Role updated: ${role.name}`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.json({ success: true, role });
  } catch (err) {
    if (err.message === "Role not found" || err.message?.includes("Access denied")) {
      err.status = 404;
    }
    next(err);
  }
};

exports.deleteRole = async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";
    if (!tenantId && !isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const role = await roleService.deleteRole(req.params.id, tenantId, {
      superAdmin: isSuperAdmin,
    });
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId: role.tenantId || tenantId,
      action: "ROLE_DELETED",
      resource: "role",
      resourceId: req.params.id,
      description: `Role deleted: ${role.name}`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.json({ success: true, message: "Role deleted" });
  } catch (err) {
    if (err.message === "Role not found" || err.message?.includes("Access denied")) {
      err.status = 404;
    }
    if (err.message?.includes("one or more users are assigned")) {
      err.status = 400;
    }
    next(err);
  }
};

exports.setRolePermissions = async (req, res, next) => {
  try {
    const tenantId = getTenantId(req);
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";
    if (!tenantId && !isSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { role, added, removed } = await roleService.setRolePermissions(
      req.params.id,
      tenantId,
      req.body.permissionIds || [],
      { superAdmin: isSuperAdmin }
    );
    await createAuditLog({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      userRole: req.user.role,
      tenantId: role.tenantId || tenantId,
      action: "ROLE_PERMISSION_GRANTED",
      resource: "role",
      resourceId: role.id,
      description: `Role permissions updated: ${added} added, ${removed} removed`,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      req,
      metadata: { added, removed },
    }).catch((e) => console.error("Audit log failed:", e?.message));
    return res.json({ success: true, role, added, removed });
  } catch (err) {
    if (err.message === "Role not found" || err.message?.includes("Access denied")) {
      err.status = 404;
    }
    if (err.message?.includes("Invalid permission")) {
      err.status = 400;
    }
    next(err);
  }
};
