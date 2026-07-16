const cron = require("node-cron");
const {
  checkAllDrillAlerts,
} = require("../services/facility/evacuation-drill-alert.service");

/**
 * Daily drill alert check
 * Logs facilities with upcoming/overdue evacuation drills
 */
async function runDrillAlertCheck() {
  console.log("\n🚨 [CRON] Starting evacuation drill alert check...");
  const startTime = new Date();

  try {
    const results = await checkAllDrillAlerts();

    if (results.length === 0) {
      console.log("✅ [CRON] No facilities with drill alerts.");
      return;
    }

    console.log(
      `⚠️  [CRON] ${results.length} facility(ies) with drill alerts:`
    );
    for (const r of results) {
      const parts = [];
      if (r.alerts.regularOverdue) parts.push("Regular OVERDUE");
      if (r.alerts.regularUpcoming) parts.push("Regular upcoming");
      if (r.alerts.annualOverdue) parts.push("Annual OVERDUE");
      if (r.alerts.annualUpcoming) parts.push("Annual upcoming");
      console.log(
        `   - ${r.facilityName} (${r.tenantName}): ${parts.join(", ")}`
      );
    }

    const duration = ((new Date() - startTime) / 1000).toFixed(2);
    console.log(`✅ [CRON] Drill alert check completed in ${duration}s.\n`);
  } catch (error) {
    console.error("❌ [CRON] Drill alert check failed:", error.message);
  }
}

/**
 * Initialize cron - runs daily at 8:00 AM
 * Cron: "0 8 * * *" (minute 0, hour 8, every day)
 */
function initializeEvacuationDrillAlertCron() {
  const cronExpression = "0 8 * * *";
  console.log("🕐 [CRON] Evacuation drill alert cron scheduled:");
  console.log(`   Schedule: Daily at 08:00`);
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runDrillAlertCheck(), {
    scheduled: true,
    timezone: "UTC",
  });

  return { runDrillAlertCheck };
}

module.exports = {
  initializeEvacuationDrillAlertCron,
  runDrillAlertCheck,
};
