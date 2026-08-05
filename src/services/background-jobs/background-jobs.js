const { generateFormSchema } = require("../ai/ai.service");
const {
  remapTemplateFieldMapping,
  getTenantPdfTemplates,
  regenerateTemplateFieldMappingWithSchema,
} = require("../pdf/pdf.service");
// Note: processNcpExtraction is imported inside processJob to avoid circular dependency

/**
 * Simple background job queue for schema generation
 */
class BackgroundJobQueue {
  constructor() {
    this.jobs = new Map();
    this.isProcessing = false;
  }

  /**
   * Add a schema generation job to the queue
   */
  addSchemaGenerationJob({ tenantId, formName, description, userId, jobId }) {
    const job = {
      id:
        jobId ||
        `schema-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "schema_generation",
      data: { tenantId, formName, description, userId },
      status: "queued",
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
    };

    this.jobs.set(job.id, job);
    console.log(`[BACKGROUND-JOB] Queued schema generation job: ${job.id}`);

    // Process jobs if not already processing
    if (!this.isProcessing) {
      this.processJobs();
    }

    return job.id;
  }

  /**
   * Add an NCP extraction job to the queue
   * @param {Object} params - Job parameters
   * @param {string} params.extractionId - NCP extraction ID
   * @param {string} params.s3Key - S3 key of uploaded PDF
   * @param {string} params.tenantId - Tenant ID
   * @param {string} params.userId - User ID
   * @param {string} [params.residentId] - Resident ID (optional)
   * @param {string} [params.jobId] - Optional custom job ID
   * @returns {string} Job ID
   */
  addNcpExtractionJob({ extractionId, s3Key, tenantId, userId, residentId = null, jobId }) {
    const job = {
      id:
        jobId ||
        `ncp-extraction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: "ncp_extraction",
      data: { extractionId, s3Key, tenantId, userId, residentId },
      status: "queued",
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3,
    };

    this.jobs.set(job.id, job);
    console.log(`[BACKGROUND-JOB] Queued NCP extraction job: ${job.id} for extraction ${extractionId}`);

    // Process jobs if not already processing
    if (!this.isProcessing) {
      this.processJobs();
    }

    return job.id;
  }

  /**
   * Process all queued jobs
   */
  async processJobs() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    console.log(`[BACKGROUND-JOB] Starting job processing...`);

    while (this.jobs.size > 0) {
      const job = this.getNextJob();
      if (!job) break;

      try {
        await this.processJob(job);
      } catch (error) {
        console.error(`[BACKGROUND-JOB] Job ${job.id} failed:`, error.message);
        this.handleJobFailure(job, error);
      }
    }

