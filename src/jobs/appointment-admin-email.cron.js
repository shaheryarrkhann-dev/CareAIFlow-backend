const cron = require("node-cron");
const {
  runAllTenantAppointmentDigests,
} = require("../services/appointment/appointment-admin-email.service");

async function runAppointmentAdminEmailDigest() {
  console.log("\n📅 [CRON] Appointment admin email digest...");
  const start = Date.now();
  try {
    const results = await runAllTenantAppointmentDigests();
    const sent = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => r.error).length;
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    if (sent > 0) {
      console.log(`   Sent ${sent} organization digest(s).`);
    }
    console.log(
      `✅ [CRON] Appointment admin email digest completed in ${duration}s — sent: ${sent}, skipped: ${skipped}, failed: ${failed}\n`
    );
  } catch (err) {
    console.error(
      "❌ [CRON] Appointment admin email digest failed:",
      err.message
    );
  }
}

function initializeAppointmentAdminEmailCron() {
  // Weekly on Monday at 9:00 AM US Eastern (America/New_York — EST/EDT)
  const cronExpression = "0 9 * * 1";
  console.log("🕐 [CRON] Appointment admin email digest scheduled:");
  console.log("   Schedule: Weekly on Monday at 9:00 AM US Eastern");
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runAppointmentAdminEmailDigest(), {
    scheduled: true,
    timezone: "America/New_York",
  });

  return { runAppointmentAdminEmailDigest };
}

module.exports = {
  initializeAppointmentAdminEmailCron,
  runAppointmentAdminEmailDigest,
};
