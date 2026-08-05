const prisma = require("../../lib/prisma");
const { getCatalogForTenant } = require("./document-compliance-catalog-tenant.service");
const {
  getCachedEvaluation,
  upsertCache,
  getTenantCacheMap,
  isFresh,
} = require("./document-compliance-cache.service");
const residentFolderService = require("../resident/resident-folder.service");
const { extractResidentNameFromModel, activeResidentWhere, nonDeletedResidentWhere } = require("../resident/resident.service");
const staffMemberService = require("../staff/staff-member.service");
const facilityService = require("../facility/facility.service");

/**
 * Tenant ids the user may access (primary + UserTenant links).
 * @param {{ id: string, role?: string, tenantId?: string | null }} user
 * @param {string} primaryTenantId
 */
async function getAccessibleTenantIds(user, primaryTenantId) {
  if (user?.role === "SUPER_ADMIN") {
    const rows = await prisma.tenant.findMany({ select: { id: true }, take: 500 });
    return rows.map((r) => r.id);
  }
  const links = await prisma.userTenant.findMany({
    where: { userId: user.id },
    select: { tenantId: true },
  });
  const ids = links.map((l) => l.tenantId);
  if (primaryTenantId && !ids.includes(primaryTenantId)) {
    ids.push(primaryTenantId);
  }
  if (user?.tenantId && !ids.includes(user.tenantId)) {
    ids.push(user.tenantId);
  }
  return ids.length > 0 ? ids : primaryTenantId ? [primaryTenantId] : [];
}

const CATEGORY_STATUS = Object.freeze({
  COMPLETE: "COMPLETE",
  PARTIAL: "PARTIAL",
  MISSING: "MISSING",
  GAP: "GAP",
});

const OVERALL_STATUS = Object.freeze({
  COMPLETE: "COMPLETE",
  PARTIAL: "PARTIAL",
  MISSING: "MISSING",
});

const RECOMMENDATION_PRIORITY = {
  GAP: 1,
  MISSING: 2,
  EXPIRED: 3,
  EXPIRING_SOON: 4,
  INCOMPLETE_SET: 5,
  STALE: 6,
};

/** Days before expiration to flag EXPIRING_SOON (aligned with staff document compliance). */
const EXPIRING_SOON_DAYS = 30;

/** Max category-specific prompts before general guidance (§6.5 — avoid overload). */
const MAX_CATEGORY_RECOMMENDATIONS = 5;

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * @param {Array<{ createdAt: Date, updatedAt?: Date, expirationDate?: Date|null }>} documents
 * @param {number|null} staleAfterDays
 */
function getStaleInfo(documents, staleAfterDays) {
  if (!staleAfterDays || documents.length === 0) {
    return { isStale: false, staleCount: 0 };
  }
  const now = new Date();
  let staleCount = 0;
  for (const doc of documents) {
    const ref = doc.updatedAt || doc.createdAt;
    if (ref && daysBetween(new Date(ref), now) > staleAfterDays) {
      staleCount += 1;
    }
  }
  return { isStale: staleCount > 0, staleCount };
}

