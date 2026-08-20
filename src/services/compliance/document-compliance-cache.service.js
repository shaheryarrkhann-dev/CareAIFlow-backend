const prisma = require("../../lib/prisma");

const DEFAULT_TTL_MS = Number(process.env.DOCUMENT_COMPLIANCE_CACHE_TTL_MS) || 15 * 60 * 1000;

function isFresh(evaluatedAt, ttlMs = DEFAULT_TTL_MS) {
  if (!evaluatedAt) return false;
  const t = evaluatedAt instanceof Date ? evaluatedAt : new Date(evaluatedAt);
  return Date.now() - t.getTime() < ttlMs;
}

async function getCachedEvaluation(tenantId, entityType, entityId, options = {}) {
  const row = await prisma.documentComplianceCache.findUnique({
    where: {
      tenantId_entityType_entityId: {
        tenantId,
        entityType,
        entityId,
      },
    },
  });
  if (!row) return null;
  if (!options.allowStale && !isFresh(row.evaluatedAt, options.ttlMs)) {
    return null;
  }
  return row.evaluation;
}

async function upsertCache(tenantId, evaluation) {
  if (!evaluation?.entityType || !evaluation?.entityId) return null;
  const evaluatedAt = evaluation.evaluatedAt
    ? new Date(evaluation.evaluatedAt)
    : new Date();

  return prisma.documentComplianceCache.upsert({
    where: {
      tenantId_entityType_entityId: {
        tenantId,
        entityType: evaluation.entityType,
        entityId: evaluation.entityId,
      },
    },
    create: {
      tenantId,
      entityType: evaluation.entityType,
      entityId: evaluation.entityId,
      evaluation,
      evaluatedAt,
    },
    update: {
      evaluation,
      evaluatedAt,
    },
  });
}

async function invalidateEntity(tenantId, entityType, entityId) {
  try {
    await prisma.documentComplianceCache.delete({
      where: {
        tenantId_entityType_entityId: {
          tenantId,
          entityType,
          entityId,
        },
      },
    });
  } catch (err) {
    if (err.code !== "P2025") throw err;
  }
}

async function invalidateTenant(tenantId) {
  await prisma.documentComplianceCache.deleteMany({ where: { tenantId } });
}

/**
 * Load all cache rows for tenant (dashboard batch).
 */
async function getTenantCacheMap(tenantId) {
  const rows = await prisma.documentComplianceCache.findMany({
    where: { tenantId },
  });
  const map = new Map();
  for (const row of rows) {
    map.set(`${row.entityType}:${row.entityId}`, row);
  }
  return map;
}

module.exports = {
  DEFAULT_TTL_MS,
  isFresh,
  getCachedEvaluation,
  upsertCache,
  invalidateEntity,
  invalidateTenant,
  getTenantCacheMap,
};
