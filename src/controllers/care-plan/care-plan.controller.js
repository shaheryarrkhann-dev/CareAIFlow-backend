const {
  createCarePlan,
  getCarePlans,
  getCarePlanById,
  updateCarePlan,
  archiveCarePlan,
  getActiveCarePlan,
  addProblem,
  updateProblem,
  removeProblem,
  addGoal,
  updateGoal,
  updateGoalStatus,
  addIntervention,
  updateIntervention,
  removeIntervention,
} = require("../../services/care-plan/care-plan.service");
const {
  getVersions,
  getVersionById,
  compareVersions,
  rollbackToVersion,
} = require("../../services/care-plan/care-plan-version.service");
const {
  getAlerts,
  dismissAlert,
  scheduleReviewReminder,
} = require("../../services/care-plan/care-plan-alert.service");
const {
  detectProblemsFromAssessment,
  detectProblemsFromProgressNotes,
  suggestCarePlanUpdates,
  generateCarePlanDraft,
} = require("../../services/care-plan/care-plan-ai.service");
const {
  exportCarePlanToPdf,
  exportVersionHistoryToPdf,
  exportCarePlanSummary,
} = require("../../services/care-plan/care-plan-export.service");
const {
  getCarePlanDashboard,
  getCarePlanStatistics,
  getGoalProgress,
  getInterventionCompliance,
} = require("../../services/care-plan/care-plan-dashboard.service");

/**
 * Create care plan
 * POST /api/care-plans
 */
async function createCarePlanHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, ...data } = req.body;

    if (!residentId) {
      return res.status(400).json({
        success: false,
        message: "residentId is required",
      });
    }

    // Get tenantId from query or body (for SUPER_ADMIN) or use user's tenant
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;

    const carePlan = await createCarePlan(
      residentId,
      {
        ...data,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    return res.status(201).json({
      success: true,
      message: "Care plan created successfully",
      carePlan,
    });
  } catch (err) {
    console.error("Create care plan error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create care plan",
    });
  }
}

/**
 * Get care plans with filtering
 * GET /api/care-plans
 */
async function getCarePlansHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      page = 1,
      limit = 50,
      residentId,
      status,
      createdBy,
      dateFrom,
      dateTo,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 50, 100), // Max 100
      ...(residentId && { residentId }),
      ...(status && { status }),
      ...(createdBy && { createdBy }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
    };

    const result = await getCarePlans(filters, req.user);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get care plans error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get care plans",
    });
  }
}

/**
 * Get care plan by ID
 * GET /api/care-plans/:id
 */
async function getCarePlanByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const carePlan = await getCarePlanById(id, req.user);

    return res.status(200).json({
      success: true,
      carePlan,
    });
  } catch (err) {
    console.error("Get care plan by ID error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get care plan",
    });
  }
}

/**
 * Update care plan
 * PUT /api/care-plans/:id
 */
async function updateCarePlanHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const carePlan = await updateCarePlan(id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Care plan updated successfully",
      carePlan,
    });
  } catch (err) {
    console.error("Update care plan error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update care plan",
    });
  }
}

/**
 * Archive care plan
 * DELETE /api/care-plans/:id
 */
async function archiveCarePlanHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const carePlan = await archiveCarePlan(id, req.user);

    return res.status(200).json({
      success: true,
      message: "Care plan archived successfully",
      carePlan,
    });
  } catch (err) {
    console.error("Archive care plan error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to archive care plan",
    });
  }
}

/**
 * Get active care plan for resident
 * GET /api/care-plans/resident/:residentId/active
 */
async function getActiveCarePlanHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    const carePlan = await getActiveCarePlan(residentId, req.user);

    return res.status(200).json({
      success: true,
      carePlan, // Will be null if no active plan
    });
  } catch (err) {
    console.error("Get active care plan error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get active care plan",
    });
  }
}

/**
 * Add problem to care plan
 * POST /api/care-plans/:id/problems
 */
async function addProblemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const problem = await addProblem(id, req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "Problem added successfully",
      problem,
    });
  } catch (err) {
    console.error("Add problem error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to add problem",
    });
  }
}

