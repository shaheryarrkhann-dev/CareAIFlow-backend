const { validationResult } = require("express-validator");
const visitorLogService = require("../../services/facility/visitor-log.service");
const { createAuditLog } = require("../../services/compliance/audit.service");
const { resolveFacilityTenantId } = require("../../lib/resolveFacilityTenantId");

function handleValidation(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    const err = new Error(first.msg || "Validation error");
    err.status = 400;
    throw err;
  }
}

function resolveFacilityId(req) {
  return req.query.facilityId || req.body?.facilityId;
}

exports.listVisitors = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const {
      residentId,
      startDate,
      endDate,
      activeOnly,
      facilityId,
      page,
      limit,
    } = req.query;
    const result = await visitorLogService.listVisitors(tenantId, {
      residentId: residentId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      activeOnly: activeOnly === "true",
      facilityId: facilityId || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

exports.checkIn = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const log = await visitorLogService.checkIn(tenantId, {
      ...req.body,
      facilityId,
    });
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "VISITOR_CHECK_IN",
        resource: "visitor_log",
        resourceId: log.id,
        description: "Visitor checked in",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { visitorName: log.visitorName },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.status(201).json({ success: true, visitor: log });
  } catch (err) {
    next(err);
  }
};

exports.checkOut = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const log = await visitorLogService.checkOut(
      tenantId,
      req.params.id,
      facilityId
    );
    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Visitor log not found",
      });
    }
    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "VISITOR_CHECK_OUT",
        resource: "visitor_log",
        resourceId: log.id,
        description: "Visitor checked out",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { visitorName: log.visitorName },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }
    return res.json({ success: true, visitor: log });
  } catch (err) {
    next(err);
  }
};

exports.linkResident = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const facilityId = resolveFacilityId(req);
    const { residentId } = req.body;

    const log = await visitorLogService.linkResident(
      tenantId,
      req.params.id,
      residentId,
      facilityId,
    );

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Visitor log not found",
      });
    }

    try {
      await createAuditLog({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userRole: req.user.role,
        tenantId,
        action: "VISITOR_LINK_RESIDENT",
        resource: "visitor_log",
        resourceId: log.id,
        description: "Linked visitor log to resident",
        method: req.method,
        endpoint: req.originalUrl || req.path,
        req,
        metadata: { visitorName: log.visitorName, residentId },
      });
    } catch (auditErr) {
      console.error("Audit log failed:", auditErr?.message);
    }

    return res.json({ success: true, visitor: log });
  } catch (err) {
    next(err);
  }
};

exports.exportVisitors = async (req, res, next) => {
  try {
    handleValidation(req);
    const tenantId = await resolveFacilityTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "tenantId is required",
      });
    }
    const { residentId, startDate, endDate, facilityId } = req.query;
    const csv = await visitorLogService.exportToCsv(tenantId, {
      residentId: residentId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      facilityId: facilityId || undefined,
    });
    const filename = `visitor-log-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
};
