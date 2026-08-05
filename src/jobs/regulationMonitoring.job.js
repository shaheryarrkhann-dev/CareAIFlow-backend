/**
 * Regulation Monitoring Job
 * Monthly cron job to update WAC/RCW regulations and revalidate schemas
 */

const cron = require("node-cron");
const {
  updateAllRegulations,
  initializeRegulations,
} = require("../services/compliance/wacRcwCompliance.service");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Update regulations and mark schemas for revalidation
 */
async function runRegulationUpdate() {
  try {
    console.log("[REG-MONITOR] 🚀 Starting monthly regulation update...");
    console.log(`[REG-MONITOR] Timestamp: ${new Date().toISOString()}`);

    // Check if update is needed first
    const {
      checkForRegulationUpdates,
    } = require("../services/compliance/wacRcwCompliance.service");
    const updateStatus = await checkForRegulationUpdates();

    console.log(`[REG-MONITOR] Update check: ${updateStatus.reason}`);
    if (updateStatus.daysSinceUpdate !== undefined) {
      console.log(
        `[REG-MONITOR] Days since last update: ${updateStatus.daysSinceUpdate}`
      );
    }

    if (!updateStatus.needsUpdate && updateStatus.reason === "up_to_date") {
      console.log(
        "[REG-MONITOR] ✅ Regulations are up to date, skipping update"
      );
      return {
        success: true,
        skipped: true,
        reason: "up_to_date",
        updateStatus,
      };
    }

    // Update all WAC/RCW regulations from source
    const updateResults = await updateAllRegulations();

    console.log("[REG-MONITOR] ✅ Regulation update complete:");
    console.log(
      `  - WAC: ${updateResults.wac.success} updated, ${updateResults.wac.failed} failed`
    );
    console.log(
      `  - RCW: ${updateResults.rcw.success} updated, ${updateResults.rcw.failed} failed`
    );

    // Mark all compliant schemas as needing revalidation
    const schemasToRevalidate = await prisma.formSchema.updateMany({
      where: {
        isActive: true,
        isWacRcwCompliant: true,
      },
      data: {
        lastComplianceCheck: new Date(),
        complianceNotes: "Regulations updated - revalidation recommended",
      },
    });

    console.log(
      `[REG-MONITOR] ✅ Marked ${schemasToRevalidate.count} schemas for revalidation`
    );

    // TODO: Send notifications to admins about regulation updates
    // TODO: Generate compliance report showing schemas that may be affected

    return {
      success: true,
      updateResults,
      schemasMarked: schemasToRevalidate.count,
    };
  } catch (error) {
    console.error("[REG-MONITOR] ❌ Regulation update failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Initialize regulations on first run (if needed)
 */
async function initializeRegulationsIfNeeded() {
  try {
    console.log("[REG-MONITOR] Checking if regulations are initialized...");

    // Check if regulations exist in PostgreSQL
    const regulationCount = await prisma.wacRcwRegulation.count();

    if (regulationCount === 0) {
      console.log("[REG-MONITOR] No regulations found, initializing...");
      await initializeRegulations();
      console.log("[REG-MONITOR] ✅ Regulations initialized");
    } else {
      console.log(
        `[REG-MONITOR] ✅ Regulations already initialized (${regulationCount} records)`
      );
    }
  } catch (error) {
    console.error(
      "[REG-MONITOR] ❌ Failed to check/initialize regulations:",
      error
    );
    // Don't throw - let the app continue even if initialization fails
  }
}

/**
 * Schedule monthly regulation update
 * Runs on the 1st of every month at 2:00 AM
 */
function scheduleRegulationUpdates() {
  // Cron format: second minute hour day-of-month month day-of-week
  // '0 2 1 * *' = At 02:00 on day-of-month 1
  const cronSchedule = "0 2 1 * *"; // Monthly at 2 AM on the 1st

  console.log("[REG-MONITOR] 📅 Scheduling monthly regulation updates...");
  console.log(
    `[REG-MONITOR] Schedule: ${cronSchedule} (1st of month at 2:00 AM)`
  );

  const job = cron.schedule(
    cronSchedule,
    async () => {
      console.log("[REG-MONITOR] ⏰ Monthly regulation update triggered");
      await runRegulationUpdate();
    },
    {
      scheduled: true,
      timezone: "America/Los_Angeles", // Pacific Time (Washington State)
    }
  );

  console.log("[REG-MONITOR] ✅ Regulation monitoring scheduled");

  return job;
}

/**
 * Manual trigger for regulation update (for testing/admin use)
 */
async function triggerManualUpdate() {
  console.log("[REG-MONITOR] 🔧 Manual regulation update triggered");
  return await runRegulationUpdate();
}

/**
 * Start regulation monitoring service
 */
async function startRegulationMonitoring() {
  try {
    // Initialize regulations if needed
    await initializeRegulationsIfNeeded();

    // Schedule monthly updates
    const job = scheduleRegulationUpdates();

    console.log("[REG-MONITOR] ✅ Regulation monitoring service started");

    return { job, status: "running" };
  } catch (error) {
    console.error(
      "[REG-MONITOR] ❌ Failed to start regulation monitoring:",
      error
    );
    throw error;
  }
}

module.exports = {
  runRegulationUpdate,
  initializeRegulationsIfNeeded,
  scheduleRegulationUpdates,
  triggerManualUpdate,
  startRegulationMonitoring,
};