/**
 * Update problem
 * PUT /api/care-plans/problems/:problemId
 */
async function updateProblemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { problemId } = req.params;
    const problem = await updateProblem(problemId, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Problem updated successfully",
      problem,
    });
  } catch (err) {
    console.error("Update problem error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update problem",
    });
  }
}

/**
 * Remove problem
 * DELETE /api/care-plans/problems/:problemId
 */
async function removeProblemHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { problemId } = req.params;
    const problem = await removeProblem(problemId, req.user);

    return res.status(200).json({
      success: true,
      message: "Problem removed successfully",
      problem,
    });
  } catch (err) {
    console.error("Remove problem error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to remove problem",
    });
  }
}

/**
 * Add goal to problem
 * POST /api/care-plans/problems/:problemId/goals
 */
async function addGoalHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { problemId } = req.params;
    const goal = await addGoal(problemId, req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "Goal added successfully",
      goal,
    });
  } catch (err) {
    console.error("Add goal error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to add goal",
    });
  }
}

/**
 * Update goal
 * PUT /api/care-plans/goals/:goalId
 */
async function updateGoalHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { goalId } = req.params;
    const goal = await updateGoal(goalId, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Goal updated successfully",
      goal,
    });
  } catch (err) {
    console.error("Update goal error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update goal",
    });
  }
}

/**
 * Add intervention to goal
 * POST /api/care-plans/goals/:goalId/interventions
 */
async function addInterventionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { goalId } = req.params;
    const intervention = await addIntervention(goalId, req.body, req.user);

    return res.status(201).json({
      success: true,
      message: "Intervention added successfully",
      intervention,
    });
  } catch (err) {
    console.error("Add intervention error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to add intervention",
    });
  }
}

/**
 * Update intervention
 * PUT /api/care-plans/interventions/:interventionId
 */
async function updateInterventionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { interventionId } = req.params;
    const intervention = await updateIntervention(
      interventionId,
      req.body,
      req.user
    );

    return res.status(200).json({
      success: true,
      message: "Intervention updated successfully",
      intervention,
    });
  } catch (err) {
    console.error("Update intervention error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update intervention",
    });
  }
}

/**
 * Remove intervention
 * DELETE /api/care-plans/interventions/:interventionId
 */
async function removeInterventionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { interventionId } = req.params;
    const intervention = await removeIntervention(interventionId, req.user);

    return res.status(200).json({
      success: true,
      message: "Intervention removed successfully",
      intervention,
    });
  } catch (err) {
    console.error("Remove intervention error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to remove intervention",
    });
  }
}

/**
 * Get versions for care plan
 * GET /api/care-plans/:id/versions
 */
async function getVersionsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const versions = await getVersions(id, req.user);

    return res.status(200).json({
      success: true,
      versions,
    });
  } catch (err) {
    console.error("Get versions error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get versions",
    });
  }
}

/**
 * Get version by ID
 * GET /api/care-plans/versions/:versionId
 */
async function getVersionByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { versionId } = req.params;
    const version = await getVersionById(versionId, req.user);

    return res.status(200).json({
      success: true,
      version,
    });
  } catch (err) {
    console.error("Get version by ID error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get version",
    });
  }
}

/**
 * Compare two versions
 * GET /api/care-plans/versions/compare?versionId1=...&versionId2=...
 */
async function compareVersionsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { versionId1, versionId2 } = req.query;

    if (!versionId1 || !versionId2) {
      return res.status(400).json({
        success: false,
        message: "Both versionId1 and versionId2 are required",
      });
    }

    const comparison = await compareVersions(
      versionId1,
      versionId2,
      req.user
    );

    return res.status(200).json({
      success: true,
      comparison,
    });
  } catch (err) {
    console.error("Compare versions error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to compare versions",
    });
  }
}

/**
 * Rollback to version
 * POST /api/care-plans/:id/rollback
 */
async function rollbackToVersionHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { versionId } = req.body;

    if (!versionId) {
      return res.status(400).json({
        success: false,
        message: "versionId is required",
      });
    }

    const carePlan = await rollbackToVersion(id, versionId, req.user);

    return res.status(200).json({
      success: true,
      message: "Care plan rolled back successfully",
      carePlan,
    });
  } catch (err) {
    console.error("Rollback to version error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to rollback care plan",
    });
  }
}

