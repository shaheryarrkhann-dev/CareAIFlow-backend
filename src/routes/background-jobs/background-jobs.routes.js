const express = require("express");
const {
  backgroundJobQueue,
} = require("../../services/background-jobs/background-jobs");
const authenticate = require("../../middlewares/auth.middleware");

const router = express.Router();

/**
 * GET /api/background-jobs
 * Get all background jobs (for debugging/monitoring)
 */
router.get("/", authenticate(), async (req, res) => {
  try {
    const jobs = backgroundJobQueue.getAllJobs();

    res.json({
      success: true,
      count: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
        error: job.error,
        data: job.data,
      })),
    });
  } catch (error) {
    console.error("Error fetching background jobs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch background jobs",
    });
  }
});

/**
 * GET /api/background-jobs/:jobId
 * Get specific job status
 */
router.get("/:jobId", authenticate(), async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = backgroundJobQueue.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
        error: job.error,
        data: job.data,
        result: job.result,
      },
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch job status",
    });
  }
});

module.exports = router;
