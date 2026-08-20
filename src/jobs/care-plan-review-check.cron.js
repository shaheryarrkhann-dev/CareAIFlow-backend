const cron = require("node-cron");
const {
  checkAllCarePlansForReview,
} = require("../services/care-plan/care-plan-alert.service");

/**
 * Daily Care Plan Review Check Cron Job
 * Runs daily at 8:00 AM to check for care plans due for review
 * Creates alerts for care plans that are overdue or due for review
 */
async function checkCarePlansForReview() {
  console.log("\n📅 [CRON] Starting daily care plan review check...");
  const startTime = new Date();

  try {
    // Check all tenants
    const results = await checkAllCarePlansForReview();

    const duration = new Date() - startTime;

    console.log("📊 [CRON] Care plan review check complete:");
    console.log(`  - Total care plans checked: ${results.totalChecked}`);
    console.log(`  - Alerts created: ${results.alertsCreated}`);
    console.log(`  - Alerts skipped (already exist): ${results.alertsSkipped}`);
    console.log(`  - Errors: ${results.errors}`);
    console.log(`  - Duration: ${duration}ms\n`);

    return {
      success: true,
      results,
      duration,
    };
  } catch (error) {
    console.error("❌ [CRON] Error in care plan review check:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Initialize and start the cron job
 * Schedule: Runs daily at 8:00 AM
 * Cron expression: "0 8 * * *" (minute hour day month dayOfWeek)
 */
function initializeCarePlanReviewCheckCron() {
  // Cron expression: "0 8 * * *"
  // - 0: minute (0)
  // - 8: hour (8am)
  // - *: every day of month
  // - *: every month
  // - *: every day of week
  const cronExpression = "0 8 * * *";

  console.log("🕐 [CRON] Care plan review check cron job scheduled:");
  console.log(`   Schedule: Daily at 08:00 (8am)`);
  console.log(`   Expression: ${cronExpression}\n`);

  // Schedule the cron job
  const job = cron.schedule(
    cronExpression,
    async () => {
      await checkCarePlansForReview();
    },
    {
      scheduled: true,
      timezone: "UTC", // Run in UTC timezone
    }
  );

  // Optional: Run immediately on startup for testing (comment out in production)
  // Uncomment the line below if you want to test the job immediately
  // checkCarePlansForReview();

  return job;
}

module.exports = {
  initializeCarePlanReviewCheckCron,
  checkCarePlansForReview,
};
