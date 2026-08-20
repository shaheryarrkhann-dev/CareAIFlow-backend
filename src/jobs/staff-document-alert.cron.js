const cron = require("node-cron");
const {
  checkAllStaffDocumentAlerts,
} = require("../services/staff/staff-document-alert.service");

/**
 * Daily staff document alert check
 * Logs tenants with staff having expired or expiring-soon documents
 */
async function runStaffDocumentAlertCheck() {
  console.log("\n📄 [CRON] Starting staff document alert check...");
  const startTime = Date.now();

  try {
    const results = await checkAllStaffDocumentAlerts();

    if (results.length === 0) {
      console.log("✅ [CRON] No tenants with staff document alerts.");
      return;
    }

    console.log(
      `⚠️  [CRON] ${results.length} tenant(s) with staff document alerts:`
    );
    for (const r of results) {
      const parts = [];
      if (r.hasExpired) parts.push("Expired documents");
      if (r.hasExpiringSoon) parts.push("Expiring soon");
      console.log(
        `   - ${r.tenantName}: ${r.staffCount} staff — ${parts.join(", ")}`
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `✅ [CRON] Staff document alert check completed in ${duration}s.\n`
    );
  } catch (error) {
    console.error("❌ [CRON] Staff document alert check failed:", error.message);
  }
}

/**
 * Initialize cron - runs daily at 8:00 AM
 * Cron: "0 8 * * *" (minute 0, hour 8, every day)
 */
function initializeStaffDocumentAlertCron() {
  const cronExpression = "0 8 * * *";
  console.log("🕐 [CRON] Staff document alert cron scheduled:");
  console.log(`   Schedule: Daily at 08:00`);
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runStaffDocumentAlertCheck(), {
    scheduled: true,
    timezone: "UTC",
  });

  return { runStaffDocumentAlertCheck };
}

module.exports = {
  initializeStaffDocumentAlertCron,
  runStaffDocumentAlertCheck,
};
