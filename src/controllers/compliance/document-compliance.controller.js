const {
  ENTITY_TYPES,
  getComplianceCatalog,
  getAllComplianceCatalogs,
} = require("../../constants/compliance");
const { DEFAULT_RESIDENT_ROOT_FOLDERS } = require("../../constants/residentDefaultFolders");
const { DEFAULT_STAFF_ROOT_FOLDERS } = require("../../constants/staffDefaultFolders");
const { DEFAULT_FACILITY_ROOT_FOLDERS } = require("../../constants/facilityDefaultFolders");
const {
  evaluateResident,
  evaluateStaff,
  evaluateFacility,
  evaluateDashboard,
} = require("../../services/compliance/document-compliance-evaluation.service");
const {
  listNotificationsForUser,
  markNotificationRead,
} = require("../../services/compliance/document-compliance-notification.service");
const {
  listDocumentComplianceAuditLogs,
  logDocumentComplianceReportExport,
} = require("../../services/compliance/document-compliance-audit.service");
const {
  exportDashboardCsv,
} = require("../../services/compliance/document-compliance-report.service");
const {
  getSettings,
  updateSettings,
} = require("../../services/compliance/document-compliance-settings.service");
const { getCatalogForTenant } = require("../../services/compliance/document-compliance-catalog-tenant.service");
const { invalidateTenant } = require("../../services/compliance/document-compliance-cache.service");
const { runAllTenantDigests, sendDigestForTenant } = require("../../services/compliance/document-compliance-email.service");
const prisma = require("../../lib/prisma");
const { userHasAccessToTenant } = require("../../lib/tenantAccess");

/**
 * Resolve tenant for document-compliance APIs.
 * SUPER_ADMIN may pass tenantId in query/body. Any user may resolve tenant from
 * entity id when they have access (multi-org facility lists).
 */
async function resolveTenantId(req, hints = {}) {
  let tenantId = req.user.tenantId;
  if (
    req.user.role === "SUPER_ADMIN" &&
    (req.body?.tenantId || req.query.tenantId)
  ) {
    tenantId = req.body.tenantId || req.query.tenantId;
  }

  const { residentId, staffId, facilityId } = hints;

  async function tenantIdForEntity() {
    if (facilityId) {
      const row = await prisma.facility.findFirst({
        where: { id: facilityId },
        select: { tenantId: true },
      });
      return row?.tenantId ?? null;
    }
    if (staffId) {
      const row = await prisma.staffMember.findFirst({
        where: { id: staffId },
        select: { tenantId: true },
      });
      return row?.tenantId ?? null;
    }
    if (residentId) {
      const row = await prisma.resident.findFirst({
        where: { id: residentId, deletedAt: null },
        select: { tenantId: true },
      });
      return row?.tenantId ?? null;
    }
    return null;
  }

  const entityTenantId = await tenantIdForEntity();
  if (entityTenantId) {
    const mayUse =
      req.user.role === "SUPER_ADMIN" ||
      (await userHasAccessToTenant(
        req.user.id,
        req.user.tenantId,
        entityTenantId
      ));
    if (mayUse) {
      tenantId = entityTenantId;
    }
  }

  const explicitTenantId = req.query.tenantId || req.body?.tenantId;
  if (
    explicitTenantId &&
    facilityId &&
    (req.user.role === "SUPER_ADMIN" ||
      (await userHasAccessToTenant(
        req.user.id,
        req.user.tenantId,
        String(explicitTenantId)
      )))
  ) {
    const row = await prisma.facility.findFirst({
      where: { id: facilityId, tenantId: String(explicitTenantId) },
      select: { id: true },
    });
    if (row) tenantId = String(explicitTenantId);
  }

  return tenantId;
}

/**
 * GET /api/document-compliance/catalog
 * Optional query: entityType=resident|staff|facility
 */
