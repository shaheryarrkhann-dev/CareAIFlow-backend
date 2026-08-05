const {
  createBehavioralLog,
  createBehavioralLogsBatch,
  getBehavioralLogs,
  getBehavioralLogById,
  updateBehavioralLog,
  deleteBehavioralLog,
  getBehavioralDashboard,
} = require("../../services/behavioral/behavioral.service");
const {
  generateBehavioralNote,
  regenerateBehavioralNote,
  updateBehavioralNote,
  getBehavioralNotes,
  getBehavioralNoteById,
  generateSummaryForService,
  generateOutcomeForBehaviors,
  generateInterventionsForCustomBehavior,
} = require("../../services/behavioral/behavioral-ai.service");
const {
  calculateBehaviorTrends,
  getBehaviorFrequency,
  getSeverityTrends,
  getTriggerAnalysis,
  detectEscalations,
} = require("../../services/behavioral/behavioral-trends.service");
const {
  logBehavioralAction,
} = require("../../services/compliance/audit.service");

/**
 * Create behavioral log
 * POST /api/behavioral/logs
 */
async function createBehavioralLogHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get tenantId from query or body (for SUPER_ADMIN) or use user's tenant
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;

    const log = await createBehavioralLog(
      {
        ...req.body,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    // Log audit event (already logged in service, but pass req for better logging)
    logBehavioralAction({
      action: "BEHAVIORAL_LOG_CREATED",
      userId: req.user.id,
      tenantId: log.tenantId,
      resourceId: log.id,
      req,
      metadata: {
        residentId: log.residentId,
        behaviorType: log.behaviorType,
        severity: log.severity,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Behavioral log created successfully",
      log,
    });
  } catch (err) {
    console.error("Create behavioral log error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create behavioral log",
    });
  }
}

/**
 * Get behavioral logs with filtering
 * GET /api/behavioral/logs
 */
async function getBehavioralLogsHandler(req, res) {
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
      behaviorType,
      severity,
      dateFrom,
      dateTo,
      staffId,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 50, 100), // Max 100
      ...(residentId && { residentId }),
      ...(behaviorType && { behaviorType }),
      ...(severity && { severity }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(staffId && { staffId }),
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
    };

    const result = await getBehavioralLogs(req.user, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get behavioral logs error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get behavioral logs",
    });
  }
}

/**
 * Get behavioral log by ID
 * GET /api/behavioral/logs/:id
 */
async function getBehavioralLogByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const log = await getBehavioralLogById(id, req.user);

    return res.status(200).json({
      success: true,
      log,
    });
  } catch (err) {
    console.error("Get behavioral log by ID error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("access denied")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get behavioral log",
    });
  }
}

/**
 * Update behavioral log
 * PUT /api/behavioral/logs/:id
 */
async function updateBehavioralLogHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const log = await updateBehavioralLog(id, req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Behavioral log updated successfully",
      log,
    });
  } catch (err) {
    console.error("Update behavioral log error:", err);
    const statusCode =
      err.message.includes("not found") ||
      err.message.includes("locked") ||
      err.message.includes("24 hours") ||
      err.message.includes("Cannot edit")
        ? 400
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update behavioral log",
    });
  }
}

/**
 * Delete behavioral log
 * DELETE /api/behavioral/logs/:id
 */
async function deleteBehavioralLogHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const log = await deleteBehavioralLog(id, req.user);

    return res.status(200).json({
      success: true,
      message: "Behavioral log deleted successfully",
      log,
    });
  } catch (err) {
    console.error("Delete behavioral log error:", err);
    const statusCode =
      err.message.includes("not found") ||
      err.message.includes("24 hours") ||
      err.message.includes("access denied")
        ? 400
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to delete behavioral log",
    });
  }
}

/**
 * Get behavioral dashboard
 * GET /api/behavioral/dashboard
 */
async function getBehavioralDashboardHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      residentId,
      month,
      year,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const tenantIdToUse =
      req.user.role === "SUPER_ADMIN" && tenantId
        ? tenantId
        : req.user.tenantId;

    if (!tenantIdToUse) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const dashboard = await getBehavioralDashboard(
      residentId || null,
      month ? Number.parseInt(month) : null,
      year ? Number.parseInt(year) : null,
      tenantIdToUse
    );

    return res.status(200).json({
      success: true,
      dashboard,
    });
  } catch (err) {
    console.error("Get behavioral dashboard error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get behavioral dashboard",
    });
  }
}

/**
 * Generate behavioral note using AI
 * POST /api/behavioral/notes/generate
 */
