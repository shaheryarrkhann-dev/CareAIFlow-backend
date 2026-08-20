const prisma = require("../../lib/prisma");
const { sendPushToUsers } = require("../firebase/firebase-push.service");

const RESOURCE = "document_compliance";

function readinessLabel(readiness) {
  if (readiness === "READY") return "Ready";
  if (readiness === "NEEDS_ATTENTION") return "Needs attention";
  return "Not ready";
}

function buildNotificationCopy(evaluation) {
  const { entityName, entityType, overallStatus, readiness, summary } = evaluation;
  const typeLabel =
    entityType === "resident"
      ? "Resident"
      : entityType === "staff"
        ? "Staff"
        : "Facility";

  const gaps = [];
  if (summary.missingCount > 0) gaps.push(`${summary.missingCount} missing`);
  if (summary.partialCount > 0) gaps.push(`${summary.partialCount} partial`);
  const gapText = gaps.length ? ` (${gaps.join(", ")})` : "";

  const title =
    overallStatus === "MISSING"
      ? `${typeLabel} documents incomplete`
      : `${typeLabel} documents need attention`;

  const message = `${entityName}: ${readinessLabel(readiness)} — ${overallStatus.toLowerCase()} compliance${gapText}. Open documents to resolve gaps.`;

  return { title, message };
}

async function getAdminRecipientIds(tenantId) {
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { in: ["ADMIN", "STAFF"] },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Notify admins when a profile is not fully compliant.
 * Skips COMPLETE profiles. Dedupes unread alerts for same entity unless status changed.
 */
async function notifyDocumentComplianceGap(tenantId, evaluation, options = {}) {
  if (!evaluation || !tenantId) return { created: 0 };

  if (evaluation.overallStatus === "COMPLETE") {
    return { created: 0 };
  }

  const recipientIds = await getAdminRecipientIds(tenantId);
  if (recipientIds.length === 0) return { created: 0 };

  const { title, message } = buildNotificationCopy(evaluation);
  const { entityType, entityId, entityName, overallStatus, readiness } = evaluation;

  const latest = await prisma.documentComplianceNotification.findFirst({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    select: { overallStatus: true, readAt: true },
  });

  if (
    latest &&
    latest.overallStatus === overallStatus &&
    !latest.readAt &&
    !options.force
  ) {
    return { created: 0, skipped: "duplicate_unread" };
  }

  let created = 0;
  for (const userId of recipientIds) {
    await prisma.documentComplianceNotification.create({
      data: {
        tenantId,
        userId,
        entityType,
        entityId,
        entityName,
        overallStatus,
        readiness,
        title,
        message,
      },
    });
    created += 1;
  }

  try {
    await sendPushToUsers(recipientIds, {
      title,
      body: message,
      data: {
        type: RESOURCE,
        entityType,
        entityId,
      },
    });
  } catch (pushErr) {
    console.error("[document-compliance-push]", pushErr?.message);
  }

  return { created };
}

async function listNotificationsForUser(userId, tenantId, options = {}) {
  const limit = Math.min(Number(options.limit) || 20, 50);
  const unreadOnly = options.unreadOnly === true || options.unreadOnly === "true";

  const notifications = await prisma.documentComplianceNotification.findMany({
    where: {
      userId,
      tenantId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return notifications;
}

async function markNotificationRead(notificationId, userId) {
  const notification = await prisma.documentComplianceNotification.findUnique({
    where: { id: notificationId },
  });
  if (!notification || notification.userId !== userId) {
    const err = new Error("Notification not found");
    err.status = 404;
    throw err;
  }
  if (notification.readAt) return notification;

  return prisma.documentComplianceNotification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

module.exports = {
  RESOURCE,
  notifyDocumentComplianceGap,
  listNotificationsForUser,
  markNotificationRead,
};
