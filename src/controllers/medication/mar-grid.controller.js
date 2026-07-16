const {
  getMarGrid,
  getMarGridRange,
  getResidentMedicationDashboard,
} = require("../../services/medication/mar-grid.service");

/**
 * Get MAR grid for resident and date
 * GET /api/mar/grid
 */
async function getMarGridHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, date, tenantId } = req.query;

    // Determine tenantId
    let finalTenantId = null;
    if (req.user.role === "SUPER_ADMIN") {
      finalTenantId = tenantId || req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message: "tenantId is required when accessing MAR grid as SUPER_ADMIN",
        });
      }
    } else {
      finalTenantId = req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message: "You must belong to a tenant to access MAR grid",
        });
      }
    }

    const grid = await getMarGrid(residentId, date, finalTenantId);

    return res.status(200).json({
      success: true,
      ...grid,
    });
  } catch (err) {
    console.error("Get MAR grid error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get MAR grid",
    });
  }
}

/**
 * Get MAR grid for date range
 * GET /api/mar/grid/range
 */
async function getMarGridRangeHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, startDate, endDate, tenantId } = req.query;

    // Determine tenantId
    let finalTenantId = null;
    if (req.user.role === "SUPER_ADMIN") {
      finalTenantId = tenantId || req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message:
            "tenantId is required when accessing MAR grid range as SUPER_ADMIN",
        });
      }
    } else {
      finalTenantId = req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message: "You must belong to a tenant to access MAR grid range",
        });
      }
    }

    const result = await getMarGridRange(
      residentId,
      startDate,
      endDate,
      finalTenantId
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get MAR grid range error:", err);
    const statusCode =
      err.message.includes("not found") ||
      err.message.includes("exceed") ||
      err.message.includes("after")
        ? 400
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get MAR grid range",
    });
  }
}

/**
 * Get resident medication dashboard
 * GET /api/mar/dashboard
 */
async function getResidentMedicationDashboardHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, tenantId } = req.query;

    // Determine tenantId
    let finalTenantId = null;
    if (req.user.role === "SUPER_ADMIN") {
      finalTenantId = tenantId || req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message:
            "tenantId is required when accessing dashboard as SUPER_ADMIN",
        });
      }
    } else {
      finalTenantId = req.user.tenantId;
      if (!finalTenantId) {
        return res.status(400).json({
          success: false,
          message: "You must belong to a tenant to access dashboard",
        });
      }
    }

    // Allow "all" or empty residentId to show all residents
    const finalResidentId = residentId === "all" || !residentId ? "all" : residentId;

    const dashboard = await getResidentMedicationDashboard(
      finalResidentId,
      finalTenantId
    );

    return res.status(200).json({
      success: true,
      ...dashboard,
    });
  } catch (err) {
    console.error("Get resident medication dashboard error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get resident medication dashboard",
    });
  }
}

module.exports = {
  getMarGrid: getMarGridHandler,
  getMarGridRange: getMarGridRangeHandler,
  getResidentMedicationDashboard: getResidentMedicationDashboardHandler,
};

