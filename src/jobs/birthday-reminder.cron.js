const cron = require("node-cron");
const {
  processBirthdayReminders,
} = require("../services/birthday/birthday.service");

async function runBirthdayReminderCheck() {
  console.log("\n🎂 [CRON] Birthday reminder check...");
  const start = Date.now();
  try {
    const { processed } = await processBirthdayReminders();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    if (processed > 0) {
      console.log(`   Processed ${processed} birthday reminder(s).`);
    }
    console.log(`[CRON] Birthday reminder check completed in ${duration}s.\n`);
  } catch (err) {
    console.error("[CRON] Birthday reminder check failed:", err.message);
  }
}

function initializeBirthdayReminderCron() {
  // Run daily at 7:00 AM UTC
  const cronExpression = "0 7 * * *";
  console.log("[CRON] Birthday reminder cron scheduled:");
  console.log(`   Schedule: Daily at 7:00 AM UTC`);
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runBirthdayReminderCheck(), {
    scheduled: true,
    timezone: "UTC",
  });

  return { runBirthdayReminderCheck };
}

module.exports = {
  initializeBirthdayReminderCron,
  runBirthdayReminderCheck,
};
