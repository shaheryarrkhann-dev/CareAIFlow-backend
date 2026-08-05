/**
 * Only tenant admins may create, rename, password-protect, or delete facility folders
 * (aligned with staff document folder policy).
 */
function requireFacilityFolderAdmin(req, res, next) {
  const r = req.user?.role;
  if (r === "ADMIN" || r === "SUPER_ADMIN") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Only administrators can manage facility folders",
  });
}

module.exports = { requireFacilityFolderAdmin };
