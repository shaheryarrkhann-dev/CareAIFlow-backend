const cron = require("node-cron");
const { runAllTenantDigests } = require("../services/compliance/document-compliance-email.service");

async function runDocumentComplianceDigest() {
  console.log("\n📁 [CRON] Starting document compliance email digest...");
  const startTime = Date.now();

  try {
    const results = await runAllTenantDigests();
    const sent = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => r.error).length;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
      `✅ [CRON] Document compliance digest done in ${duration}s — sent: ${sent}, skipped: ${skipped}, failed: ${failed}\n`
    );
  } catch (error) {
    console.error("❌ [CRON] Document compliance digest failed:", error.message);
  }
}

function initializeDocumentComplianceDigestCron() {
  const cronExpression = "0 9 * * 1";
  console.log("🕐 [CRON] Document compliance digest scheduled:");
  console.log("   Schedule: Mondays at 09:00 UTC");
  console.log(`   Expression: ${cronExpression}\n`);

  cron.schedule(cronExpression, () => runDocumentComplianceDigest(), {
    scheduled: true,
    timezone: "UTC",
  });

  return { runDocumentComplianceDigest };
}

module.exports = {
  initializeDocumentComplianceDigestCron,
  runDocumentComplianceDigest,
};