/** UTC calendar day from @db.Date (avoids local TZ shifting expiry day). */
function utcDayStart(d) {
  const date = d instanceof Date ? d : new Date(d);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * @param {Array<{ expirationDate?: Date|null }>} documents
 */
function getExpiryInfo(documents) {
  const now = new Date();
  const todayUtc = utcDayStart(now);
  const soonEndUtc = todayUtc + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;

  let expiredCount = 0;
  let expiringSoonCount = 0;
  for (const doc of documents) {
    if (!doc.expirationDate) continue;
    const expUtc = utcDayStart(doc.expirationDate);
    if (expUtc < todayUtc) expiredCount += 1;
    else if (expUtc <= soonEndUtc) expiringSoonCount += 1;
  }
  return {
    hasExpired: expiredCount > 0,
    expiredCount,
    hasExpiringSoon: expiringSoonCount > 0,
    expiringSoonCount,
  };
}

/** Cached evaluations before expiry tracking omit these fields — force recompute. */
function evaluationHasExpiryMetrics(evaluation) {
  return (
    evaluation?.summary &&
    typeof evaluation.summary.expiringSoonCount === "number" &&
    typeof evaluation.summary.expiredCount === "number" &&
    Array.isArray(evaluation.documentExpiryAlerts)
  );
}

function classifyDocumentExpiryAlertType(expirationDate) {
  if (!expirationDate) return null;
  const todayUtc = utcDayStart(new Date());
  const expUtc = utcDayStart(expirationDate);
  const soonEndUtc = todayUtc + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  if (expUtc < todayUtc) return "EXPIRED";
  if (expUtc <= soonEndUtc) return "EXPIRING_SOON";
  return null;
}

/**
 * @param {Array<{ id: string, fileName: string, folderId?: string|null, expirationDate?: Date|null }>} documents
 * @param {Map<string, { folderName: string, label: string }>} folderIdToMeta
 */
function buildDocumentExpiryAlerts(documents, folderIdToMeta) {
  const alerts = [];
  for (const doc of documents) {
    const alertType = classifyDocumentExpiryAlertType(doc.expirationDate);
    if (!alertType) continue;
    const meta = doc.folderId ? folderIdToMeta.get(doc.folderId) : null;
    alerts.push({
      documentId: doc.id,
      fileName: doc.fileName || "Document",
      folderId: doc.folderId ?? null,
      folderName: meta?.folderName ?? "Documents",
      categoryLabel: meta?.label ?? "",
      expirationDate: doc.expirationDate,
      alertType,
    });
  }
  alerts.sort((a, b) => {
    const order = { EXPIRED: 0, EXPIRING_SOON: 1 };
    if (order[a.alertType] !== order[b.alertType]) {
      return order[a.alertType] - order[b.alertType];
    }
    return utcDayStart(a.expirationDate) - utcDayStart(b.expirationDate);
  });
  return alerts;
}

/**
 * @param {import('../../constants/compliance/complianceCatalog.shared').ComplianceCategoryRule} rule
 * @param {{ id: string, name: string }|null} folder
 * @param {Array} documentsInFolder
 */
function evaluateCategory(rule, folder, documentsInFolder) {
  const issues = [];

  if (!folder) {
    issues.push("GAP");
    return {
      id: rule.id,
      folderName: rule.folderName,
      label: rule.label,
      folderId: null,
      status: CATEGORY_STATUS.GAP,
      documentCount: 0,
      minDocuments: rule.minDocuments,
      isOptional: rule.isOptional,
      issues,
      isStale: false,
      staleCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
    };
  }

  const documentCount = documentsInFolder.length;
  const { isStale, staleCount } = getStaleInfo(documentsInFolder, rule.staleAfterDays);
  const { hasExpired, expiredCount, hasExpiringSoon, expiringSoonCount } =
    getExpiryInfo(documentsInFolder);

  let status = CATEGORY_STATUS.COMPLETE;

  if (documentCount === 0) {
    status = CATEGORY_STATUS.MISSING;
    issues.push("MISSING");
  } else if (documentCount < rule.minDocuments) {
    status = CATEGORY_STATUS.PARTIAL;
    issues.push("INCOMPLETE_SET");
  }

  if (hasExpired) issues.push("EXPIRED");
  else if (hasExpiringSoon) issues.push("EXPIRING_SOON");
  if (isStale && status === CATEGORY_STATUS.COMPLETE) {
    issues.push("STALE");
  }

  return {
    id: rule.id,
    folderName: rule.folderName,
    label: rule.label,
    folderId: folder.id,
    status,
    documentCount,
    minDocuments: rule.minDocuments,
    isOptional: rule.isOptional,
    issues,
    isStale,
    staleCount,
    expiredCount,
    expiringSoonCount,
  };
}

function aggregateOverallStatus(categories) {
  const required = categories.filter((c) => !c.isOptional);
  const pool = required.length > 0 ? required : categories;

  if (pool.some((c) => c.status === CATEGORY_STATUS.GAP || c.status === CATEGORY_STATUS.MISSING)) {
    return OVERALL_STATUS.MISSING;
  }
  if (
    pool.some(
      (c) =>
        c.status === CATEGORY_STATUS.PARTIAL ||
        c.issues.includes("STALE") ||
        c.issues.includes("EXPIRED") ||
        c.issues.includes("EXPIRING_SOON")
    )
  ) {
    return OVERALL_STATUS.PARTIAL;
  }
  return OVERALL_STATUS.COMPLETE;
}

function buildRecommendations(categories, entityLabel) {
  const recommendations = [];

  for (const cat of categories) {
    if (cat.issues.includes("GAP")) {
      recommendations.push({
        priority: RECOMMENDATION_PRIORITY.GAP,
        categoryId: cat.id,
        type: "GAP",
        message: `Required folder "${cat.folderName}" is missing — contact an administrator.`,
      });
      continue;
    }
    if (cat.issues.includes("MISSING")) {
      recommendations.push({
        priority: RECOMMENDATION_PRIORITY.MISSING,
        categoryId: cat.id,
        type: "MISSING",
        message: `Add ${cat.label.toLowerCase()}.`,
        action: `upload_to_folder`,
        folderId: cat.folderId,
        folderName: cat.folderName,
      });
      continue;
    }
    if (cat.issues.includes("INCOMPLETE_SET")) {
      const need = cat.minDocuments - cat.documentCount;
      recommendations.push({
        priority: RECOMMENDATION_PRIORITY.INCOMPLETE_SET,
        categoryId: cat.id,
        type: "INCOMPLETE_SET",
        message: `Complete ${cat.label.toLowerCase()} — add ${need} more document(s) for this category.`,
        action: `upload_to_folder`,
        folderId: cat.folderId,
        folderName: cat.folderName,
      });
    }
    if (cat.issues.includes("EXPIRED")) {
      recommendations.push({
        priority: RECOMMENDATION_PRIORITY.EXPIRED,
        categoryId: cat.id,
        type: "EXPIRED",
        message: `Update outdated or expired record in ${cat.label.toLowerCase()} (${cat.expiredCount} expired).`,
        action: `review_folder`,
        folderId: cat.folderId,
        folderName: cat.folderName,
      });
    } else if (cat.issues.includes("EXPIRING_SOON")) {
      recommendations.push({
        priority: RECOMMENDATION_PRIORITY.EXPIRING_SOON,
        categoryId: cat.id,
        type: "EXPIRING_SOON",
        message: `${cat.expiringSoonCount} document(s) expiring within ${EXPIRING_SOON_DAYS} days in ${cat.label.toLowerCase()}.`,
        action: `review_folder`,
        folderId: cat.folderId,
        folderName: cat.folderName,
      });
    } else if (cat.issues.includes("STALE")) {
      recommendations.push({
        priority: RECOMMENDATION_PRIORITY.STALE,
        categoryId: cat.id,
        type: "STALE",
        message: `Update outdated ${cat.label.toLowerCase()} record.`,
        action: `review_folder`,
        folderId: cat.folderId,
        folderName: cat.folderName,
      });
    }
  }

  recommendations.sort((a, b) => a.priority - b.priority);

  const overall = aggregateOverallStatus(categories);
  const expiryTypes = new Set(["EXPIRED", "EXPIRING_SOON"]);
  const expiryRecs = recommendations.filter((r) => expiryTypes.has(r.type));
  const otherRecs = recommendations.filter((r) => !expiryTypes.has(r.type));
  const slotsForOther = Math.max(0, MAX_CATEGORY_RECOMMENDATIONS - expiryRecs.length);
  const categoryRecs = [...expiryRecs, ...otherRecs.slice(0, slotsForOther)];
  const hiddenCategoryCount = Math.max(
    0,
    recommendations.length - categoryRecs.length
  );

  if (overall !== OVERALL_STATUS.COMPLETE) {
    categoryRecs.push({
      priority: 99,
      categoryId: null,
      type: "GENERAL",
      message:
        overall === OVERALL_STATUS.MISSING
          ? "Complete remaining compliance documents."
          : "Review incomplete sections.",
    });
  }

  return { recommendations: categoryRecs, recommendationHiddenCount: hiddenCategoryCount };
}

function countByStatuses(pool, statuses) {
  return pool.filter((c) => statuses.includes(c.status)).length;
}

function buildEvaluationPayload(
  entityType,
  entityId,
  entityName,
  categories,
  documents = []
) {
  const overallStatus = aggregateOverallStatus(categories);
  const requiredCategories = categories.filter((c) => !c.isOptional);
  const optionalCategories = categories.filter((c) => c.isOptional);

  const missingOverview = categories
    .filter(
      (c) =>
        c.status === CATEGORY_STATUS.MISSING ||
        c.status === CATEGORY_STATUS.GAP ||
        c.status === CATEGORY_STATUS.PARTIAL
    )
    .map((c) => ({
      categoryId: c.id,
      label: c.label,
      folderName: c.folderName,
      status: c.status,
      documentCount: c.documentCount,
      isOptional: c.isOptional,
    }));

  const completeCount = countByStatuses(requiredCategories, [CATEGORY_STATUS.COMPLETE]);
  const partialCount = countByStatuses(requiredCategories, [CATEGORY_STATUS.PARTIAL]);
  const missingCount = countByStatuses(requiredCategories, [
    CATEGORY_STATUS.MISSING,
    CATEGORY_STATUS.GAP,
  ]);
  const optionalCompleteCount = countByStatuses(optionalCategories, [
    CATEGORY_STATUS.COMPLETE,
  ]);
  const optionalMissingCount = countByStatuses(optionalCategories, [
    CATEGORY_STATUS.MISSING,
    CATEGORY_STATUS.GAP,
    CATEGORY_STATUS.PARTIAL,
  ]);

  const expiredCount = categories.reduce(
    (n, c) => n + (c.expiredCount || 0),
    0
  );
  const expiringSoonCount = categories.reduce(
    (n, c) => n + (c.expiringSoonCount || 0),
    0
  );

  const { recommendations, recommendationHiddenCount } = buildRecommendations(
    categories,
    entityName
  );

  const folderIdToMeta = new Map();
  for (const c of categories) {
    if (c.folderId) {
      folderIdToMeta.set(c.folderId, {
        folderName: c.folderName,
        label: c.label,
      });
    }
  }
  const documentExpiryAlerts = buildDocumentExpiryAlerts(documents, folderIdToMeta);

  return {
    entityType,
    entityId,
    entityName,
    overallStatus,
    readiness:
      overallStatus === OVERALL_STATUS.COMPLETE
        ? "READY"
        : overallStatus === OVERALL_STATUS.MISSING
          ? "NOT_READY"
          : "NEEDS_ATTENTION",
    summary: {
      totalCategories: categories.length,
      requiredCategories: requiredCategories.length,
      completeCount,
      partialCount,
      missingCount,
      expiredCount,
      expiringSoonCount,
      optionalCompleteCount,
      optionalMissingCount,
      completionPercent:
        requiredCategories.length > 0
          ? Math.round((completeCount / requiredCategories.length) * 100)
          : 100,
    },
    categories,
    missingOverview,
    recommendations,
    recommendationHiddenCount,
    documentExpiryAlerts,
    evaluatedAt: new Date().toISOString(),
  };
}

function indexFoldersByName(folders) {
  const map = new Map();
  for (const f of folders) {
    if (f.parentId == null) {
      map.set(f.name, f);
    }
  }
  return map;
}

/**
 * @param {string} tenantId
 * @param {string} residentId
 * @param {Object} user
 */
async function computeResidentEvaluation(tenantId, residentId, user) {
  const where = {
    id: residentId,
    ...nonDeletedResidentWhere(),
    tenantId,
  };
  if (user.role === "GUARDIAN") {
    where.userId = user.id;
  }

  const resident = await prisma.resident.findFirst({
    where,
    select: {
      id: true,
      residentFullLegalName: true,
      residentPreferredName: true,
      residentIdentificationFullLegalName: true,
      residentIdentificationPreferredName: true,
    },
  });

  if (!resident) {
    throw new Error("Resident not found or access denied");
  }

  const catalog = await getCatalogForTenant(tenantId, "resident");
  await residentFolderService.ensureDefaultResidentFolders(residentId);
  const [folders, documents] = await Promise.all([
    prisma.residentFolder.findMany({
      where: { residentId, parentId: null },
      select: { id: true, name: true, parentId: true, allowedRoles: true },
    }),
    prisma.residentDocument.findMany({
      where: { residentId },
      select: {
        id: true,
        fileName: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
        expirationDate: true,
      },
    }),
  ]);

  const visibleFolders = folders.filter((f) =>
    residentFolderService.canUserAccessFolder(f, user.role)
  );
  const folderByName = indexFoldersByName(visibleFolders);

  const categories = catalog
    .filter((rule) => {
      const folder = folderByName.get(rule.folderName);
      return !folder || residentFolderService.canUserAccessFolder(folder, user.role);
    })
    .map((rule) => {
      const folder = folderByName.get(rule.folderName) || null;
      const docsInFolder = folder
        ? documents.filter((d) => d.folderId === folder.id)
        : [];
      return evaluateCategory(rule, folder, docsInFolder);
    });

  const name = extractResidentNameFromModel(resident);

  return buildEvaluationPayload("resident", residentId, name, categories, documents);
}

async function evaluateResident(tenantId, residentId, user, options = {}) {
  if (!options.forceRefresh) {
    const cached = await getCachedEvaluation(tenantId, "resident", residentId);
    if (cached && evaluationHasExpiryMetrics(cached)) return cached;
  }
  const evaluation = await computeResidentEvaluation(tenantId, residentId, user);
  await upsertCache(tenantId, evaluation);
  return evaluation;
}

/**
 * @param {string} tenantId
 * @param {string} staffId
 */
async function computeStaffEvaluation(tenantId, staffId) {
  await staffMemberService.getStaffMemberById(tenantId, staffId);
  const staffFolderService = require("../staff/staff-folder.service");
  await staffFolderService.ensureDefaultStaffFolders(staffId);

  const catalog = await getCatalogForTenant(tenantId, "staff");
  const staff = await prisma.staffMember.findFirst({
    where: { id: staffId, tenantId },
    include: { user: { select: { name: true } } },
  });

  const [folders, documents] = await Promise.all([
    prisma.staffFolder.findMany({
      where: { staffId, parentId: null },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.staffDocument.findMany({
      where: { staffId },
      select: {
        id: true,
        folderId: true,
        fileName: true,
        createdAt: true,
        updatedAt: true,
        expirationDate: true,
      },
    }),
  ]);

  const folderByName = indexFoldersByName(folders);
  const categories = catalog.map((rule) => {
    const folder = folderByName.get(rule.folderName) || null;
    const docsInFolder = folder
      ? documents.filter((d) => d.folderId === folder.id)
      : [];
    return evaluateCategory(rule, folder, docsInFolder);
  });

  return buildEvaluationPayload(
    "staff",
    staffId,
    staff?.user?.name || "Staff member",
    categories,
    documents
  );
}

async function evaluateStaff(tenantId, staffId, options = {}) {
  if (!options.forceRefresh) {
    const cached = await getCachedEvaluation(tenantId, "staff", staffId);
    if (cached && evaluationHasExpiryMetrics(cached)) return cached;
  }
  const evaluation = await computeStaffEvaluation(tenantId, staffId);
  await upsertCache(tenantId, evaluation);
  return evaluation;
}

/**
 * @param {string} tenantId
 * @param {string} [facilityId]
 */
async function computeFacilityEvaluation(tenantId, facilityId) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const facilityFolderService = require("../facility/facility-folder.service");
  await facilityFolderService.ensureDefaultFacilityFolders(facility.id);

  const catalog = await getCatalogForTenant(tenantId, "facility");
  const [folders, documents] = await Promise.all([
    prisma.facilityFolder.findMany({
      where: { facilityId: facility.id, parentId: null },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.facilityDocument.findMany({
      where: { facilityId: facility.id },
      select: {
        id: true,
        fileName: true,
        folderId: true,
        createdAt: true,
        updatedAt: true,
        expirationDate: true,
      },
    }),
  ]);

  const folderByName = indexFoldersByName(folders);
  const categories = catalog.map((rule) => {
    const folder = folderByName.get(rule.folderName) || null;
    const docsInFolder = folder
      ? documents.filter((d) => d.folderId === folder.id)
      : [];
    return evaluateCategory(rule, folder, docsInFolder);
  });

  return buildEvaluationPayload(
    "facility",
    facility.id,
    facility.name || "Facility",
    categories,
    documents
  );
}

async function evaluateFacility(tenantId, facilityId, options = {}) {
  const facility = await facilityService.getOrCreateFacility(tenantId, facilityId);
  const id = facility.id;
  if (!options.forceRefresh) {
    const cached = await getCachedEvaluation(tenantId, "facility", id);
    if (cached && evaluationHasExpiryMetrics(cached)) return cached;
  }
  const evaluation = await computeFacilityEvaluation(tenantId, facilityId);
  await upsertCache(tenantId, evaluation);
  return evaluation;
}

/**
 * Tenant-wide dashboard aggregates.
 * @param {string} tenantId
 * @param {{ facilityId?: string, useCache?: boolean, forceRefresh?: boolean }} options
 */
async function evaluateDashboard(tenantId, options = {}) {
  const { facilityId, useCache = true, forceRefresh = false, user } = options;
  const cacheMap =
    useCache && !forceRefresh ? await getTenantCacheMap(tenantId) : new Map();

  async function resolveProfile(entityType, entityId, evaluateFn) {
    const key = `${entityType}:${entityId}`;
    if (useCache && !forceRefresh) {
      const row = cacheMap.get(key);
      if (
        row &&
        isFresh(row.evaluatedAt) &&
        row.evaluation &&
        evaluationHasExpiryMetrics(row.evaluation)
      ) {
        return row.evaluation;
      }
    }
    const evaluation = await evaluateFn();
    if (evaluation) {
      await upsertCache(tenantId, evaluation);
    }
    return evaluation;
  }

  const facilityTenantIds = user
    ? await getAccessibleTenantIds(user, tenantId)
    : [tenantId];

  const [residents, staffMembers, facilities] = await Promise.all([
    prisma.resident.findMany({
      where: { tenantId, ...activeResidentWhere() },
      select: { id: true, residentFullLegalName: true },
      take: 500,
    }),
    prisma.staffMember.findMany({
      where: { tenantId },
      select: { id: true },
      take: 500,
    }),
    prisma.facility.findMany({
      where: {
        tenantId: { in: facilityTenantIds },
        ...(facilityId ? { id: facilityId } : {}),
      },
      select: { id: true, name: true, tenantId: true },
      take: 200,
    }),
  ]);

  const syntheticUser = { role: "ADMIN", tenantId, tenantIdFromQuery: tenantId };

  const evalOpts = { forceRefresh };
  const [residentResults, staffResults, facilityResults] = await Promise.all([
    Promise.all(
      residents.map((r) =>
        resolveProfile("resident", r.id, () =>
          evaluateResident(tenantId, r.id, syntheticUser, evalOpts)
        ).catch(() => null)
      )
    ),
    Promise.all(
      staffMembers.map((s) =>
        resolveProfile("staff", s.id, () =>
          evaluateStaff(tenantId, s.id, evalOpts)
        ).catch(() => null)
      )
    ),
    Promise.all(
      facilities.map((f) =>
        resolveProfile("facility", f.id, () =>
          evaluateFacility(f.tenantId, f.id, evalOpts)
        ).catch(() => null)
      )
    ),
  ]);

  const allProfiles = [
    ...residentResults.filter(Boolean),
    ...staffResults.filter(Boolean),
    ...facilityResults.filter(Boolean),
  ];

  const facilityTenantById = new Map(
    facilities.map((f) => [f.id, f.tenantId])
  );

  function profileTenantId(profile) {
    if (profile.entityType === "facility") {
      return facilityTenantById.get(profile.entityId) ?? tenantId;
    }
    return tenantId;
  }

  const countByStatus = { COMPLETE: 0, PARTIAL: 0, MISSING: 0 };
  for (const p of allProfiles) {
    countByStatus[p.overallStatus] = (countByStatus[p.overallStatus] || 0) + 1;
  }

  const incompleteProfiles = allProfiles
    .filter(
      (p) =>
        p.overallStatus !== OVERALL_STATUS.COMPLETE ||
        (p.summary.expiringSoonCount ?? 0) > 0 ||
        (p.summary.expiredCount ?? 0) > 0
    )
    .sort((a, b) => {
      const expA = a.summary.expiredCount ?? 0;
      const expB = b.summary.expiredCount ?? 0;
      if (expB !== expA) return expB - expA;
      const soonA = a.summary.expiringSoonCount ?? 0;
      const soonB = b.summary.expiringSoonCount ?? 0;
      if (soonB !== soonA) return soonB - soonA;
      const order = { MISSING: 0, PARTIAL: 1, COMPLETE: 2 };
      return (order[a.overallStatus] ?? 9) - (order[b.overallStatus] ?? 9);
    })
    .slice(0, 50)
    .map((p) => ({
      entityType: p.entityType,
      entityId: p.entityId,
      entityName: p.entityName,
      tenantId:
        p.entityType === "facility" ? profileTenantId(p) : undefined,
      overallStatus: p.overallStatus,
      readiness: p.readiness,
      missingCount: p.summary.missingCount,
      partialCount: p.summary.partialCount,
      expiredCount: p.summary.expiredCount ?? 0,
      expiringSoonCount: p.summary.expiringSoonCount ?? 0,
      topRecommendations: p.recommendations.slice(0, 2),
    }));

  const categoryBreakdown = { resident: {}, staff: {}, facility: {} };
  for (const p of allProfiles) {
    const bucket = categoryBreakdown[p.entityType] || {};
    for (const cat of p.categories) {
      if (!bucket[cat.id]) {
        bucket[cat.id] = {
          label: cat.label,
          isOptional: cat.isOptional === true,
          COMPLETE: 0,
          PARTIAL: 0,
          MISSING: 0,
          GAP: 0,
        };
      }
      bucket[cat.id][cat.status] = (bucket[cat.id][cat.status] || 0) + 1;
    }
    categoryBreakdown[p.entityType] = bucket;
  }

  const profileSummaries = allProfiles.map((p) => ({
    entityType: p.entityType,
    entityId: p.entityId,
    entityName: p.entityName,
    tenantId:
      p.entityType === "facility" ? profileTenantId(p) : undefined,
    overallStatus: p.overallStatus,
    readiness: p.readiness,
    missingCount: p.summary.missingCount ?? 0,
    partialCount: p.summary.partialCount ?? 0,
    expiredCount: p.summary.expiredCount ?? 0,
    expiringSoonCount: p.summary.expiringSoonCount ?? 0,
  }));

  const documentExpiryAlerts = [];
  let expiredDocumentCount = 0;
  let expiringSoonDocumentCount = 0;
  for (const p of allProfiles) {
    expiredDocumentCount += p.summary.expiredCount ?? 0;
    expiringSoonDocumentCount += p.summary.expiringSoonCount ?? 0;
    const pTenantId = profileTenantId(p);
    for (const alert of p.documentExpiryAlerts || []) {
      documentExpiryAlerts.push({
        ...alert,
        entityType: p.entityType,
        entityId: p.entityId,
        entityName: p.entityName,
        tenantId: pTenantId,
      });
    }
  }
  documentExpiryAlerts.sort((a, b) => {
    const order = { EXPIRED: 0, EXPIRING_SOON: 1 };
    if (order[a.alertType] !== order[b.alertType]) {
      return order[a.alertType] - order[b.alertType];
    }
    return utcDayStart(a.expirationDate) - utcDayStart(b.expirationDate);
  });
  const documentExpiryAlertsTop = documentExpiryAlerts.slice(0, 50);

  const incompleteProfileCount = allProfiles.filter(
    (p) => p.overallStatus !== OVERALL_STATUS.COMPLETE
  ).length;

  const overallCompliancePercent =
    allProfiles.length > 0
      ? Math.round((countByStatus.COMPLETE / allProfiles.length) * 100)
      : 100;

  const criticalMissingItems = [];
  for (const p of allProfiles) {
    for (const cat of p.categories) {
      if (cat.isOptional) continue;
      if (
        cat.status !== CATEGORY_STATUS.MISSING &&
        cat.status !== CATEGORY_STATUS.GAP &&
        cat.status !== CATEGORY_STATUS.PARTIAL
      ) {
        continue;
      }
      criticalMissingItems.push({
        entityType: p.entityType,
        entityId: p.entityId,
        entityName: p.entityName,
        categoryId: cat.id,
        categoryLabel: cat.label,
        folderName: cat.folderName,
        folderId: cat.folderId,
        status: cat.status,
        sortPriority:
          cat.status === CATEGORY_STATUS.GAP
            ? 0
            : cat.status === CATEGORY_STATUS.MISSING
              ? 1
              : 2,
      });
    }
  }
  criticalMissingItems.sort((a, b) => a.sortPriority - b.sortPriority);
  const criticalMissingItemsTop = criticalMissingItems
    .slice(0, 30)
    .map(({ sortPriority: _sp, ...rest }) => rest);

  let overallReadiness = "READY";
  if (countByStatus.MISSING > 0) overallReadiness = "NOT_READY";
  else if (countByStatus.PARTIAL > 0) overallReadiness = "NEEDS_ATTENTION";

  return {
    tenantId,
    facilityId: facilityId || null,
    summary: {
      totalProfiles: allProfiles.length,
      residents: residentResults.filter(Boolean).length,
      staff: staffResults.filter(Boolean).length,
      facilities: facilityResults.filter(Boolean).length,
      complete: countByStatus.COMPLETE,
      partial: countByStatus.PARTIAL,
      missing: countByStatus.MISSING,
      incompleteProfiles: incompleteProfileCount,
      overallCompliancePercent,
      overallReadiness,
      expiredDocumentCount,
      expiringSoonDocumentCount,
    },
    categoryBreakdown,
    incompleteProfiles,
    criticalMissingItems: criticalMissingItemsTop,
    documentExpiryAlerts: documentExpiryAlertsTop,
    profileSummaries,
    evaluatedAt: new Date().toISOString(),
    cacheUsed: useCache && !forceRefresh,
  };
}

module.exports = {
  CATEGORY_STATUS,
  OVERALL_STATUS,
  evaluateResident,
  evaluateStaff,
  evaluateFacility,
  evaluateDashboard,
  evaluateCategory,
  aggregateOverallStatus,
};