/**
 * Get alerts
 * GET /api/care-plans/alerts
 */
async function getAlertsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      page = 1,
      limit = 50,
      carePlanId,
      alertType,
      isDismissed,
      dateFrom,
      dateTo,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 50, 100), // Max 100
      ...(carePlanId && { carePlanId }),
      ...(alertType && { alertType }),
      ...(isDismissed !== undefined && {
        isDismissed: isDismissed === "true",
      }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
    };

    const result = await getAlerts(filters, req.user);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get alerts error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get alerts",
    });
  }
}

/**
 * Dismiss alert
 * PUT /api/care-plans/alerts/:alertId/dismiss
 */
async function dismissAlertHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { alertId } = req.params;
    const alert = await dismissAlert(alertId, req.user);

    return res.status(200).json({
      success: true,
      message: "Alert dismissed successfully",
      alert,
    });
  } catch (err) {
    console.error("Dismiss alert error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to dismiss alert",
    });
  }
}

/**
 * Schedule review reminder
 * POST /api/care-plans/:id/schedule-review
 */
async function scheduleReviewReminderHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { reviewDate } = req.body;

    if (!reviewDate) {
      return res.status(400).json({
        success: false,
        message: "reviewDate is required",
      });
    }

    const carePlan = await scheduleReviewReminder(
      id,
      reviewDate,
      req.user
    );

    return res.status(200).json({
      success: true,
      message: "Review reminder scheduled successfully",
      carePlan,
    });
  } catch (err) {
    console.error("Schedule review reminder error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to schedule review reminder",
    });
  }
}

/**
 * Detect problems from assessment
 * POST /api/care-plans/ai/detect-problems
 */
async function detectProblemsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, assessmentData } = req.body;

    if (!residentId || !assessmentData) {
      return res.status(400).json({
        success: false,
        message: "residentId and assessmentData are required",
      });
    }

    // Get tenantId from query or body (for SUPER_ADMIN)
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;

    const problems = await detectProblemsFromAssessment(
      residentId,
      {
        ...assessmentData,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    return res.status(200).json({
      success: true,
      problems,
    });
  } catch (err) {
    console.error("Detect problems error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to detect problems",
    });
  }
}

/**
 * Generate care plan draft
 * POST /api/care-plans/ai/generate-draft
 */
async function generateDraftHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, assessmentData } = req.body;

    if (!residentId || !assessmentData) {
      return res.status(400).json({
        success: false,
        message: "residentId and assessmentData are required",
      });
    }

    // Get tenantId from query or body (for SUPER_ADMIN)
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;

    const draft = await generateCarePlanDraft(
      residentId,
      {
        ...assessmentData,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    return res.status(200).json({
      success: true,
      draft,
    });
  } catch (err) {
    console.error("Generate draft error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate care plan draft",
    });
  }
}

/**
 * Suggest care plan updates
 * POST /api/care-plans/:id/ai/suggest-updates
 */
async function suggestUpdatesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const suggestions = await suggestCarePlanUpdates(id, req.user);

    return res.status(200).json({
      success: true,
      suggestions,
    });
  } catch (err) {
    console.error("Suggest updates error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to suggest updates",
    });
  }
}

/**
 * Detect problems from progress notes
 * POST /api/care-plans/ai/detect-problems-from-notes
 */
async function detectProblemsFromNotesHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, noteIds } = req.body;

    if (!residentId || !noteIds || !Array.isArray(noteIds)) {
      return res.status(400).json({
        success: false,
        message: "residentId and noteIds (array) are required",
      });
    }

    const problems = await detectProblemsFromProgressNotes(
      residentId,
      noteIds,
      req.user
    );

    return res.status(200).json({
      success: true,
      problems,
    });
  } catch (err) {
    console.error("Detect problems from notes error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to detect problems from notes",
    });
  }
}

/**
 * Export care plan to PDF
 * GET /api/care-plans/:id/export
 */
