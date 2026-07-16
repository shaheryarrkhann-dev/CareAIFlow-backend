const { validationResult } = require("express-validator");
const evacuationDrillService = require("../../services/facility/evacuation-drill.service");
const evacuationDrillAlertService = require("../../services/facility/evacuation-drill-alert.service");
const { createAuditLog } = require("../../services/compliance/audit.service");

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const array = errors.array();
    const message =
      array.length === 1
        ? array[0].msg
        : `Validation failed: ${array.map((e) => e.msg).join("; ")}`;
    return res.status(400).json({
      success: false,
      message,
      errors: array.map((e) => ({ path: e.path, msg: e.msg })),
    });
  }
  return null;
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

exports.listDrills = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { drillType, facilityId, page, limit } = req.query;
    const result = await evacuationDrillService.listDrills(tenantId, {
      drillType: drillType || undefined,
      facilityId: facilityId || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.createDrill = async (req, res, next) => {
  try {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const { drillType, scheduledDate, notes } = req.body;
    const drill = await evacuationDrillService.createDrill(tenantId, {
      drillType,
      scheduledDate,
      notes: notes ?? null,
      facilityId,
    });
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "EVACUATION_DRILL_CREATED",
        resource: "evacuation_drill",
        resourceId: drill.id,
        description: "Evacuation drill created",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          drillType: drill.drillType,
          scheduledDate: drill.scheduledDate,
        },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.status(201).json({ success: true, drill });
  } catch (err) {
    next(err);
  }
};

exports.completeDrill = async (req, res, next) => {
  try {
    const validationError = handleValidation(req, res);
    if (validationError) return validationError;
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const drill = await evacuationDrillService.completeDrill(
      tenantId,
      req.params.id,
      {
        ...req.body,
        facilityId,
        completedBy: req.body.completedBy || req.user.id,
      }
    );
    if (!drill) {
      return res.status(404).json({
        success: false,
        message: "Drill not found",
      });
    }
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "EVACUATION_DRILL_COMPLETED",
        resource: "evacuation_drill",
        resourceId: drill.id,
        description: "Evacuation drill completed",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: {
          drillType: drill.drillType,
          completedDate: drill.completedDate,
        },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, drill });
  } catch (err) {
    next(err);
  }
};

exports.getComplianceStatus = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const status = await evacuationDrillService.getComplianceStatus(
      tenantId,
      facilityId
    );
    return res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
};

exports.getDrillAlerts = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const alerts = await evacuationDrillAlertService.checkDrillAlerts(
      tenantId,
      facilityId
    );
    return res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
};
