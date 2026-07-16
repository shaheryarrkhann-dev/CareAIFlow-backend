const { app, initDb } = require("./app");
require("dotenv").config();

// Initialize cron jobs
const {
  initializeInvoiceGenerationCron,
} = require("./jobs/invoice-generation.cron");
const {
  initializeEvacuationDrillAlertCron,
} = require("./jobs/evacuation-drill-alert.cron");
const {
  initializeStaffDocumentAlertCron,
} = require("./jobs/staff-document-alert.cron");
const {
  initializeAppointmentReminderCron,
} = require("./jobs/appointment-reminder.cron");
const {
  initializeBirthdayReminderCron,
} = require("./jobs/birthday-reminder.cron");
const { initializeFirebase } = require("./config/firebase");
const {
  initializeOverdueTaskCron,
} = require("./jobs/overdue-task-reminder.cron");
const {
  initializeVisitorReminderAutocheckoutCron,
} = require("./jobs/visitor-reminder-autocheckout.cron");
const {
  startNcpExtractionWorker,
  isBullMQAvailable,
} = require("./services/background-jobs/ncp-extraction.queue");

const PORT = process.env.PORT || 4000;

/** When false, run `node src/worker.js` (or npm run start:worker) separately. Default true for backward compatibility. */
const startNcpWorkerInApi =
  process.env.START_NCP_WORKER_IN_API !== "false";

(async () => {
  try {
    await initDb();

    // Initialize Firebase for push notifications
    initializeFirebase();

    // BullMQ NCP worker: embedded in API (default) or standalone worker process
    if (startNcpWorkerInApi) {
      startNcpExtractionWorker();
    } else if (isBullMQAvailable()) {
      console.log(
        "[NCP-QUEUE] BullMQ worker disabled on API (START_NCP_WORKER_IN_API=false). Run worker process: npm run start:worker"
      );
    }

    // Initialize cron jobs
    initializeInvoiceGenerationCron();
    initializeEvacuationDrillAlertCron();
    initializeStaffDocumentAlertCron();
    initializeAppointmentReminderCron();
    initializeBirthdayReminderCron();
    initializeOverdueTaskCron();
    initializeVisitorReminderAutocheckoutCron();

    const server = app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`\n📚 API Endpoints:`);
      console.log(`   POST   /api/auth/login`);
      console.log(`   POST   /api/auth/refresh-token`);
      console.log(`   POST   /api/auth/logout`);
      console.log(`   POST   /api/auth/forgot-password`);
      console.log(`   POST   /api/auth/reset-password`);
      console.log(`   POST   /api/auth/invite-user (ADMIN/SUPER_ADMIN)`);
      console.log(`   GET    /api/auth/me (Authenticated)`);
      console.log(`\n🧠 Embeddings:`);
      console.log(`   POST   /api/embeddings/upload (Authenticated)`);
      console.log(`\n📋 AI-Powered Forms (RAG):`);
      console.log(`   POST API  /api/forms/generate-schema (ADMIN/SUPER_ADMIN)`);
      console.log(`   GET    /api/forms/schemas (List form schemas)`);
      console.log(`   GET    /api/forms/schemas/:id (Get schema)`);
      console.log(`   POST   /api/forms/:formId/submit (Submit form)`);
      console.log(`   GET    /api/forms/:formId/responses (View responses)`);
      console.log(`\n🏢 Tenant Management:`);
      console.log(`   GET    /api/tenants (List organizations)`);
      console.log(`   POST   /api/tenants (Create org - SUPER_ADMIN)`);
      console.log(`   GET    /api/tenants/:id/users (View org users)`);
      console.log(`   GET    /api/tenants/:id/stats (Org statistics)`);
      console.log(
        `\n📖 Swagger Documentation: http://localhost:${PORT}/api-docs`
      );
      console.log(`🏥 Health check: http://localhost:${PORT}/health\n`);
    });

    // Set server timeout to 5 minutes for long-running operations (e.g., PDF uploads)
    server.timeout = 300000; // 5 minutes in milliseconds
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds (must be > keepAliveTimeout)
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
