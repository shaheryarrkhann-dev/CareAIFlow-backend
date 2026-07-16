const cron = require("node-cron");
const {
  processDueReminders,
} = require("../services/appointment/appointment-reminder.service");

async function runAppointmentReminderCheck() {
  console.log("\n🔔 [CRON] Appointment reminder check...");
  const start = Date.now();
  try {
    const { processed } = await processDueReminders();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    if (processed > 0) {
      console.log(`   Processed ${processed} reminder(s).`);
    }
    console.log(`✅ [CRON] Appointment reminder check completed in ${duration}s.\n`);
  } catch (err) {
    console.error("❌ [CRON] Appointment reminder check failed:", err.message);
  }
}

function initializeAppointmentReminderCron() {
  const cronExpression = "*/15 * * * *"; // Every 15 minutes (aligns with frontend notification polling)
  console.log("🕐 [CRON] Appointment reminder cron scheduled:");
  console.log(`   Schedule: Every 15 minutes`);
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runAppointmentReminderCheck(), {
    scheduled: true,
    timezone: "UTC",
  });

  return { runAppointmentReminderCheck };
}

module.exports = {
  initializeAppointmentReminderCron,
  runAppointmentReminderCheck,
};
