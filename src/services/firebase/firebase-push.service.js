const prisma = require("../../lib/prisma");
const { getMessaging } = require("../../config/firebase");

/**
 * Register or update an FCM token for a user/device.
 */
async function registerFcmToken(userId, token) {
  // Upsert: if token already exists for this user, update it
  const existing = await prisma.userFcmToken.findFirst({
    where: { userId, token },
  });

  if (existing) {
    await prisma.userFcmToken.update({
      where: { id: existing.id },
      data: { updatedAt: new Date() },
    });
    return existing;
  }

  return prisma.userFcmToken.create({
    data: { userId, token },
  });
}

/**
 * Remove an FCM token (on logout or permission revoke).
 */
async function removeFcmToken(userId, token) {
  await prisma.userFcmToken.deleteMany({
    where: { userId, token },
  });
}

/**
 * Send push notification to a specific user (all their devices).
 */
async function sendPushToUser(userId, { title, body, data = {} }) {
  const messaging = getMessaging();
  if (!messaging) return { sent: 0, failed: 0 };

  const tokens = await prisma.userFcmToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const message = {
    notification: { title, body },
    data: { ...data, title, body },
    webpush: {
      notification: {
        title,
        body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
      },
    },
  };

  let sent = 0;
  let failed = 0;
  const invalidTokenIds = [];

  for (const { id, token } of tokens) {
    try {
      await messaging.send({ ...message, token });
      sent++;
    } catch (err) {
      failed++;
      // Remove invalid/expired tokens
      if (
        err.code === "messaging/invalid-registration-token" ||
        err.code === "messaging/registration-token-not-registered"
      ) {
        invalidTokenIds.push(id);
      } else {
        console.error(`[FCM] Failed to send to token ${id}:`, err.message);
      }
    }
  }

  // Clean up invalid tokens
  if (invalidTokenIds.length > 0) {
    await prisma.userFcmToken.deleteMany({
      where: { id: { in: invalidTokenIds } },
    });
  }

  return { sent, failed };
}

/**
 * Send push notification to multiple users.
 */
async function sendPushToUsers(userIds, { title, body, data = {} }) {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const { sent, failed } = await sendPushToUser(userId, {
      title,
      body,
      data,
    });
    totalSent += sent;
    totalFailed += failed;
  }

  return { sent: totalSent, failed: totalFailed };
}

module.exports = {
  registerFcmToken,
  removeFcmToken,
  sendPushToUser,
  sendPushToUsers,
};
