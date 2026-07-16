const dashboardService = require("../../services/dashboard/dashboard.service");

/**
 * GET /api/dashboard/home
 */
async function getHomeDashboard(req, res, next) {
  try {
    const tenantId = req.query.tenantId || undefined;
    const residentId = req.query.residentId || undefined;
    const staffUserId = req.query.staffUserId || undefined;
    const facilityId = req.query.facilityId || undefined;
    const dashboard = await dashboardService.getHomeDashboard(req.user, {
      tenantId,
      residentId,
      staffUserId,
      facilityId,
    });
    return res.json({ success: true, dashboard });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: err.message || "Not found",
      });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: err.message || "Bad request",
      });
    }
    if (err.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message: err.message || "Forbidden",
      });
    }
    next(err);
  }
}

module.exports = {
  getHomeDashboard,
};