async function generateBehavioralNoteHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId, startDate, endDate, tenantId } = req.body;

    const tenantIdToUse =
      req.user.role === "SUPER_ADMIN" && tenantId
        ? tenantId
        : req.user.tenantId;

    if (!tenantIdToUse) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const note = await generateBehavioralNote(
      residentId,
      new Date(startDate),
      new Date(endDate),
      tenantIdToUse,
      req.user
    );

    // Log audit event (already logged in service, but pass req for better logging)
    logBehavioralAction({
      action: "BEHAVIORAL_NOTE_GENERATED",
      userId: req.user.id,
      tenantId: note.tenantId,
      resourceId: note.id,
      req,
      metadata: {
        residentId: note.residentId,
        startDate: note.startDate.toISOString(),
        endDate: note.endDate.toISOString(),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Behavioral note generated successfully",
      note,
    });
  } catch (err) {
    console.error("Generate behavioral note error:", err);
    const statusCode =
      err.message.includes("not found") ||
      err.message.includes("No behavioral logs")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to generate behavioral note",
    });
  }
}

/**
 * Regenerate behavioral note using AI
 * POST /api/behavioral/notes/:id/regenerate
 */
async function regenerateBehavioralNoteHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const note = await regenerateBehavioralNote(id, req.user);

    return res.status(200).json({
      success: true,
      message: "Behavioral note regenerated successfully",
      note,
    });
  } catch (err) {
    console.error("Regenerate behavioral note error:", err);
    const statusCode =
      err.message.includes("not found") ||
      err.message.includes("access denied") ||
      err.message.includes("No behavioral logs")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to regenerate behavioral note",
    });
  }
}

/**
 * Get behavioral notes with filtering
 * GET /api/behavioral/notes
 */
async function getBehavioralNotesHandler(req, res) {
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
      startDate,
      endDate,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      page: Number.parseInt(page),
      limit: Math.min(Number.parseInt(limit) || 50, 100), // Max 100
      ...(residentId && { residentId }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
    };

    const result = await getBehavioralNotes(req.user, filters);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Get behavioral notes error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get behavioral notes",
    });
  }
}

/**
 * Get behavioral note by ID
 * GET /api/behavioral/notes/:id
 */
async function getBehavioralNoteByIdHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const note = await getBehavioralNoteById(id, req.user);

    return res.status(200).json({
      success: true,
      note,
    });
  } catch (err) {
    console.error("Get behavioral note by ID error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("access denied")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to get behavioral note",
    });
  }
}

/**
 * Update behavioral note
 * PUT /api/behavioral/notes/:id
 */
async function updateBehavioralNoteHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const { narrative } = req.body;

    const note = await updateBehavioralNote(id, narrative, req.user);

    return res.status(200).json({
      success: true,
      message: "Behavioral note updated successfully",
      note,
    });
  } catch (err) {
    console.error("Update behavioral note error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("access denied")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to update behavioral note",
    });
  }
}

/**
 * Get behavior trends
 * GET /api/behavioral/trends
 */
async function getBehaviorTrendsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      residentId,
      startDate,
      endDate,
      tenantId, // Query param for SUPER_ADMIN only
      type, // 'comprehensive', 'frequency', 'severity', 'triggers', 'escalations'
    } = req.query;

    const tenantIdToUse =
      req.user.role === "SUPER_ADMIN" && tenantId
        ? tenantId
        : req.user.tenantId;

    if (!tenantIdToUse) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    let result;

    switch (type) {
      case "frequency":
        // Get behavior frequency for a specific month
        const start = new Date(startDate);
        result = await getBehaviorFrequency(
          residentId || null,
          start.getMonth() + 1,
          start.getFullYear(),
          tenantIdToUse
        );
        break;

      case "severity":
        result = await getSeverityTrends(
          residentId || null,
          new Date(startDate),
          new Date(endDate),
          tenantIdToUse
        );
        break;

      case "triggers":
        result = await getTriggerAnalysis(
          residentId || null,
          new Date(startDate),
          new Date(endDate),
          tenantIdToUse
        );
        break;

      case "escalations":
        const lookbackDays = req.query.lookbackDays
          ? Number.parseInt(req.query.lookbackDays)
          : 30;
        result = await detectEscalations(
          residentId || null,
          tenantIdToUse,
          lookbackDays
        );
        break;

      default:
        // Comprehensive trends
        result = await calculateBehaviorTrends(
          residentId || null,
          new Date(startDate),
          new Date(endDate),
          tenantIdToUse
        );
    }

    return res.status(200).json({
      success: true,
      trends: result,
    });
  } catch (err) {
    console.error("Get behavior trends error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to get behavior trends",
    });
  }
}

