const {
  downloadResidentSheet,
  regenerateResidentSheet,
  getSignedDownloadUrl,
} = require("../../services/claims-billing/claims-excel.service");
const { logBillingAction } = require("../../services/compliance/audit.service");

/**
 * Download resident Excel sheet
 * GET /api/claims-billing/excel/resident/:residentId
 */
async function downloadResidentSheetHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    const buffer = await downloadResidentSheet(residentId, tenantId);

    // Get resident sheet name for consistent filename
    const prisma = require("../../lib/prisma");
    const record = await prisma.claimsBillingRecord.findFirst({
      where: { tenantId, residentId },
      select: { excelSheetName: true },
    });

    // Create consistent filename based on sheet name or resident ID
    const sheetName =
      record?.excelSheetName || `Resident_${residentId.substring(0, 8)}`;
    // Sanitize filename (remove special characters, replace spaces with hyphens)
    const sanitizedName = sheetName
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-");
    const fileName = `claims-billing-${sanitizedName}.xlsx`;

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_EXPORTED",
        userId: req.user.id,
        tenantId,
        resourceId: residentId,
        req,
        metadata: {
          action: "excel_download",
          residentId,
          fileType: "excel",
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for Excel download:", auditError);
    }

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", buffer.length);

    return res.send(buffer);
  } catch (err) {
    console.error("Download resident Excel sheet error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("NoSuchKey")
    ) {
      return res.status(404).json({
        success: false,
        message: "Excel file not found for this resident",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to download Excel sheet",
    });
  }
}

/**
 * Regenerate resident Excel sheet
 * POST /api/claims-billing/excel/regenerate/:residentId
 */
async function regenerateResidentSheetHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    await regenerateResidentSheet(residentId, tenantId);

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_EXPORTED",
        userId: req.user.id,
        tenantId,
        resourceId: residentId,
        req,
        metadata: {
          action: "excel_regenerate",
          residentId,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for Excel regeneration:", auditError);
    }

    return res.status(200).json({
      success: true,
      message: "Excel sheet regenerated successfully",
    });
  } catch (err) {
    console.error("Regenerate resident Excel sheet error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("No billing records")
    ) {
      return res.status(404).json({
        success: false,
        message: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to regenerate Excel sheet",
    });
  }
}

/**
 * Get signed URL for Excel download
 * GET /api/claims-billing/excel/resident/:residentId/signed-url
 */
async function getSignedDownloadUrlHandler(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { residentId } = req.params;
    const expiresIn = req.query.expiresIn
      ? parseInt(req.query.expiresIn)
      : 3600; // Default 1 hour
    let tenantId = req.user.tenantId;
    if (req.user.role === "SUPER_ADMIN" && req.query.tenantId) {
      tenantId = req.query.tenantId;
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }

    // Validate expiresIn (between 1 second and 7 days)
    if (expiresIn < 1 || expiresIn > 604800) {
      return res.status(400).json({
        success: false,
        message: "expiresIn must be between 1 and 604800 seconds (7 days)",
      });
    }

    const signedUrl = await getSignedDownloadUrl(
      residentId,
      tenantId,
      expiresIn
    );

    // Log audit event
    try {
      await logBillingAction({
        action: "INVOICE_EXPORTED",
        userId: req.user.id,
        tenantId,
        resourceId: residentId,
        req,
        metadata: {
          action: "excel_signed_url",
          residentId,
          expiresIn,
        },
      });
    } catch (auditError) {
      console.error("Failed to log audit for signed URL:", auditError);
    }

    return res.status(200).json({
      success: true,
      message: "Signed URL generated successfully",
      signedUrl,
      expiresIn,
    });
  } catch (err) {
    console.error("Get signed download URL error:", err);
    if (
      err.message.includes("not found") ||
      err.message.includes("NoSuchKey")
    ) {
      return res.status(404).json({
        success: false,
        message: "Excel file not found for this resident",
      });
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to generate signed URL",
    });
  }
}

module.exports = {
  downloadResidentSheet: downloadResidentSheetHandler,
  getSignedDownloadUrl: getSignedDownloadUrlHandler,
  regenerateResidentSheet: regenerateResidentSheetHandler,
};
