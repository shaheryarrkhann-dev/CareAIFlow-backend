const {
  exportMarToPdf,
  exportMedicationListToPdf,
  exportPrnLogsToPdf,
  exportAuditTrailToPdf,
  exportResidentSummaryToPdf,
  exportCalendarMarToPdf,
} = require("../../services/medication/mar-export.service");

/**
 * Export MAR records to PDF
 * GET /api/mar/export/pdf
 */
async function exportMarPdfHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const filters = {
      ...(req.query.residentId && { residentId: req.query.residentId }),
      ...(req.query.medicationId && { medicationId: req.query.medicationId }),
      ...(req.query.status && { status: req.query.status }),
      ...(req.query.dateFrom && { dateFrom: req.query.dateFrom }),
      ...(req.query.dateTo && { dateTo: req.query.dateTo }),
      ...(req.query.tenantId && { tenantId: req.query.tenantId }),
    };

    const pdfBuffer = await exportMarToPdf(req.user, filters);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mar-records-${Date.now()}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Export MAR PDF error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export MAR records to PDF",
    });
  }
}

/**
 * Export medication list to PDF
 * GET /api/medications/export/pdf
 */
async function exportMedicationListPdfHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const filters = {
      ...(req.query.residentId && { residentId: req.query.residentId }),
      ...(req.query.isActive !== undefined && {
        isActive: req.query.isActive === "true",
      }),
      ...(req.query.isPrn !== undefined && {
        isPrn: req.query.isPrn === "true",
      }),
      ...(req.query.tenantId && { tenantId: req.query.tenantId }),
    };

    const pdfBuffer = await exportMedicationListToPdf(req.user, filters);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="medication-list-${Date.now()}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Export medication list PDF error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export medication list to PDF",
    });
  }
}

/**
 * Export PRN logs to PDF
 * GET /api/prn/export/pdf
 */
async function exportPrnLogsPdfHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const filters = {
      ...(req.query.residentId && { residentId: req.query.residentId }),
      ...(req.query.medicationId && { medicationId: req.query.medicationId }),
      ...(req.query.dateFrom && { dateFrom: req.query.dateFrom }),
      ...(req.query.dateTo && { dateTo: req.query.dateTo }),
      ...(req.query.tenantId && { tenantId: req.query.tenantId }),
    };

    const pdfBuffer = await exportPrnLogsToPdf(req.user, filters);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="prn-logs-${Date.now()}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Export PRN logs PDF error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export PRN logs to PDF",
    });
  }
}

/**
 * Export audit trail to PDF
 * GET /api/mar/audit/export/pdf
 */
async function exportAuditTrailPdfHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const filters = {
      ...(req.query.action && { action: req.query.action }),
      ...(req.query.dateFrom && { dateFrom: req.query.dateFrom }),
      ...(req.query.dateTo && { dateTo: req.query.dateTo }),
      ...(req.query.tenantId && { tenantId: req.query.tenantId }),
    };

    const pdfBuffer = await exportAuditTrailToPdf(req.user, filters);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-trail-${Date.now()}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Export audit trail PDF error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to export audit trail to PDF",
    });
  }
}

/**
 * Export resident summary to PDF
 * GET /api/residents/:id/summary/export/pdf
 */
async function exportResidentSummaryPdfHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id: residentId } = req.params;
    const filters = {
      ...(req.query.dateFrom && { dateFrom: req.query.dateFrom }),
      ...(req.query.dateTo && { dateTo: req.query.dateTo }),
    };

    const pdfBuffer = await exportResidentSummaryToPdf(
      residentId,
      req.user,
      filters
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="resident-summary-${residentId}-${Date.now()}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Export resident summary PDF error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to export resident summary to PDF",
    });
  }
}

/**
 * Export calendar-style MAR to PDF
 * GET /api/mar/export/calendar-pdf
 */
async function exportCalendarMarPdfHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.query;
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);

    if (!residentId) {
      return res.status(400).json({
        success: false,
        message: "residentId is required",
      });
    }

    if (!month || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "month must be between 1 and 12",
      });
    }

    if (!year || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "year must be a valid year",
      });
    }

    // For non-SUPER_ADMIN: always use user's tenantId
    // For SUPER_ADMIN: use tenantId from query if provided, otherwise use user's tenantId
    // Note: tenantId will be validated by enforceTenantIsolation middleware if provided
    const tenantId = req.user.role === "SUPER_ADMIN"
      ? (req.query.tenantId || req.user.tenantId)
      : req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "Unable to determine tenant. Please ensure you are assigned to a tenant.",
      });
    }

    const pdfBuffer = await exportCalendarMarToPdf(
      residentId,
      month,
      year,
      tenantId
    );

    const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mar-calendar-${monthName.replace(/\s+/g, "-")}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Export calendar MAR PDF error:", err);
    const statusCode = err.message.includes("not found") ? 404 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Failed to export calendar MAR to PDF",
    });
  }
}

module.exports = {
  exportMarPdf: exportMarPdfHandler,
  exportMedicationListPdf: exportMedicationListPdfHandler,
  exportPrnLogsPdf: exportPrnLogsPdfHandler,
  exportAuditTrailPdf: exportAuditTrailPdfHandler,
  exportResidentSummaryPdf: exportResidentSummaryPdfHandler,
  exportCalendarMarPdf: exportCalendarMarPdfHandler,
};

