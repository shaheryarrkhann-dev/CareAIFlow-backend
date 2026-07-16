/**
 * NCP Extraction queue using BullMQ (Redis).
 * When REDIS_URL is set, NCP extraction jobs are queued here and progress is reportable via job.updateProgress().
 * Falls back to in-memory queue when Redis is not configured.
 */
const { Queue, Worker } = require("bullmq");
const prisma = require("../../lib/prisma");

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_URI;
const connection = REDIS_URL
  ? { url: REDIS_URL }
  : null;

// Hash tag `{...}` required for Redis Cluster / ElastiCache Serverless so all BullMQ keys share one slot (avoids CROSSSLOT).
const QUEUE_NAME = "{ncp-extraction}";

let ncpQueue = null;
let ncpWorker = null;

function getQueue() {
  if (!connection) return null;
  if (!ncpQueue) {
    ncpQueue = new Queue(QUEUE_NAME, { connection });
  }
  return ncpQueue;
}

/**
 * Add NCP extraction job to BullMQ queue.
 * @returns {{ jobId: string } | null} Job id if queued, null if Redis not configured
 */
async function addNcpExtractionJob(data) {
  const queue = getQueue();
  if (!queue) return null;

  const job = await queue.add(
    "extract",
    {
      extractionId: data.extractionId,
      s3Key: data.s3Key,
      tenantId: data.tenantId,
      userId: data.userId,
      residentId: data.residentId ?? null,
    },
    {
      jobId: data.jobId || undefined,
      removeOnComplete: { count: 500 },
    }
  );

  return { jobId: job.id };
}

/**
 * Start the NCP extraction worker (call once at app startup when Redis is configured).
 */
function startNcpExtractionWorker() {
  if (!connection) {
    console.log("[NCP-QUEUE] REDIS_URL not set, NCP extraction will use in-memory queue");
    return null;
  }

  if (ncpWorker) return ncpWorker;

  const { processNcpExtraction } = require("../ncp/ncp.service");

  ncpWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { extractionId, s3Key, tenantId, userId, residentId } = job.data;

      await processNcpExtraction(
        { extractionId, s3Key, tenantId, userId, residentId },
        {
          onProgress: async (message, percent) => {
            try {
              await job.updateProgress({
                step: message,
                percent: typeof percent === "number" ? percent : null,
              });
            } catch (e) {
              // ignore Redis progress update errors
            }
          },
        }
      );

      // Automatically generate DSHS draft (Layer 1 + Layer 2) after extraction completes.
      // Errors are swallowed inside runDshsDraftBackground so the BullMQ job still succeeds.
      const { runDshsDraftBackground } = require("../ncp/ncp-dshs-draft.service");
      await runDshsDraftBackground(extractionId, tenantId, userId);
    },
    {
      connection,
      concurrency: 2,
    }
  );

  ncpWorker.on("completed", (job) => {
    console.log(`[NCP-QUEUE] Job ${job.id} completed`);
  });

  ncpWorker.on("failed", (job, err) => {
    console.error(`[NCP-QUEUE] Job ${job?.id} failed:`, err?.message);
  });

  console.log("[NCP-QUEUE] BullMQ worker started for", QUEUE_NAME);
  return ncpWorker;
}

/**
 * Close the BullMQ worker (graceful shutdown for standalone worker process).
 * @returns {Promise<void>}
 */
async function stopNcpExtractionWorker() {
  if (!ncpWorker) return;
  const w = ncpWorker;
  ncpWorker = null;
  await w.close();
  console.log("[NCP-QUEUE] BullMQ worker stopped");
}

/**
 * Get progress for an extraction (from DB or from BullMQ job).
 * @param {string} extractionId
 * @param {string} [bullJobId]
 * @returns {Promise<{ step: string, percent: number | null }>}
 */
async function getExtractionProgress(extractionId, bullJobId) {
  const extraction = await prisma.ncpExtraction.findFirst({
    where: { id: extractionId },
    select: { errorMessage: true, status: true },
  });

  if (!extraction) {
    return { step: "Unknown", percent: null };
  }

  let step = "";
  if (extraction.errorMessage && extraction.errorMessage.startsWith("PROGRESS:")) {
    step = extraction.errorMessage.replace(/^PROGRESS:/, "");
  } else if (extraction.status === "PENDING") {
    step = "Queued, waiting to start...";
  } else if (extraction.status === "EXTRACTING") {
    step = "Processing...";
  }

  return { step, percent: extraction.progressPercent ?? null };
}

module.exports = {
  isBullMQAvailable: () => !!connection,
  getQueue,
  addNcpExtractionJob,
  startNcpExtractionWorker,
  stopNcpExtractionWorker,
  getExtractionProgress,
};
