const permissionService = require("../../services/role/permission.service");

exports.listPermissions = async (req, res, next) => {
  try {
    const moduleFilter = req.query.module || undefined;
    const list = await permissionService.listPermissions({ module: moduleFilter });
    return res.json({ success: true, permissions: list });
  } catch (err) {
    next(err);
  }
};
