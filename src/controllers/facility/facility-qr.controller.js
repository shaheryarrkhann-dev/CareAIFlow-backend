const { validationResult } = require("express-validator");
const facilityQrService = require("../../services/facility/facility-qr.service");
const facilityQrPdfService = require("../../services/facility/facility-qr-pdf.service");
const { downloadFileFromS3 } = require("../../utils/s3.util");

function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const err = new Error(first.msg || "Validation error");
    err.status = 400;
    throw err;
  }
}

function resolveTenantId(req) {
  let tenantId = req.user.tenantId;
  if (
    req.user.role === "SUPER_ADMIN" &&
    (req.body.tenantId || req.query.tenantId)
  ) {
    tenantId = req.body.tenantId || req.query.tenantId;
  }
  return tenantId;
}

function resolveFacilityId(req) {
  return req.query.facilityId || req.body?.facilityId;
}

exports.getConfig = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const facilityId = resolveFacilityId(req);
    const config = await facilityQrService.getOrCreateConfig(tenantId, facilityId);
    if (config.logoS3Key && facilityId) {
      const base = `${req.protocol}://${req.get("host")}`;
      config.logoUrl = `${base}/api/facility/visitor-qr/logo?facilityId=${encodeURIComponent(facilityId)}`;
    }
    return res.json({ success: true, config });
  } catch (err) {
    next(err);
  }
};

exports.regenerateToken = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const facilityId = resolveFacilityId(req);
    const config = await facilityQrService.regenerateToken(tenantId, facilityId);
    return res.json({ success: true, config });
  } catch (err) {
    next(err);
  }
};

exports.updateCustomization = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const { facilityId, ...data } = req.body;
    const config = await facilityQrService.updateCustomization(tenantId, facilityId, data);
    return res.json({ success: true, config });
  } catch (err) {
    next(err);
  }
};

exports.getPrintData = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const facilityId = resolveFacilityId(req);
    const config = await facilityQrService.getOrCreateConfig(tenantId, facilityId);
    return res.json({
      success: true,
      printData: {
        token: config.token,
        facilityDisplayName: config.facilityDisplayName || config.facility?.name || "Visitor Sign-In",
        instructionText: config.instructionText || "Scan to Sign In",
        disclaimerText: config.disclaimerText || null,
        logoUrl: config.logoUrl || null,
        layoutOption: config.layoutOption || "default",
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getPrintPdf = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const facilityId = resolveFacilityId(req);
    const pdfBuffer = await facilityQrPdfService.generatePrintPdf(tenantId, facilityId);
    const filename = `visitor-sign-in-qr-${Date.now()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

exports.getQrImage = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const facilityId = resolveFacilityId(req);
    const buffer = await facilityQrPdfService.getQrImageBuffer(tenantId, facilityId);
    res.setHeader("Content-Type", "image/png");
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};

exports.uploadLogo = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const facilityId = req.body.facilityId || req.query.facilityId;
    if (!facilityId) {
      return res.status(400).json({ success: false, message: "facilityId is required" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "File is required" });
    }
    const config = await facilityQrService.uploadLogo(tenantId, facilityId, req.file);
    const base = `${req.protocol}://${req.get("host")}`;
    const logoUrl = config.logoS3Key
      ? `${base}/api/facility/visitor-qr/logo?facilityId=${encodeURIComponent(facilityId)}`
      : config.logoUrl;
    return res.json({ success: true, config, logoUrl });
  } catch (err) {
    next(err);
  }
};

exports.getLogo = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const facilityId = resolveFacilityId(req);
    const config = await facilityQrService.getConfigByFacility(tenantId, facilityId);
    if (!config?.logoS3Key) {
      return res.status(404).send("Logo not found");
    }
    const buffer = await downloadFileFromS3(config.logoS3Key);
    const contentType = config.logoS3Key.toLowerCase().endsWith(".png")
      ? "image/png"
      : config.logoS3Key.toLowerCase().endsWith(".webp")
        ? "image/webp"
        : config.logoS3Key.toLowerCase().endsWith(".gif")
          ? "image/gif"
          : "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};