/**
 * Export behavioral report
 * GET /api/behavioral/export
 */
async function exportBehavioralReportHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const {
      residentId,
      behaviorType,
      severity,
      dateFrom,
      dateTo,
      tenantId, // Query param for SUPER_ADMIN only
    } = req.query;

    const filters = {
      ...(residentId && { residentId }),
      ...(behaviorType && { behaviorType }),
      ...(severity && { severity }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(req.user.role === "SUPER_ADMIN" && tenantId && { tenantId }),
    };

    const {
      exportBehavioralReportToPdf,
    } = require("../../services/behavioral/behavioral-export.service");
    const pdfBuffer = await exportBehavioralReportToPdf(req.user, filters);

    // Log audit event
    logBehavioralAction({
      action: "BEHAVIORAL_REPORT_EXPORTED",
      userId: req.user.id,
      tenantId:
        req.user.role === "SUPER_ADMIN" && filters.tenantId
          ? filters.tenantId
          : req.user.tenantId,
      req,
      metadata: {
        filters: {
          residentId: filters.residentId,
          behaviorType: filters.behaviorType,
          severity: filters.severity,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
        fileName: `behavioral-report-${
          new Date().toISOString().split("T")[0]
        }.pdf`,
      },
    });

    // Set response headers for PDF download
    const fileName = `behavioral-report-${
      new Date().toISOString().split("T")[0]
    }.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Export behavioral report error:", err);
    if (err.message.includes("No behavioral logs found")) {
      return res.status(404).json({
        success: false,
        message: err.message || "No behavioral logs found to export",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export behavioral report",
    });
  }
}

/**
 * Create behavioral logs in batch
 * POST /api/behavioral/logs/batch
 */
async function createBehavioralLogsBatchHandler(req, res) {
  // Increase timeout for this request (10 minutes for PDF generation with multiple services)
  req.setTimeout(600000); // 10 minutes
  res.setTimeout(600000); // 10 minutes

  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get tenantId from query or body (for SUPER_ADMIN) or use user's tenant
    const tenantIdFromQuery =
      req.user.role === "SUPER_ADMIN"
        ? req.query.tenantId || req.body.tenantId
        : null;

    const result = await createBehavioralLogsBatch(
      {
        ...req.body,
        tenantId: tenantIdFromQuery,
      },
      req.user
    );

    // Generate PDF for the batch
    let pdfBase64 = null;
    let pdfFilename = null;
    try {
      const {
        generateBatchLogsPdf,
        buildBehavioralPdfFileName,
      } = require("../../services/behavioral/behavioral-export.service");
      const {
        getResidentName,
      } = require("../../services/behavioral/behavioral.service");
      const tenantId = tenantIdFromQuery || req.user.tenantId;
      console.log(`[BATCH-PDF] Generating PDF for ${result.logs.length} logs`);
      const pdfBuffer = await generateBatchLogsPdf(
        {
          ...req.body,
          tenantId,
        },
        result.logs,
        req.user
      );
      pdfBase64 = pdfBuffer.toString("base64");
      // Build filename per client spec for frontend download
      try {
        const residentName = await getResidentName(
          req.body.residentId,
          tenantId
        );
        const tenant = await require("../../lib/prisma").tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });
        const dateKeys = (req.body.services || []).map((s) => {
          const d = s.date ? new Date(s.date) : new Date();
          return d.toISOString().split("T")[0];
        });
        pdfFilename = buildBehavioralPdfFileName(
          residentName,
          tenant?.name,
          req.body.selectedTier,
          dateKeys.length ? dateKeys : [new Date().toISOString().split("T")[0]]
        );
      } catch (nameErr) {
        console.warn("[BATCH-PDF] Could not build filename:", nameErr.message);
      }
      console.log(
        `[BATCH-PDF] PDF generated successfully, size: ${pdfBuffer.length} bytes`
      );
    } catch (pdfError) {
      console.error("[BATCH-PDF] Failed to generate PDF for batch:", pdfError);
      console.error("[BATCH-PDF] Error stack:", pdfError.stack);
      // Continue without PDF - don't fail the entire request
    }

    // Determine success message
    const totalServices = req.body.services?.length || 0;
    const successCount = result.logs.length;
    const failedCount = result.failed.length;
    const serviceCount = result.logs[0]?.serviceCount || totalServices;

    let message;
    if (failedCount === 0) {
      message = `Successfully created batch behavior log with ${serviceCount} service${
        serviceCount !== 1 ? "s" : ""
      }`;
    } else {
      message = `Batch behavior log created with ${
        successCount > 0 ? serviceCount : 0
      } of ${totalServices} services`;
    }

    return res.status(result.success ? 201 : 207).json({
      success: result.success,
      message,
      logs: result.logs,
      failed: result.failed,
      pdf: pdfBase64, // Include PDF as base64 string
      pdfFilename, // Suggested filename for download (CBHS Bill for XX at Facility for Month Year.pdf)
    });
  } catch (err) {
    console.error("Create behavioral logs batch error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create behavioral logs",
    });
  }
}

/**
 * Generate PDF for behavioral log(s) by ID
 * GET /api/behavioral/logs/:id/pdf
 */
async function generateLogPdfHandler(req, res) {
  // Increase timeout for this request (10 minutes for PDF generation with multiple services)
  req.setTimeout(600000); // 10 minutes
  res.setTimeout(600000); // 10 minutes

  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;
    const logIds = id.split(","); // Support multiple IDs separated by comma

    const {
      generateLogsPdfByIds,
    } = require("../../services/behavioral/behavioral-export.service");

    const { pdfBuffer, fileName } = await generateLogsPdfByIds(
      logIds,
      req.user
    );

    // Log audit event
    logBehavioralAction({
      action: "BEHAVIORAL_LOG_PDF_GENERATED",
      userId: req.user.id,
      tenantId: req.user.tenantId,
      req,
      metadata: {
        logIds: logIds,
        fileName,
      },
    });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Generate log PDF error:", err);
    const statusCode =
      err.message.includes("not found") || err.message.includes("No logs")
        ? 404
        : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to generate PDF",
    });
  }
}

/**
 * Generate summary for a service entry
 * POST /api/behavioral/logs/generate-summary
 */
async function generateSummaryHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { serviceIndex, ...serviceData } = req.body;

    const summary = await generateSummaryForService(serviceData, serviceIndex);

    return res.status(200).json({
      success: true,
      serviceIndex,
      summary,
      message: "Summary generated successfully",
    });
  } catch (err) {
    console.error("Generate summary error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate summary",
    });
  }
}

/**
 * Generate interventions for a custom behavior
 * POST /api/behavioral/logs/generate-interventions
 */
async function generateInterventionsHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { behaviorName } = req.body;

    if (
      !behaviorName ||
      typeof behaviorName !== "string" ||
      behaviorName.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Behavior name is required",
      });
    }

    const interventions = await generateInterventionsForCustomBehavior(
      behaviorName.trim()
    );

    return res.status(200).json({
      success: true,
      behaviorName: behaviorName.trim(),
      interventions,
      message: "Interventions generated successfully",
    });
  } catch (err) {
    console.error("Generate interventions error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate interventions",
    });
  }
}

/**
 * Generate outcome paragraph based on observed behaviors (and optional interventions)
 * POST /api/behavioral/logs/generate-outcome
 */
async function generateOutcomeHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { observedBehaviors, interventions } = req.body;

    const behaviors =
      Array.isArray(observedBehaviors) && observedBehaviors.length > 0
        ? observedBehaviors.map((b) => (typeof b === "string" ? b.trim() : String(b))).filter(Boolean)
        : [];

    if (behaviors.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one observed behavior is required",
      });
    }

    const outcome = await generateOutcomeForBehaviors(
      behaviors,
      interventions != null ? String(interventions).trim() : ""
    );

    return res.status(200).json({
      success: true,
      outcome: outcome || "",
      message: "Outcome generated successfully",
    });
  } catch (err) {
    console.error("Generate outcome error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate outcome",
    });
  }
}

module.exports = {
  generateLogPdf: generateLogPdfHandler,
  createBehavioralLog: createBehavioralLogHandler,
  createBehavioralLogsBatch: createBehavioralLogsBatchHandler,
  getBehavioralLogs: getBehavioralLogsHandler,
  getBehavioralLogById: getBehavioralLogByIdHandler,
  updateBehavioralLog: updateBehavioralLogHandler,
  deleteBehavioralLog: deleteBehavioralLogHandler,
  getBehavioralDashboard: getBehavioralDashboardHandler,
  generateBehavioralNote: generateBehavioralNoteHandler,
  regenerateBehavioralNote: regenerateBehavioralNoteHandler,
  getBehavioralNotes: getBehavioralNotesHandler,
  getBehavioralNoteById: getBehavioralNoteByIdHandler,
  updateBehavioralNote: updateBehavioralNoteHandler,
  getBehaviorTrends: getBehaviorTrendsHandler,
  exportBehavioralReport: exportBehavioralReportHandler,
  generateSummary: generateSummaryHandler,
  generateOutcome: generateOutcomeHandler,
  generateInterventions: generateInterventionsHandler,
};