    this.isProcessing = false;
    console.log(`[BACKGROUND-JOB] Job processing completed`);
  }

  /**
   * Get the next job to process
   */
  getNextJob() {
    for (const [id, job] of this.jobs) {
      if (job.status === "queued") {
        return job;
      }
    }
    return null;
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    console.log(
      `[BACKGROUND-JOB] Processing job ${job.id} (attempt ${job.attempts + 1}/${
        job.maxAttempts
      })`
    );

    job.status = "processing";
    job.attempts++;

    if (job.type === "ncp_extraction") {
      const { extractionId, s3Key, tenantId, userId, residentId } = job.data;

      // Import here to avoid circular dependency with ncp.service.js
      const { processNcpExtraction } = require("../ncp/ncp.service");

      await processNcpExtraction({
        extractionId,
        s3Key,
        tenantId,
        userId,
        residentId,
      });

      job.status = "completed";
      job.completedAt = new Date();

      console.log(`[BACKGROUND-JOB] ✅ NCP extraction job ${job.id} completed successfully`);

      // Automatically generate DSHS draft (Layer 1 + Layer 2) after extraction completes.
      // Errors are swallowed inside runDshsDraftBackground so the job still succeeds.
      const { runDshsDraftBackground } = require("../ncp/ncp-dshs-draft.service");
      await runDshsDraftBackground(extractionId, tenantId, userId);
    } else if (job.type === "schema_generation") {
      const { tenantId, formName, description, userId } = job.data;

      const result = await generateFormSchema({
        tenantId,
        formName,
        description,
        userId,
      });

      job.status = "completed";
      job.result = result;
      job.completedAt = new Date();

      console.log(`[BACKGROUND-JOB] ✅ Job ${job.id} completed successfully`);
      console.log(
        `[BACKGROUND-JOB] Schema: ${
          result.merged ? "Merged" : "Created"
        } with ${result.newFieldsAdded} fields`
      );

      // Auto-remap all PDF templates using schema-driven detection for 100% coverage
      // Note: Template might be saved after this job starts, so we retry with delay
      try {
        const remapTemplates = async (attempt = 1, maxAttempts = 3) => {
          console.log(
            `[BACKGROUND-JOB] 🔄 Auto-remapping PDF templates with schema-driven detection (attempt ${attempt}/${maxAttempts})...`
          );
          const templates = await getTenantPdfTemplates(tenantId);
          console.log(
            `[BACKGROUND-JOB] Found ${templates.length} templates to remap`
          );

          // If no templates found and we haven't reached max attempts, retry after delay
          if (templates.length === 0 && attempt < maxAttempts) {
            const delayMs = attempt * 2000; // 2s, 4s, 6s delays
            console.log(
              `[BACKGROUND-JOB] ⏳ No templates found yet, retrying in ${delayMs}ms... (template may still be saving)`
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return remapTemplates(attempt + 1, maxAttempts);
          }

          if (templates.length === 0) {
            console.log(
              `[BACKGROUND-JOB] ⚠️ No templates found after ${maxAttempts} attempts - template may be saved later, will remap on next upload`
            );
            return;
          }

          for (const template of templates) {
            try {
              console.log(
                `[BACKGROUND-JOB] 🔄 Regenerating template ${template.id} with schema-driven detection...`
              );
              const remapResult =
                await regenerateTemplateFieldMappingWithSchema({
                  templateId: template.id,
                  tenantId,
                });
              if (remapResult.success) {
                console.log(
                  `[BACKGROUND-JOB] ✅ Schema-driven remap for template ${
                    template.id
                  }: ${remapResult.matched} found, ${
                    remapResult.notInPdf || 0
                  } not in PDF, ${remapResult.total} total (100% coverage)`
                );
              } else {
                console.warn(
                  `[BACKGROUND-JOB] ⚠️ Schema-driven remap failed for template ${template.id}, falling back to traditional remapping...`
                );
                // Fallback to traditional remapping
                const fallbackResult = await remapTemplateFieldMapping({
                  templateId: template.id,
                  tenantId,
                });
                console.log(
                  `[BACKGROUND-JOB] ✅ Fallback remap for template ${template.id}: ${fallbackResult.matched}/${fallbackResult.total} fields`
                );
              }
            } catch (remapError) {
              console.error(
                `[BACKGROUND-JOB] ❌ Failed to remap template ${template.id}:`,
                remapError.message
              );
              // Continue with other templates
            }
          }
          console.log(
            `[BACKGROUND-JOB] ✅ Auto-remapping completed for ${templates.length} templates`
          );
        };

        await remapTemplates();
      } catch (remapError) {
        console.error(
          "[BACKGROUND-JOB] Auto-remapping failed:",
          remapError.message
        );
        // Don't fail the job if remapping fails
      }
    }

    // Remove completed job
    this.jobs.delete(job.id);
  }

  /**
   * Handle job failure
   */
  handleJobFailure(job, error) {
    job.status = "failed";
    job.error = error.message;
    job.failedAt = new Date();

    if (job.attempts < job.maxAttempts) {
      // Retry after delay
      job.status = "queued";
      const delay = Math.pow(2, job.attempts) * 1000; // Exponential backoff
      console.log(`[BACKGROUND-JOB] Retrying job ${job.id} in ${delay}ms...`);

      setTimeout(() => {
        this.processJobs();
      }, delay);
    } else {
      console.error(
        `[BACKGROUND-JOB] ❌ Job ${job.id} failed permanently after ${job.attempts} attempts`
      );
      this.jobs.delete(job.id);
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }
}

// Create singleton instance
const backgroundJobQueue = new BackgroundJobQueue();

module.exports = {
  backgroundJobQueue,
};
