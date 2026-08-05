const {
  createIncidentReport,
  listIncidentReports,
  getIncidentReportById,
  updateIncidentReport,
  softDeleteIncidentReport,
  generateIncidentAiDraft,
  runIncidentComplianceCheck,
  listIncidentActivity,
} = require("../../services/incident/incident.service");

function fireComplianceCheck(reportId, user) {
  runIncidentComplianceCheck(reportId, user, {}).catch((err) => {
    console.error(`[COMPLIANCE] Auto-check failed for incident ${reportId}:`, err.message);
  });
}

async function create(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;
    const report = await createIncidentReport(
      { ...req.body, tenantId: tenantIdFromQuery },
      req.user,
    );
    fireComplianceCheck(report.id, req.user);
    return res.status(201).json({ success: true, report });
  } catch (err) {
    console.error("Create incident report error:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to create incident report",
    });
  }
}

async function list(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const tenantId =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.user.tenantId
        : req.user.tenantId;
    const result = await listIncidentReports(req.user, { ...req.query, tenantId });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("List incident reports error:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to list incident reports",
    });
  }
}

async function getById(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const report = await getIncidentReportById(req.params.id, req.user);
    return res.json({ success: true, report });
  } catch (err) {
    console.error("Get incident report error:", err);
    const status = err.message === "Incident report not found" ? 404 : 400;
    return res.status(status).json({
      success: false,
      message: err.message || "Failed to load incident report",
    });
  }
}

async function update(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const report = await updateIncidentReport(req.params.id, req.body, req.user);
    fireComplianceCheck(report.id, req.user);
    return res.json({ success: true, report });
  } catch (err) {
    console.error("Update incident report error:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to update incident report",
    });
  }
}

async function remove(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    await softDeleteIncidentReport(req.params.id, req.user);
    return res.json({ success: true, message: "Incident report deleted" });
  } catch (err) {
    console.error("Delete incident report error:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to delete incident report",
    });
  }
}

async function aiDraft(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;
    const draft = await generateIncidentAiDraft(
      { ...req.body, tenantId: tenantIdFromQuery },
      req.user,
    );
    return res.json({ success: true, ...draft });
  } catch (err) {
    console.error("Generate incident AI draft error:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to generate incident draft",
    });
  }
}

async function complianceCheck(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const result = await runIncidentComplianceCheck(req.params.id, req.user, req.body || {});
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("Incident compliance check error:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to run incident compliance check",
    });
  }
}

async function activity(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const activities = await listIncidentActivity(req.params.id, req.user);
    return res.json({ success: true, activities });
  } catch (err) {
    console.error("List incident activity error:", err);
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to load incident activity",
    });
  }
}

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  aiDraft,
  complianceCheck,
  activity,
};
