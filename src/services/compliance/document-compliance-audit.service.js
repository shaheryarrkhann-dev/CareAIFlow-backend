const prisma = require("../../lib/prisma");
const { createAuditLog } = require("./audit.service");

const RESOURCE = "document_compliance";

/**
 * Record evaluation snapshot in immutable audit log.
 */
async function logDocumentComplianceEvaluation(evaluation, context = {}) {
  if (!evaluation) return null;

  const {
    tenantId,
    userId,
    userName,
    userEmail,
    userRole,
    trigger = "document_change",
    req,
  } = context;

  return createAuditLog({
    userId,
    userName,
    userEmail,
    userRole,
    tenantId,
    action: "DOCUMENT_COMPLIANCE_EVALUATED",
    resource: RESOURCE,
    resourceId: evaluation.entityId,
    metadata: {
      entityType: evaluation.entityType,
      entityName: evaluation.entityName,
      overallStatus: evaluation.overallStatus,
      readiness: evaluation.readiness,
      summary: evaluation.summary,
      missingOverview: evaluation.missingOverview?.slice(0, 10),
      trigger,
      evaluatedAt: evaluation.evaluatedAt,
    },
    requestData: {
      entityType: evaluation.entityType,
      entityId: evaluation.entityId,
    },
    req,
  });
}

async function logDocumentComplianceReportExport(tenantId, user, meta = {}) {
  return createAuditLog({
    userId: user?.id,
    userName: user?.name,
    userEmail: user?.email,
    userRole: user?.role,
    tenantId,
    action: "DOCUMENT_COMPLIANCE_REPORT_EXPORTED",
    resource: RESOURCE,
    resourceId: tenantId,
    metadata: meta,
    req: meta.req,
  });
}

async function listDocumentComplianceAuditLogs(tenantId, options = {}) {
  const limit = Math.min(Number(options.limit) || 50, 100);
  const { entityType, entityId } = options;

  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      resource: RESOURCE,
      action: "DOCUMENT_COMPLIANCE_EVALUATED",
      ...(entityId ? { resourceId: entityId } : {}),
      ...(entityType
        ? {
            metadata: {
              path: ["entityType"],
              equals: entityType,
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      userName: true,
      userRole: true,
      action: true,
      resource: true,
      resourceId: true,
      description: true,
      metadata: true,
      createdAt: true,
    },
  });

  return logs;
}

module.exports = {
  RESOURCE,
  logDocumentComplianceEvaluation,
  logDocumentComplianceReportExport,
  listDocumentComplianceAuditLogs,
};