async function exportCarePlanHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { includeVersionHistory } = req.query;

    const options = {
      includeVersionHistory: includeVersionHistory === "true",
    };

    const pdfBuffer = await exportCarePlanToPdf(id, options, req.user);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="care-plan-${id}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Export care plan error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to export care plan",
    });
  }
}

/**
 * Export version history to PDF
 * GET /api/care-plans/:id/export-versions
 */
async function exportVersionHistoryHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const pdfBuffer = await exportVersionHistoryToPdf(id, req.user);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="care-plan-versions-${id}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Export version history error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to export version history",
    });
  }
}

/**
 * Export care plan summary
 * GET /api/care-plans/resident/:residentId/export-summary
 */
async function exportCarePlanSummaryHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    const { startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate) {
      dateRange.startDate = new Date(startDate);
    }
    if (endDate) {
      dateRange.endDate = new Date(endDate);
    }

    const pdfBuffer = await exportCarePlanSummary(
      residentId,
      dateRange,
      req.user
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="care-plan-summary-${residentId}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Export care plan summary error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to export care plan summary",
    });
  }
}

/**
 * Get care plan dashboard
 * GET /api/care-plans/dashboard/resident/:residentId
 */
async function getCarePlanDashboardHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    const dashboard = await getCarePlanDashboard(residentId, req.user);

    return res.status(200).json({
      success: true,
      dashboard,
    });
  } catch (err) {
    console.error("Get care plan dashboard error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get care plan dashboard",
    });
  }
}

/**
 * Get care plan statistics
 * GET /api/care-plans/statistics
 */
async function getCarePlanStatisticsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { startDate, endDate, tenantId } = req.query;

    // Determine tenantId
    let targetTenantId = null;
    if (req.user.role === "SUPER_ADMIN") {
      targetTenantId = tenantId || req.user.tenantId;
    } else {
      targetTenantId = req.user.tenantId;
    }

    if (!targetTenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const dateRange = {};
    if (startDate) {
      dateRange.startDate = new Date(startDate);
    }
    if (endDate) {
      dateRange.endDate = new Date(endDate);
    }

    const statistics = await getCarePlanStatistics(
      targetTenantId,
      dateRange,
      req.user
    );

    return res.status(200).json({
      success: true,
      statistics,
    });
  } catch (err) {
    console.error("Get care plan statistics error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get care plan statistics",
    });
  }
}

/**
 * Get goal progress
 * GET /api/care-plans/:id/goal-progress
 */
async function getGoalProgressHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const progress = await getGoalProgress(id, req.user);

    return res.status(200).json({
      success: true,
      progress,
    });
  } catch (err) {
    console.error("Get goal progress error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get goal progress",
    });
  }
}

/**
 * Get intervention compliance
 * GET /api/care-plans/:id/intervention-compliance
 */
async function getInterventionComplianceHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const compliance = await getInterventionCompliance(id, req.user);

    return res.status(200).json({
      success: true,
      compliance,
    });
  } catch (err) {
    console.error("Get intervention compliance error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get intervention compliance",
    });
  }
}

module.exports = {
  createCarePlanHandler,
  getCarePlansHandler,
  getCarePlanByIdHandler,
  updateCarePlanHandler,
  archiveCarePlanHandler,
  getActiveCarePlanHandler,
  addProblemHandler,
  updateProblemHandler,
  removeProblemHandler,
  addGoalHandler,
  updateGoalHandler,
  addInterventionHandler,
  updateInterventionHandler,
  removeInterventionHandler,
  getVersionsHandler,
  getVersionByIdHandler,
  compareVersionsHandler,
  rollbackToVersionHandler,
  getAlertsHandler,
  dismissAlertHandler,
  scheduleReviewReminderHandler,
  detectProblemsHandler,
  generateDraftHandler,
  suggestUpdatesHandler,
  detectProblemsFromNotesHandler,
  exportCarePlanHandler,
  exportVersionHistoryHandler,
  exportCarePlanSummaryHandler,
  getCarePlanDashboardHandler,
  getCarePlanStatisticsHandler,
  getGoalProgressHandler,
  getInterventionComplianceHandler,
};

