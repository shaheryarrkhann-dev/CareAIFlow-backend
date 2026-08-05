const cron = require("node-cron");
const {
  processVisitorRemindersAndAutoCheckout,
} = require("../services/facility/visitor-log.service");

async function runVisitorReminderAndAutoCheckout() {
  console.log("\n🔔 [CRON] Visitor reminder & auto-checkout check...");
  const start = Date.now();
  try {
    const { remindersSent, autoCheckedOut } =
      await processVisitorRemindersAndAutoCheckout();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    if (remindersSent > 0 || autoCheckedOut > 0) {
      console.log(
        `   Reminders sent: ${remindersSent}, Auto check-outs: ${autoCheckedOut}`
      );
    }
    console.log(
      `✅ [CRON] Visitor reminder & auto-checkout completed in ${duration}s.\n`
    );
  } catch (err) {
    console.error(
      "❌ [CRON] Visitor reminder & auto-checkout failed:",
      err.message
    );
  }
}

function initializeVisitorReminderAutocheckoutCron() {
  const cronExpression = "*/2 * * * *"; // Every 2 minutes
  console.log("🕐 [CRON] Visitor reminder & auto-checkout scheduled:");
  console.log(`   Schedule: Every 2 minutes`);
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runVisitorReminderAndAutoCheckout(), {
    scheduled: true,
    timezone: "UTC",
  });

  return { runVisitorReminderAndAutoCheckout };
}

module.exports = {
  initializeVisitorReminderAutocheckoutCron,
  runVisitorReminderAndAutoCheckout,
};
