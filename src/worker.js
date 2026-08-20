/**
 * Standalone BullMQ worker for NCP PDF extraction.
 *
 * Run on the same EC2 (second process) or a separate instance.
 * Requires REDIS_URL / REDIS_URI (same as API).
 *
 *   node src/worker.js
 *   npm run start:worker
 *
 * On the API process, set START_NCP_WORKER_IN_API=false so only this process consumes the queue.
 */
require("dotenv").config();

const prisma = require("./lib/prisma");
const {
  startNcpExtractionWorker,
  stopNcpExtractionWorker,
  isBullMQAvailable,
} = require("./services/background-jobs/ncp-extraction.queue");

async function connectDb() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  console.log("✅ [worker] Database connected");
}

async function main() {
  if (!isBullMQAvailable()) {
    console.error(
      "[worker] REDIS_URL or REDIS_URI must be set for the NCP extraction worker."
    );
    process.exit(1);
  }

  await connectDb();

  const worker = startNcpExtractionWorker();
  if (!worker) {
    console.error("[worker] Failed to start BullMQ worker.");
    process.exit(1);
  }

  console.log(
    "🧰 NCP extraction worker process running (queue: ncp-extraction)"
  );
}

async function shutdown(signal) {
  console.log(`\n[worker] ${signal} received, shutting down...`);
  try {
    await stopNcpExtractionWorker();
  } catch (e) {
    console.error("[worker] Error stopping worker:", e.message);
  }
  try {
    await prisma.$disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
