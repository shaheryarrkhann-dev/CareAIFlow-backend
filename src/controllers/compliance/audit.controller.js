const auditService = require('../../services/compliance/audit.service');

/**
 * Convert UTC timestamp to UTC+05:00 timezone
 * @param {Date|string} date - UTC date to convert
 * @returns {string} Formatted date string in UTC+05:00
 */
function convertToAuditTimezone(date) {
  if (!date) return null;

  const utcDate = new Date(date);
  const AUDIT_TIMEZONE_OFFSET = 5 * 60; // 5 hours in minutes

  // Add 5 hours (300 minutes) to UTC time
  const localDate = new Date(utcDate.getTime() + (AUDIT_TIMEZONE_OFFSET * 60 * 1000));

  // Format as ISO string but replace Z with +05:00
  const isoString = localDate.toISOString();
  return isoString.replace('Z', '+05:00');
}

/**
 * Recursively convert all timestamps in an object to UTC+05:00
 * @param {any} obj - Object, array, or value to process
 * @returns {any} Object with converted timestamps
 */
function convertTimestampsInObject(obj) {
  if (!obj) return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertTimestampsInObject(item));
  }

  // Handle dates and ISO strings
  if (typeof obj === 'string') {
    // Check if it's an ISO 8601 timestamp
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(obj)) {
      return convertToAuditTimezone(obj);
    }
    return obj;
  }

  // Handle objects
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key suggests it's a timestamp
      const isTimestampField = key.toLowerCase().includes('time') ||
                               key.toLowerCase().includes('date') ||
                               key === 'createdAt' ||
                               key === 'updatedAt';

      if (isTimestampField && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
        converted[key] = convertToAuditTimezone(value);
      } else if (typeof value === 'object') {
        converted[key] = convertTimestampsInObject(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }

  return obj;
}

/**
 * Format audit log timestamps to UTC+05:00
 * @param {Object} log - Audit log object
 * @returns {Object} Log with formatted timestamp
 */
function formatAuditLogTimezone(log) {
  if (!log) return null;

  // Convert the main createdAt field
  const formattedLog = {
    ...log,
    createdAt: convertToAuditTimezone(log.createdAt)
  };

  // Convert timestamps in metadata
  if (formattedLog.metadata) {
    formattedLog.metadata = convertTimestampsInObject(formattedLog.metadata);
  }

  // Convert timestamps in requestData
  if (formattedLog.requestData) {
    formattedLog.requestData = convertTimestampsInObject(formattedLog.requestData);
  }

  // Convert timestamps in responseData
  if (formattedLog.responseData) {
    formattedLog.responseData = convertTimestampsInObject(formattedLog.responseData);
  }

  return formattedLog;
}

/**
 * GET /api/audit/logs
 * Get audit logs with filtering and pagination
 * Only accessible by ADMIN and SUPER_ADMIN
 */
exports.getAuditLogs = async (req, res, next) => {
  try {
    const {
      userId,
      action,
      resource,
      startDate,
      endDate,
      page,
      limit
    } = req.query;

    // For non-SUPER_ADMIN users, filter by their tenant
    const tenantId = req.user.role === 'SUPER_ADMIN'
      ? req.query.tenantId
      : req.user.tenantId;

    const filters = {
      userId,
      tenantId,
      action,
      resource,
      startDate,
      endDate,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    };

    const result = await auditService.getAuditLogs(filters);

    const response = {
      success: true,
      data: result.logs
    };

    // Only include pagination if page/limit were provided
    if (result.pagination) {
      response.pagination = result.pagination;
    }

    return res.json(response);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit/logs/:id
 * Get a specific audit log by ID
 * Only accessible by ADMIN and SUPER_ADMIN
 */
exports.getAuditLogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const prisma = require('../../lib/prisma');

    const auditLog = await prisma.auditLog.findUnique({
      where: { id }
    });

    if (!auditLog) {
      return res.status(404).json({
        success: false,
        message: 'Audit log not found'
      });
    }

    // For non-SUPER_ADMIN users, ensure they can only view logs from their tenant
    if (req.user.role !== 'SUPER_ADMIN' && auditLog.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Format timestamp to UTC+05:00
    const formattedLog = formatAuditLogTimezone(auditLog);

    return res.json({
      success: true,
      data: formattedLog
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit/stats
 * Get audit log statistics
 * Only accessible by ADMIN and SUPER_ADMIN
 */
exports.getAuditStats = async (req, res, next) => {
  try {
    const { userId, startDate, endDate } = req.query;

    // For non-SUPER_ADMIN users, filter by their tenant
    const tenantId = req.user.role === 'SUPER_ADMIN'
      ? req.query.tenantId
      : req.user.tenantId;

    const filters = {
      userId,
      tenantId,
      startDate,
      endDate
    };

    const stats = await auditService.getAuditStats(filters);

    return res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit/user/:userId
 * Get audit logs for a specific user
 * Only accessible by ADMIN and SUPER_ADMIN
 */
exports.getUserAuditLogs = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, page, limit } = req.query;
    const prisma = require('../../lib/prisma');

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // For non-SUPER_ADMIN users, ensure they can only view logs from their tenant
    if (req.user.role !== 'SUPER_ADMIN' && user.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const filters = {
      userId,
      startDate,
      endDate,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    };

    const result = await auditService.getAuditLogs(filters);

    const response = {
      success: true,
      data: result.logs
    };

    // Only include pagination if page/limit were provided
    if (result.pagination) {
      response.pagination = result.pagination;
    }

    return res.json(response);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit/security-events
 * Get security-related audit events (failed logins, unauthorized access, etc.)
 * Only accessible by ADMIN and SUPER_ADMIN
 */
exports.getSecurityEvents = async (req, res, next) => {
  try {
    const { startDate, endDate, page, limit } = req.query;
    const prisma = require('../../lib/prisma');

    // For non-SUPER_ADMIN users, filter by their tenant
    const tenantId = req.user.role === 'SUPER_ADMIN'
      ? req.query.tenantId
      : req.user.tenantId;

    const where = {
      action: {
        in: ['LOGIN_FAILED', 'UNAUTHORIZED_ACCESS', 'ACCESS_DENIED', 'SYSTEM_ERROR']
      }
    };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Build query options
    const queryOptions = {
      where,
      orderBy: { createdAt: 'desc' }
    };

    // Only add pagination if page and limit are provided
    if (page && limit) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      queryOptions.skip = skip;
      queryOptions.take = parseInt(limit);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany(queryOptions),
      prisma.auditLog.count({ where })
    ]);

    // Format all logs to UTC+05:00 timezone
    const formattedLogs = logs.map(log => formatAuditLogTimezone(log));

    const response = {
      success: true,
      data: formattedLogs
    };

    // Only include pagination if page/limit were provided
    if (page && limit) {
      response.pagination = {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      };
    } else {
      response.total = total;
    }

    return res.json(response);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/audit/export/pdf
 * Export audit trail to PDF
 * Only accessible by ADMIN and SUPER_ADMIN
 */
exports.exportAuditTrailPdf = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const filters = {
      ...(req.query.action && { action: req.query.action }),
      ...(req.query.resource && { resource: req.query.resource }),
      ...(req.query.userId && { userId: req.query.userId }),
      ...(req.query.dateFrom && { dateFrom: req.query.dateFrom }),
      ...(req.query.dateTo && { dateTo: req.query.dateTo }),
      ...(req.query.tenantId && { tenantId: req.query.tenantId }),
    };

    const pdfBuffer = await auditService.exportAuditTrailToPdf(req.user, filters);

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
};

module.exports = exports;