async function getCatalog(req, res, next) {
  try {
    const { entityType } = req.query;

    if (entityType) {
      const key = String(entityType).toLowerCase();
      if (!ENTITY_TYPES.includes(key)) {
        return res.status(400).json({
          success: false,
          message: `entityType must be one of: ${ENTITY_TYPES.join(", ")}`,
        });
      }
      const tenantId = await resolveTenantId(req);
      const catalog = tenantId
        ? await getCatalogForTenant(tenantId, key)
        : getComplianceCatalog(key);
      return res.json({
        success: true,
        entityType: key,
        catalog,
        defaultFolders:
          key === "resident"
            ? DEFAULT_RESIDENT_ROOT_FOLDERS
            : key === "staff"
              ? DEFAULT_STAFF_ROOT_FOLDERS
              : DEFAULT_FACILITY_ROOT_FOLDERS,
      });
    }

    return res.json({
      success: true,
      catalogs: getAllComplianceCatalogs(),
      defaultFolders: {
        resident: DEFAULT_RESIDENT_ROOT_FOLDERS,
        staff: DEFAULT_STAFF_ROOT_FOLDERS,
        facility: DEFAULT_FACILITY_ROOT_FOLDERS,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/document-compliance/residents/:residentId
 */
async function getResidentStatus(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req, {
      residentId: req.params.residentId,
    });
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const user = { ...req.user, tenantId, tenantIdFromQuery: req.query.tenantId };
    const evaluation = await evaluateResident(tenantId, req.params.residentId, user);
    return res.json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/document-compliance/staff/:staffId
 */
async function getStaffStatus(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req, { staffId: req.params.staffId });
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const evaluation = await evaluateStaff(tenantId, req.params.staffId);
    return res.json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/document-compliance/facility
 * Query: facilityId (optional)
 */
async function getFacilityStatus(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req, {
      facilityId: req.query.facilityId,
    });
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const evaluation = await evaluateFacility(tenantId, req.query.facilityId);
    return res.json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/document-compliance/dashboard
 * Query: facilityId (optional — limits facility slice)
 */
async function getDashboard(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const forceRefresh =
      req.query.refresh === "true" || req.query.forceRefresh === "true";
    const dashboard = await evaluateDashboard(tenantId, {
      facilityId: req.query.facilityId,
      useCache: !forceRefresh,
      forceRefresh,
      user: req.user,
    });
    return res.json({ success: true, dashboard });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/document-compliance/notifications
 */
async function getNotifications(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const notifications = await listNotificationsForUser(req.user.id, tenantId, {
      limit: req.query.limit,
      unreadOnly: req.query.unreadOnly,
    });
    return res.json({ success: true, notifications });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/document-compliance/notifications/:id/read
 */
async function markNotificationAsRead(req, res, next) {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.id);
    return res.json({ success: true, notification });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
}

/**
 * GET /api/document-compliance/audit-logs
 * Query: entityType, entityId, limit
 */
async function getAuditLogs(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const logs = await listDocumentComplianceAuditLogs(tenantId, {
      entityType: req.query.entityType,
      entityId: req.query.entityId,
      limit: req.query.limit,
    });
    return res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/document-compliance/dashboard/export
 * Query: facilityId (optional)
 */
async function exportDashboard(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const { csv, filename } = await exportDashboardCsv(tenantId, {
      facilityId: req.query.facilityId,
    });
    await logDocumentComplianceReportExport(tenantId, req.user, {
      facilityId: req.query.facilityId || null,
      req,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/document-compliance/settings
 */
async function getComplianceSettings(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    const settings = await getSettings(tenantId);
    return res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/document-compliance/settings
 */
async function updateComplianceSettings(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    const settings = await updateSettings(tenantId, {
      catalogOverrides: req.body.catalogOverrides,
      emailDigestEnabled: req.body.emailDigestEnabled,
    });
    return res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/document-compliance/refresh-cache
 */
async function refreshCache(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    await invalidateTenant(tenantId);
    const dashboard = await evaluateDashboard(tenantId, {
      facilityId: req.body.facilityId || req.query.facilityId,
      forceRefresh: true,
      useCache: false,
      user: req.user,
    });
    return res.json({ success: true, message: "Cache refreshed", dashboard });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/document-compliance/trigger-digest
 */
async function triggerDigest(req, res, next) {
  try {
    const tenantId = await resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "tenantId is required" });
    }
    if (req.user.role !== "ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    const tenant = await require("../../lib/prisma").tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const result = await sendDigestForTenant(tenantId, tenant?.name);
    return res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/document-compliance/trigger-digest-all (SUPER_ADMIN / cron test)
 */
async function triggerDigestAll(req, res, next) {
  try {
    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, message: "Super admin only" });
    }
    const results = await runAllTenantDigests();
    return res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCatalog,
  getResidentStatus,
  getStaffStatus,
  getFacilityStatus,
  getDashboard,
  getNotifications,
  markNotificationAsRead,
  getAuditLogs,
  exportDashboard,
  getComplianceSettings,
  updateComplianceSettings,
  refreshCache,
  triggerDigest,
  triggerDigestAll,
};
