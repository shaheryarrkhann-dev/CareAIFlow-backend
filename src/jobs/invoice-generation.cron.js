const cron = require("node-cron");
const prisma = require("../lib/prisma");
const {
  generateInvoicesForMonth,
} = require("../services/billing/invoice.service");
const { logBillingAction } = require("../services/compliance/audit.service");

/**
 * Monthly Invoice Generation Cron Job
 * Runs on the 1st day of each month at 13:00 (1pm)
 * Generates invoices for all active residents with billing tiers assigned
 * Only generates invoices if no invoice exists for the current month
 */
async function generateMonthlyInvoices() {
  console.log("\n📅 [CRON] Starting monthly invoice generation job...");
  const startTime = new Date();

  try {
    // Get current month (first day of current month)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const billingMonth = new Date(Date.UTC(currentYear, currentMonth, 1));

    console.log(
      `📅 [CRON] Generating invoices for month: ${billingMonth
        .toISOString()
        .slice(0, 7)}`
    );

    // Get all active tenants
    const tenants = await prisma.tenant.findMany({
      where: {
        isActive: true, // Only process active tenants
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (tenants.length === 0) {
      console.log(
        "⚠️  [CRON] No active tenants found. Skipping invoice generation."
      );
      return;
    }

    console.log(`📊 [CRON] Processing ${tenants.length} tenant(s)...`);

    const results = {
      totalTenants: tenants.length,
      processedTenants: 0,
      totalGenerated: 0,
      totalSkipped: 0,
      totalErrors: 0,
      tenantResults: [],
    };

    // Process each tenant
    for (const tenant of tenants) {
      try {
        console.log(
          `\n🏢 [CRON] Processing tenant: ${tenant.name} (${tenant.id})...`
        );

        // Create system user object for service call
        const systemUser = {
          id: null, // System-generated
          role: "SYSTEM",
          tenantId: tenant.id,
        };

        // Generate invoices for this tenant
        const result = await generateInvoicesForMonth(
          billingMonth,
          tenant.id,
          systemUser
        );

        results.processedTenants++;
        results.totalGenerated += result.generated || 0;
        results.totalSkipped += result.skipped || 0;
        results.totalErrors += result.errors?.length || 0;

        results.tenantResults.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          generated: result.generated || 0,
          skipped: result.skipped || 0,
          errors: result.errors?.length || 0,
          errorDetails: result.errors || [],
        });

        console.log(
          `✅ [CRON] Tenant ${tenant.name}: Generated ${
            result.generated || 0
          }, Skipped ${result.skipped || 0}, Errors: ${
            result.errors?.length || 0
          }`
        );

        // Log audit event for this tenant's invoice generation
        try {
          await logBillingAction({
            action: "INVOICE_GENERATED",
            userId: null, // System-generated
            tenantId: tenant.id,
            resourceId: null, // Bulk operation
            req: null,
            metadata: {
              month: billingMonth.toISOString().slice(0, 7),
              generated: result.generated || 0,
              skipped: result.skipped || 0,
              errors: result.errors?.length || 0,
              generatedBy: "System (Cron Job)",
              jobType: "monthly_invoice_generation",
            },
          });
        } catch (auditError) {
          console.error(
            `❌ [CRON] Failed to log audit for tenant ${tenant.name}:`,
            auditError.message
          );
        }
      } catch (tenantError) {
        console.error(
          `❌ [CRON] Error processing tenant ${tenant.name}:`,
          tenantError.message
        );
        results.totalErrors++;
        results.tenantResults.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          generated: 0,
          skipped: 0,
          errors: 1,
          errorDetails: [{ error: tenantError.message }],
        });
      }
    }

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n📊 [CRON] Monthly Invoice Generation Summary:");
    console.log(`   Total Tenants: ${results.totalTenants}`);
    console.log(`   Processed: ${results.processedTenants}`);
    console.log(`   Total Generated: ${results.totalGenerated}`);
    console.log(`   Total Skipped: ${results.totalSkipped}`);
    console.log(`   Total Errors: ${results.totalErrors}`);
    console.log(`   Duration: ${duration}s`);
    console.log("✅ [CRON] Monthly invoice generation job completed.\n");

    // Log overall audit event
    try {
      await logBillingAction({
        action: "INVOICE_GENERATED",
        userId: null, // System-generated
        tenantId: null, // All tenants
        resourceId: null, // Bulk operation
        req: null,
        metadata: {
          month: billingMonth.toISOString().slice(0, 7),
          totalTenants: results.totalTenants,
          processedTenants: results.processedTenants,
          totalGenerated: results.totalGenerated,
          totalSkipped: results.totalSkipped,
          totalErrors: results.totalErrors,
          duration: `${duration}s`,
          generatedBy: "System (Cron Job)",
          jobType: "monthly_invoice_generation",
        },
      });
    } catch (auditError) {
      console.error(
        "❌ [CRON] Failed to log overall audit:",
        auditError.message
      );
    }
  } catch (error) {
    console.error("❌ [CRON] Monthly invoice generation job failed:", error);

    // Log error audit event
    try {
      await logBillingAction({
        action: "INVOICE_GENERATED",
        userId: null,
        tenantId: null,
        resourceId: null,
        req: null,
        metadata: {
          error: error.message,
          generatedBy: "System (Cron Job)",
          jobType: "monthly_invoice_generation",
          status: "failed",
        },
      });
    } catch (auditError) {
      console.error("❌ [CRON] Failed to log error audit:", auditError.message);
    }
  }
}

/**
 * Initialize and start the cron job
 * Schedule: Runs on the 1st day of each month at 13:00 (1pm)
 * Cron expression: "0 13 1 * *" (minute hour day month dayOfWeek)
 */
function initializeInvoiceGenerationCron() {
  // Cron expression: "0 13 1 * *"
  // - 0: minute (0)
  // - 13: hour (1pm)
  // - 1: day of month (1st)
  // - *: every month
  // - *: every day of week
  const cronExpression = "0 13 1 * *";

  console.log("🕐 [CRON] Invoice generation cron job scheduled:");
  console.log(`   Schedule: 1st day of each month at 13:00 (1pm)`);
  console.log(`   Expression: ${cronExpression}\n`);

  // Schedule the cron job
  const job = cron.schedule(
    cronExpression,
    async () => {
      await generateMonthlyInvoices();
    },
    {
      scheduled: true,
      timezone: "UTC", // Run in UTC timezone
    }
  );

  // Optional: Run immediately on startup for testing (comment out in production)
  // Uncomment the line below if you want to test the job immediately
  // generateMonthlyInvoices();

  return job;
}

module.exports = {
  initializeInvoiceGenerationCron,
  generateMonthlyInvoices, // Export for manual testing
};
