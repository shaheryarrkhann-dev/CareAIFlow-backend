const { validationResult } = require("express-validator");
const facilityQrService = require("../../services/facility/facility-qr.service");
const visitorLogService = require("../../services/facility/visitor-log.service");
const { createAuditLog } = require("../../services/compliance/audit.service");
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

exports.getConfig = async (req, res, next) => {
  try {
    handleValidation(req);
    const token = req.query.t?.trim();
    const config = await facilityQrService.getPublicConfigByToken(token);
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired link",
      });
    }
    if (config.logoS3Key && token) {
      const base = `${req.protocol}://${req.get("host")}`;
      config.logoUrl = `${base}/api/public/visitor-sign-in/logo?t=${encodeURIComponent(token)}`;
    }
    delete config.logoS3Key;
    return res.json({ success: true, ...config });
  } catch (err) {
    next(err);
  }
};

exports.getLogo = async (req, res, next) => {
  try {
    handleValidation(req);
    const token = req.query.t?.trim();
    const config = await facilityQrService.getConfigByToken(token);
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

exports.submit = async (req, res, next) => {
  try {
    handleValidation(req);
    const {
      token,
      visitorName,
      personVisitedName,
      visitorEmail,
      visitorPhone,
      expectedDurationMinutes,
      purpose,
    } = req.body;
    const config = await facilityQrService.getConfigByToken(token);
    if (!config || !config.facility) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired link",
      });
    }
    const tenantId = config.facility.tenantId;
    const facilityId = config.facility.id;
    const log = await visitorLogService.checkIn(tenantId, {
      facilityId,
      visitorName: visitorName.trim(),
      residentId: null,
      personVisitedName: personVisitedName?.trim() || null,
      visitorEmail: visitorEmail?.trim() || null,
      visitorPhone: visitorPhone?.trim() || null,
      expectedDurationMinutes:
        expectedDurationMinutes != null ? Number(expectedDurationMinutes) : null,
      notes: purpose?.trim() || null,
    });
    try {
      await createAuditLog({
        userId: null,
        tenantId,
        action: "VISITOR_QR_SIGN_IN",
        resource: "visitor_log",
        resourceId: log.id,
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          visitorName: log.visitorName,
          facilityId,
          ipAddress: req.ip || req.get("x-forwarded-for"),
          userAgent: req.get("user-agent"),
        },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.status(201).json({
      success: true,
      message: "Thank you, you're signed in.",
    });
  } catch (err) {
    next(err);
  }
};
