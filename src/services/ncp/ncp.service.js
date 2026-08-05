const prisma = require("../../lib/prisma");
const {
  uploadPdfToS3,
  downloadPdfFromS3,
  s3Client,
} = require("../../utils/s3.util");
const {
  extractTextFromPdf,
  validatePdfStructure,
  chunkPdfText,
} = require("./ncp-pdf-extraction.service");
const {
  CLAUDE_MODEL,
  extractNcpDataFromText,
  getMissingFields,
  extractMissingFieldsFromText,
  normalizeFieldValues,
  loadNcpSchema,
  validateExtractedData,
  fillEmptyFieldsWithAI,
} = require("./ncp-ai-extraction.service");
const {
  extractNcpDataFromPdfVision,
  shouldUseVisionApi,
} = require("./ncp-vision-extraction.service");
const { generatePopulatedDocx } = require("./ncp-docx-population.service");
const { logUserAction } = require("../compliance/audit.service");
const {
  extractResidentNameFromModel,
} = require("../resident/resident.service");
const { backgroundJobQueue } = require("../background-jobs/background-jobs");

/**
 * Ensure extracted data has every schema key so GET and UI sections are complete.
 * Missing keys: checkbox -> "", other -> "Not indicated in assessment".
 * @param {Object} data - Current extracted data
 * @param {Object} schema - NCP schema (properties keyed by field name)
 * @returns {Object} New object with all schema keys present
 */
function ensureAllSchemaKeys(data, schema) {
  const result = { ...data };
  for (const fieldName of Object.keys(schema)) {
    if (result[fieldName] !== undefined && result[fieldName] !== null &&
        (typeof result[fieldName] !== "string" || result[fieldName].trim() !== "")) {
      continue;
    }
    const fieldDef = schema[fieldName];
    const isCheckbox = fieldDef?.enum &&
      JSON.stringify(fieldDef.enum) === JSON.stringify(["X", ""]);
    result[fieldName] = "";
  }
  return result;
}

function assertNcpExtractionNotArchived(extraction) {
  if (extraction?.deletedAt) {
    throw new Error("Cannot modify an archived extraction");
  }
}

/**
 * Process NCP extraction in background (called by background job)
 * Downloads PDF from S3 and performs extraction
 * @param {Object} params - Processing parameters
 * @param {string} params.extractionId - Extraction ID
 * @param {string} params.s3Key - S3 key of PDF
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID
 * @param {string} [params.residentId] - Resident ID (optional)
 * @returns {Promise<void>}
 */
async function processNcpExtraction(
  {
    extractionId,
    s3Key,
    tenantId,
    userId,
    residentId = null,
  },
  options = {}
) {
  console.log(`[NCP-BG] Job started for extraction ${extractionId} (s3Key: ${s3Key ? "set" : "missing"})`);
  const { onProgress: externalOnProgress } = options;

  // Helper to update progress (DB + optional BullMQ/job callback)
  // Note: progressPercent is only written when DB has progress_percent column (run migration to add it)
  async function updateProgress(message, percent) {
    try {
      const data = { errorMessage: `PROGRESS:${message}` };
      await prisma.ncpExtraction.update({
        where: { id: extractionId },
        data,
      });
      if (typeof externalOnProgress === "function") {
        await externalOnProgress(message, percent);
      }
    } catch (e) {
      console.warn("[NCP-BG] Failed to update progress:", e.message);
    }
  }

  try {
    console.log(
      `[NCP-BG] Starting background extraction for ${extractionId}...`
    );

    // Update status to EXTRACTING
    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: { status: "EXTRACTING", errorMessage: "PROGRESS:Initializing extraction..." },
    });
    if (externalOnProgress) await externalOnProgress("Initializing extraction...", 0);

    // Step 1: Download PDF from S3
    console.log(`[NCP-BG] Downloading PDF from S3: ${s3Key}`);
    await updateProgress("Downloading PDF from storage...", 3);
    const pdfBuffer = await downloadPdfFromS3(s3Key);

    // Step 2: Validate PDF
    await updateProgress("Validating PDF structure...", 5);
    const validation = await validatePdfStructure(pdfBuffer);
    if (!validation.isValid) {
      throw new Error(`Invalid PDF: ${validation.error}`);
    }

    // Step 3: Determine extraction method (Vision API or text-based)
    console.log("[NCP-BG] Determining extraction method...");
    await updateProgress("Analyzing document layout...", 8);
    const extractionDecision = await shouldUseVisionApi(pdfBuffer);
    console.log(
      `[NCP-BG] Extraction decision: ${
        extractionDecision.useVision ? "Vision API" : "Text-based"
      } - ${extractionDecision.reason}`
    );

    let extractionResult;

    if (extractionDecision.useVision) {
      // Use Vision API for image-based PDFs or complex layouts (Layer 1)
      console.log("[NCP-BG] Using Vision API for extraction (Layer 1)...");
      await updateProgress("Extracting data using AI Vision (Layer 1)...", 12);
      const visionResult = await extractNcpDataFromPdfVision(pdfBuffer);

      await updateProgress("Normalizing extracted field values...", 35);
      const schema = loadNcpSchema();
      let normalizedData = normalizeFieldValues(visionResult.data, schema);

      // Layer 2: fill missing fields using text extraction + AI inference
      const missingFieldNames = getMissingFields(normalizedData, schema);
      if (missingFieldNames.length > 0) {
        console.log(
          `[NCP-BG] Layer 2: ${missingFieldNames.length} fields missing after vision, running text-based inference...`
        );
        await updateProgress(`Extracting ${missingFieldNames.length} missing fields (Layer 2)...`, 45);
        try {
          const pdfResult = await extractTextFromPdf(pdfBuffer);
          const fullText = pdfResult.text || "";
          if (fullText.trim().length > 0) {
            const layer2Data = await extractMissingFieldsFromText(
              fullText,
              missingFieldNames,
              schema
            );
            Object.entries(layer2Data).forEach(([fieldName, value]) => {
              const current = normalizedData[fieldName];
              const isEmpty =
                current == null ||
                current === "" ||
                (typeof current === "string" && current.trim() === "");
              if (isEmpty && value !== undefined) {
                normalizedData[fieldName] = value;
              }
            });
            normalizedData = normalizeFieldValues(normalizedData, schema);
          }
        } catch (layer2Err) {
          console.warn("[NCP-BG] Layer 2 (vision path) failed, keeping vision data only:", layer2Err.message);
        }
      }

      // Layer 3: document-based fill for remaining empty fields (vision path)
      await updateProgress("Generating contextual values for empty fields...", 52);
      try {
        let fullTextForLayer3 = "";
        try {
          const pdfResultForLayer3 = await extractTextFromPdf(pdfBuffer);
          fullTextForLayer3 = pdfResultForLayer3.text || "";
        } catch (_) { /* ignore */ }
        normalizedData = await fillEmptyFieldsWithAI(normalizedData, schema, {
          fullDocumentText: fullTextForLayer3,
        });
      } catch (layer3Err) {
        console.warn("[NCP-BG] Layer 3 (vision path) failed:", layer3Err.message);
      }

      await updateProgress("Validating extracted data...", 55);
      const validationResult = validateExtractedData(normalizedData, schema);
      extractionResult = {
        data: normalizedData,
        validation: validationResult,
        metadata: {
          ...visionResult.metadata,
          extractionMethod: "vision",
        },
      };
    } else {
      // Use text-based extraction for text-rich PDFs
      console.log("[NCP-BG] Using text-based extraction...");

      // Step 3a: Extract text from PDF
      console.log("[NCP-BG] Extracting text from PDF...");
      await updateProgress("Extracting text from PDF pages...", 10);
      const pdfResult = await extractTextFromPdf(pdfBuffer);

      // Step 3b: Chunk text for processing
      console.log("[NCP-BG] Chunking text...");
      await updateProgress("Preparing text for AI processing...", 12);
      const chunks = chunkPdfText(pdfResult.text, {
        maxChunkSize: 300000, // Increased to 300k chars (~75k tokens) - GPT-4.1 supports 1M token context
        overlap: 5000, // Increased overlap for better context continuity
        pageCount: pdfResult.pageCount,
      });

      // Step 3c: Extract data using AI (with granular progress)
      console.log(`[NCP-BG] Extracting data using Claude (${chunks.length} chunk(s))...`);
      await updateProgress("Starting extraction...", 15);
      extractionResult = await extractNcpDataFromText(
        chunks.map((c) => c.text),
        { onProgress: (msg, pct) => updateProgress(msg, pct) }
      );
    }

    // Layer 3 already runs inside extractNcpDataFromText (with full document) for document-based inference.
    await updateProgress("Finalizing...", 75);
    const finalSchema = loadNcpSchema();
    // Ensure every schema key exists so sections and GET always have full data (fallback for any still-missing keys only)
    extractionResult.data = ensureAllSchemaKeys(extractionResult.data, finalSchema);

    await updateProgress("Saving extracted data...", 95);

    // Step 6: Update extraction record with results
    console.log("[NCP-BG] Saving extracted data...");
    const extraction = await prisma.ncpExtraction.findUnique({
      where: { id: extractionId },
      select: { sourcePdfFileName: true, sourcePdfSize: true },
    });

    await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        extractedData: extractionResult.data,
        status: "EXTRACTED", // Mark as extracted even if validation has warnings
        extractionMethod:
          extractionResult.metadata?.extractionMethod ||
          (extractionDecision.useVision ? "vision" : "claude"),
        extractionModel: extractionDecision.useVision
          ? "gpt-4.1-2025-04-14"
          : CLAUDE_MODEL,
        extractedAt: new Date(),
        errorMessage:
          extractionResult.validation.errors.length > 0
            ? extractionResult.validation.errors.join("; ")
            : null,
      },
    });

    // Step 7: Log PHI access
    await logUserAction({
      userId,
      tenantId,
      action: "PHI_EXTRACT_NCP",
      resourceId: extractionId,
      req: null, // Background job, no HTTP request
      metadata: {
        fileName: extraction.sourcePdfFileName,
        fileSize: extraction.sourcePdfSize,
        fieldsExtracted: extractionResult.metadata?.fieldsExtracted || 0,
        validationStatus: extractionResult.validation?.isValid
          ? "valid"
          : "has_errors",
        residentId,
        resourceType: "NCP_EXTRACTION",
      },
    });

    console.log(`[NCP-BG] ✅ Extraction complete: ${extractionId}`);
  } catch (error) {
    console.error(
      `[NCP-BG] Error processing extraction ${extractionId}:`,
      error
    );

    // Update extraction record with error (truncate long messages for DB)
    const errorMsg = typeof error.message === "string" ? error.message.slice(0, 2000) : String(error);
    try {
      await prisma.ncpExtraction.update({
        where: { id: extractionId },
        data: {
          status: "FAILED",
          errorMessage: errorMsg,
        },
      });
    } catch (updateError) {
      console.error(
        "[NCP-BG] Failed to update extraction with error:",
        updateError
      );
    }

    throw error;
  }
}

/**
 * Upload PDF and queue extraction job (returns immediately)
 * @param {Object} params - Upload parameters
 * @param {Buffer} params.pdfBuffer - PDF file buffer
 * @param {string} params.fileName - Original file name
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.userId - User ID
 * @param {string} [params.residentId] - Resident ID (optional)
 * @returns {Promise<Object>} Extraction result with ID and PENDING status
 */
async function uploadAndExtractNcp({
  pdfBuffer,
  fileName,
  tenantId,
  userId,
  residentId = null,
}) {
  try {
    console.log(`[NCP] Starting upload for ${fileName}...`);

    // Step 1: Validate PDF
    const validation = await validatePdfStructure(pdfBuffer);
    if (!validation.isValid) {
      throw new Error(`Invalid PDF: ${validation.error}`);
    }

    // Step 2: Upload PDF to S3
    console.log("[NCP] Uploading PDF to S3...");
    const s3Result = await uploadPdfToS3({
      tenantId,
      fileName,
      buffer: pdfBuffer,
    });

    // Step 3: Validate residentId if provided
    if (residentId) {
      const resident = await prisma.resident.findFirst({
        where: {
          id: residentId,
          tenantId,
        },
        select: { id: true },
      });
      if (!resident) {
        throw new Error("Resident not found or does not belong to tenant");
      }
    }

    // Step 4: Create extraction record with PENDING status
    console.log("[NCP] Creating extraction record...");
    const extraction = await prisma.ncpExtraction.create({
      data: {
        tenantId,
        userId,
        residentId,
        sourcePdfS3Key: s3Result.s3Key,
        sourcePdfFileName: fileName,
        sourcePdfSize: pdfBuffer.length,
        extractedData: {},
        status: "PENDING",
      },
    });

    // Step 5: Queue background job (BullMQ if Redis available, else in-memory)
    console.log(
      `[NCP] Queuing background extraction job for ${extraction.id}...`
    );
    const ncpQueue = require("../background-jobs/ncp-extraction.queue");
    if (ncpQueue.isBullMQAvailable()) {
      try {
        const result = await ncpQueue.addNcpExtractionJob({
          extractionId: extraction.id,
          s3Key: s3Result.s3Key,
          tenantId,
          userId,
          residentId,
        });
        if (result?.jobId) {
          await prisma.ncpExtraction.update({
            where: { id: extraction.id },
            data: { bullJobId: result.jobId },
          });
          console.log(`[NCP] ✅ Upload complete, extraction queued (BullMQ): ${extraction.id}`);
          return {
            success: true,
            extraction: {
              id: extraction.id,
              status: "PENDING",
            },
            bullJobId: result.jobId,
          };
        }
      } catch (queueErr) {
        console.warn("[NCP] BullMQ add failed, falling back to in-memory queue:", queueErr.message);
      }
    }

    backgroundJobQueue.addNcpExtractionJob({
      extractionId: extraction.id,
      s3Key: s3Result.s3Key,
      tenantId,
      userId,
      residentId,
    });

    console.log(
      `[NCP] ✅ Upload complete, extraction queued: ${extraction.id}`
    );

    // Return only ID and status - frontend will call GET API to fetch full data
    return {
      success: true,
      extraction: {
        id: extraction.id,
        status: "PENDING",
      },
    };
  } catch (error) {
    console.error("[NCP] Error in uploadAndExtractNcp:", error);
    throw error;
  }
}

/**
 * Upload multiple PDFs and queue extraction jobs
 * @param {Array<Object>} files - Array of file objects with buffer, fileName, and optional residentId
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Array of extraction results
 */
async function uploadAndExtractNcpBulk({ files, tenantId, userId }) {
  try {
    console.log(`[NCP] Starting bulk upload for ${files.length} file(s)...`);

    const results = [];
    const errors = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await uploadAndExtractNcp({
          pdfBuffer: file.buffer,
          fileName: file.fileName,
          tenantId,
          userId,
          residentId: file.residentId || null,
        });
        results.push(result.extraction);
      } catch (error) {
        console.error(
          `[NCP] Error uploading file ${i + 1} (${file.fileName}):`,
          error
        );
        errors.push({
          fileName: file.fileName,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      extractions: results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: files.length,
        successful: results.length,
        failed: errors.length,
      },
    };
  } catch (error) {
    console.error("[NCP] Error in bulk upload:", error);
    throw error;
  }
}

/**
 * Get NCP extraction by ID
 * @param {string} extractionId - Extraction ID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Extraction record
 */
async function getNcpExtractionById(extractionId, user) {
  try {
    const tenantId = user.role === "SUPER_ADMIN" ? undefined : user.tenantId;

    const extraction = await prisma.ncpExtraction.findFirst({
      where: {
        id: extractionId,
        ...(tenantId && { tenantId }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        resident: {
          select: {
            id: true,
            residentFullLegalName: true,
            residentPreferredName: true,
            residentIdentificationFullLegalName: true,
            residentIdentificationPreferredName: true,
          },
        },
      },
    });

    if (!extraction) {
      throw new Error("Extraction not found");
    }

    // Add resident name for display
    const result = {
      ...extraction,
      residentName: extraction.resident
        ? extractResidentNameFromModel(extraction.resident)
        : null,
    };

    return result;
  } catch (error) {
    console.error("[NCP] Error getting extraction:", error);
    throw error;
  }
}

/**
 * Get progress for an extraction (lightweight, for polling - avoids full extraction fetch)
 * @param {string} extractionId
 * @param {Object} user
 * @returns {Promise<{ step: string, percent: number | null, status: string }>}
 */
async function getNcpExtractionProgress(extractionId, user) {
  const tenantId = user.role === "SUPER_ADMIN" ? undefined : user.tenantId;
  const extraction = await prisma.ncpExtraction.findFirst({
    where: {
      id: extractionId,
      ...(tenantId && { tenantId }),
      deletedAt: null,
    },
    select: { errorMessage: true, status: true },
  });
  if (!extraction) {
    throw new Error("Extraction not found");
  }
  let step = "";
  if (extraction.errorMessage && extraction.errorMessage.startsWith("PROGRESS:")) {
    step = extraction.errorMessage.replace(/^PROGRESS:/, "");
  } else if (extraction.status === "PENDING") {
    step = "Queued, waiting to start...";
  } else if (extraction.status === "EXTRACTING") {
    step = "Processing...";
  }
  // percent: only set when DB has progress_percent column (after migration)
  return {
    step,
    percent: extraction.progressPercent ?? null,
    status: extraction.status,
  };
}

/**
 * List NCP extractions with pagination
 * @param {Object} user - Current user
 * @param {Object} options - Query options
 * @returns {Promise<Object>} List of extractions
 */
async function listNcpExtractions(user, options = {}) {
  try {
    const {
      limit = 20,
      offset = 0,
      status = null,
      tenantIdFromQuery = null,
      residentId = null,
      includeArchived = false,
    } = options;

    const tenantId =
      user.role === "SUPER_ADMIN"
        ? tenantIdFromQuery || undefined
        : user.tenantId;

    const where = {};
    if (tenantId) {
      where.tenantId = tenantId;
    }
    if (status) {
      where.status = status;
    }
    if (residentId) {
      where.residentId = residentId;
    }
    if (includeArchived) {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    const [extractions, total] = await Promise.all([
      prisma.ncpExtraction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          resident: {
            select: {
              id: true,
              residentFullLegalName: true,
              residentPreferredName: true,
              residentIdentificationFullLegalName: true,
              residentIdentificationPreferredName: true,
            },
          },
        },
      }),
      prisma.ncpExtraction.count({ where }),
    ]);

    // Add resident names for display
    const extractionsWithNames = extractions.map((extraction) => ({
      ...extraction,
      residentName: extraction.resident
        ? extractResidentNameFromModel(extraction.resident)
        : null,
    }));

    return {
      extractions: extractionsWithNames,
      pagination: {
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    console.error("[NCP] Error listing extractions:", error);
    throw error;
  }
}

/**
 * Update NCP extraction data
 * @param {string} extractionId - Extraction ID
 * @param {Object} extractedData - Updated extracted data
 * @param {Object} user - Current user
 * @returns {Promise<Object>} Updated extraction
 */
async function updateNcpExtraction(extractionId, extractedData, user, options = {}) {
  try {
    // Verify extraction exists and get current data so we never drop keys
    const existing = await getNcpExtractionById(extractionId, user);
    assertNcpExtractionNotArchived(existing);
    const existingData = existing.extractedData && typeof existing.extractedData === "object"
      ? existing.extractedData
      : {};
    // Merge: incoming overrides existing so edits are saved, but keys only in existing are preserved
    const mergedData = { ...existingData, ...extractedData };

    // Detect CBHS flag change so we can trigger Layer 2 re-run after save
    const cbhsChanged =
      options.requiresCbhs !== undefined &&
      options.requiresCbhs !== existing.requiresCbhs;

    const updateData = {
      extractedData: mergedData,
      status: "REVIEWED",
      updatedAt: new Date(),
    };

    // Propagate user edits to whichever draft layer the form was displaying,
    // so the form shows correct data on reload (form prefers layer2Final → layer1Draft → extractedData)
    if (existing.layer2Final && typeof existing.layer2Final === "object") {
      updateData.layer2Final = { ...existing.layer2Final, ...extractedData };
    } else if (existing.layer1Draft && typeof existing.layer1Draft === "object") {
      updateData.layer1Draft = { ...existing.layer1Draft, ...extractedData };
    }

    if (options.requiresCbhs !== undefined) {
      updateData.requiresCbhs = Boolean(options.requiresCbhs);
      updateData.cbhsNotes = options.cbhsNotes ?? null;
    }

    // Update extraction
    const updated = await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: updateData,
    });

    // Log PHI update
    await logUserAction({
      userId: user.id,
      tenantId: user.tenantId,
      action: "PHI_UPDATE_NCP",
      resourceId: extractionId,
      req: null,
      metadata: {
        fieldsUpdated: Object.keys(mergedData).length,
        cbhsChanged,
        resourceType: "NCP_EXTRACTION",
      },
    });

    // If CBHS flag changed and layer1Draft exists, re-run Layer 2 in background
    if (cbhsChanged && existing.layer1Draft) {
      const { rerunLayer2Background } = require("./ncp-dshs-draft.service");
      rerunLayer2Background(extractionId, user.tenantId, user.id).catch(() => {});
    }

    return updated;
  } catch (error) {
    console.error("[NCP] Error updating extraction:", error);
    throw error;
  }
}

/**
 * Generate populated DOCX from extraction
 * @param {string} extractionId - Extraction ID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} DOCX generation result
 */
async function generateNcpDocx(extractionId, user) {
  try {
    // Get extraction
    const extraction = await getNcpExtractionById(extractionId, user);
    assertNcpExtractionNotArchived(extraction);

    if (extraction.status === "PENDING" || extraction.status === "EXTRACTING") {
      throw new Error("Extraction is still in progress");
    }

    if (
      !extraction.extractedData ||
      Object.keys(extraction.extractedData).length === 0
    ) {
      throw new Error("No extracted data available");
    }

    // Generate DOCX — prefer layer2Final (DSHS+CBHS) → layer1Draft (DSHS) → raw extractedData
    const hasLayer2 = !!extraction.layer2Final && Object.keys(extraction.layer2Final).length > 0;
    const hasLayer1 = !!extraction.layer1Draft && Object.keys(extraction.layer1Draft).length > 0;
    const dataSource = hasLayer2 ? "layer2Final" : hasLayer1 ? "layer1Draft" : "extractedData";
    console.log(`[NCP-DOCX-GEN] Extraction ${extractionId}: layer2Final=${hasLayer2}, layer1Draft=${hasLayer1} → using ${dataSource}`);
    const docxData =
      extraction.layer2Final ??
      extraction.layer1Draft ??
      extraction.extractedData;

    const result = await generatePopulatedDocx({
      extractedData: docxData,
      tenantId: extraction.tenantId,
      userId: extraction.userId || user.id,
      extractionId: extraction.id,
    });

    // If a DOCX already existed this is a regeneration — bump version only
    const isRegeneration = !!extraction.populatedDocxS3Key;

    // Update extraction with DOCX info
    const updated = await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        populatedDocxS3Key: result.s3Key,
        populatedDocxUrl: result.s3Url,
        status: "POPULATED",
        populatedAt: new Date(),
        // Bump version on regeneration; first generation stays at 1
        ...(isRegeneration ? { ncpVersion: { increment: 1 } } : {}),
        // Approval is intentionally preserved on regeneration — it is a one-time action
        // per extraction. Re-generating the DOCX (e.g. after editing the form) should not
        // force the user to re-approve.
      },
    });

    // Log PHI access
    await logUserAction({
      userId: user.id,
      tenantId: user.tenantId,
      action: "PHI_GENERATE_NCP_DOCX",
      resourceId: extractionId,
      req: null,
      metadata: {
        fileName: result.fileName,
        fileSize: result.fileSize,
        resourceType: "NCP_EXTRACTION",
      },
    });

    return {
      success: true,
      extraction: {
        id: updated.id,
        status: updated.status,
        populatedDocxUrl: updated.populatedDocxUrl,
        populatedAt: updated.populatedAt,
      },
    };
  } catch (error) {
    console.error("[NCP] Error generating DOCX:", error);
    throw error;
  }
}

/**
 * Approve NCP extraction - marks the AI-generated NCP as reviewed and approved by a user.
 * Approval is required before the final DOCX can be downloaded/printed.
 * @param {string} extractionId - Extraction ID
 * @param {Object} user - Current user (approver)
 * @returns {Promise<Object>} Updated extraction
 */
async function approveNcpExtraction(extractionId, user) {
  try {
    const extraction = await getNcpExtractionById(extractionId, user);
    assertNcpExtractionNotArchived(extraction);

    if (extraction.status === "PENDING" || extraction.status === "EXTRACTING") {
      throw new Error("NCP extraction is still in progress and cannot be approved yet");
    }

    if (extraction.status !== "POPULATED") {
      throw new Error("NCP must have a generated DOCX before it can be approved. Please generate the DOCX first.");
    }

    const updated = await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        approvedAt: new Date(),
        approvedBy: user.id,
        approvedByName: user.name || user.email || "Unknown",
      },
    });

    await logUserAction({
      userId: user.id,
      tenantId: user.tenantId,
      action: "PHI_UPDATE_NCP",
      resourceId: extractionId,
      req: null,
      metadata: {
        action: "NCP_APPROVED",
        approvedByName: user.name || user.email,
        ncpVersion: updated.ncpVersion,
        resourceType: "NCP_EXTRACTION",
      },
    });

    return updated;
  } catch (error) {
    console.error("[NCP] Error approving extraction:", error);
    throw error;
  }
}

/**
 * Download populated DOCX
 * @param {string} extractionId - Extraction ID
 * @param {Object} user - Current user
 * @returns {Promise<Object>} DOCX download info
 */
async function getNcpDocxDownload(extractionId, user) {
  try {
    const extraction = await getNcpExtractionById(extractionId, user);
    assertNcpExtractionNotArchived(extraction);

    if (!extraction.populatedDocxS3Key) {
      throw new Error("DOCX has not been generated yet");
    }

    // Log PHI access
    await logUserAction({
      userId: user.id,
      tenantId: user.tenantId,
      action: "PHI_DOWNLOAD_NCP_DOCX",
      resourceId: extractionId,
      req: null,
      metadata: {
        s3Key: extraction.populatedDocxS3Key,
        resourceType: "NCP_EXTRACTION",
      },
    });

    return {
      success: true,
      s3Key: extraction.populatedDocxS3Key,
      s3Url: extraction.populatedDocxUrl,
      fileName: extraction.sourcePdfFileName.replace(/\.pdf$/i, ".docx"),
    };
  } catch (error) {
    console.error("[NCP] Error getting DOCX download:", error);
    throw error;
  }
}

/**
 * Archive NCP extraction (soft delete — record and S3 files preserved)
 * @param {string} extractionId - Extraction ID
 * @param {string} tenantId - Tenant ID (for authorization)
 * @param {string} userId - User performing the archive
 * @returns {Promise<Object>} Archived extraction record
 */
async function archiveNcpExtraction(extractionId, tenantId, userId) {
  try {
    console.log(`[NCP] Archiving extraction ${extractionId}...`);

    const extraction = await prisma.ncpExtraction.findFirst({
      where: {
        id: extractionId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!extraction) {
      throw new Error("Extraction not found or access denied");
    }

    const archivedExtraction = await prisma.ncpExtraction.update({
      where: { id: extractionId },
      data: {
        deletedAt: new Date(),
        archivedBy: userId || null,
      },
    });

    console.log(`[NCP] ✅ Successfully archived extraction ${extractionId}`);

    return archivedExtraction;
  } catch (error) {
    console.error("[NCP] Error archiving extraction:", error);
    throw error;
  }
}

/**
 * Get NCP schema with sections and field metadata
 * Enriches the flat schema with section assignments and field types
 * @returns {Object} Schema with sections and fields
 */
function getNcpSchema() {
  const schema = loadNcpSchema();
  const properties = schema.properties || {};

  // Section definitions: exactly the 11 NCP sections for review/edit (no Other)
  const SECTIONS = [
    { id: "summary", label: "Summary", description: "Basic resident and provider details from the assessment." },
    { id: "responsible_parties", label: "Responsible Parties" },
    { id: "communication", label: "Communication Speech, Hearing & Vision" },
    { id: "health", label: "Health Indicators" },
    { id: "medications", label: "Medication Management" },
    { id: "treatments", label: "Treatment Programs & Therapies" },
    { id: "psychological", label: "Psychosocial & Cognitive" },
    { id: "left_alone", label: "Left Alone Status" },
    { id: "universal_precautions", label: "Universal Precautions" },
    { id: "adl", label: "Activities Of Daily Living" },
    { id: "iadl", label: "Instrumental Activities Of Daily Living" },
  ];

  // Determine section for a field key (only the 11 sections above; rest go to "other")
  function getSectionIdForKey(key) {
    if (key.startsWith("provider_") || key.startsWith("date_") || key === "moved_in_date" ||
        key.startsWith("resident_") || key.startsWith("primary_language") ||
        key.startsWith("speaks_english") || key.startsWith("interpreter_") || key === "age") return "summary";
    if (key.startsWith("legal_docs_")) return "summary";
    if (key.startsWith("specialty_needs_")) return "summary";
    if (key.startsWith("evacuation_") || key.startsWith("caregiver_evacuation_")) return "summary";
    if (key.startsWith("contact_")) return "responsible_parties";
    if (key.startsWith("comm_")) return "communication";
    if (key.startsWith("med_") || key.startsWith("rn_delegator_")) return "medications";
    if (key.startsWith("health_") || key.startsWith("allergy_") || key === "all_allergies" || key === "current_medical_diagnoses") return "health";
    if (key.startsWith("treatment_")) return "treatments";
    if (key.startsWith("psych_") || key.startsWith("cognitive_")) return "psychological";
    if (key === "left_alone_strengths" || key === "left_alone_assistance") return "left_alone";
    if (key.startsWith("universal_precautions_")) return "universal_precautions";
    if (key.startsWith("mobility_") || key.startsWith("bed_mobility_") || key.startsWith("skin_")) return "other";
    if (key.startsWith("adl_") || key.startsWith("eating_") || key.startsWith("toileting_") || key.startsWith("dressing_") || key.startsWith("hygiene_") || key.startsWith("bathing_") || key.startsWith("foot_care_")) return "adl";
    if (key.startsWith("iadl_")) return "iadl";
    if (key.startsWith("activities_") || key.startsWith("activity_")) return "other";
    if (key.startsWith("safety_")) return "other";
    if (key.startsWith("case_management_") || key === "case_management" || key.startsWith("sig_")) return "other";
    return "other";
  }

  // Determine field type from schema
  function getFieldType(fieldDef, key) {
    if (fieldDef.enum && JSON.stringify(fieldDef.enum) === JSON.stringify(["X", ""])) return "checkbox";
    if (key.endsWith("_date") || key.startsWith("date_") || key === "moved_in_date" || key === "date_of_birth" ||
        (fieldDef.description && fieldDef.description.includes("MM/DD/YYYY"))) return "date";
    if (key.endsWith("_desc") || key.endsWith("_description") || key.endsWith("_instructions") ||
        key.endsWith("_actions") || key.endsWith("_narrative") || key.endsWith("_strengths") ||
        key.endsWith("_abilities") || key.endsWith("_comments")) return "textarea";
    return "text";
  }

  // Build fields grouped by section
  const sectionFields = {};
  SECTIONS.forEach(s => { sectionFields[s.id] = []; });

  Object.entries(properties).forEach(([key, fieldDef]) => {
    const sectionId = getSectionIdForKey(key);
    const fieldType = getFieldType(fieldDef, key);
    sectionFields[sectionId].push({
      key,
      type: fieldType,
      description: fieldDef.description || "",
      enum: fieldDef.enum || null,
    });
  });

  // Sort fields alphabetically within each section
  Object.values(sectionFields).forEach(fields => {
    fields.sort((a, b) => a.key.localeCompare(b.key));
  });

  // Build sections with field counts
  const sections = SECTIONS.map(section => ({
    ...section,
    fields: sectionFields[section.id] || [],
    fieldCount: (sectionFields[section.id] || []).length,
  })).filter(s => s.fieldCount > 0);

  return {
    totalFields: Object.keys(properties).length,
    sections,
  };
}

/**
 * Generate an AI-powered assessment summary for an NCP extraction
 * Uses GPT-4.1 to create a professional clinical narrative from extracted data
 * @param {string} extractionId - Extraction ID
 * @param {string} tenantId - Tenant ID (for authorization)
 * @returns {Promise<string>} HTML-formatted assessment summary
 */
async function generateAssessmentSummary(extractionId, tenantId) {
  try {
    console.log(`[NCP] Generating assessment summary for ${extractionId}...`);

    // Fetch the extraction record with extracted data
    const extraction = await prisma.ncpExtraction.findFirst({
      where: {
        id: extractionId,
        tenantId,
      },
      select: {
        id: true,
        extractedData: true,
        status: true,
      },
    });

    if (!extraction) {
      throw new Error("Extraction not found or access denied");
    }

    if (extraction.status === "PENDING" || extraction.status === "EXTRACTING") {
      throw new Error("Extraction is still in progress");
    }

    if (
      !extraction.extractedData ||
      Object.keys(extraction.extractedData).length === 0
    ) {
      throw new Error("No extracted data available to summarize");
    }

    // Initialize OpenAI client
    const OpenAI = require("openai");
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Build the prompt with all extracted data
    const dataEntries = Object.entries(extraction.extractedData)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    const systemPrompt = `You are a professional clinical documentation specialist. You will receive extracted data fields from a Negotiated Care Plan (NCP) assessment for an Adult Family Home resident. Your task is to generate a comprehensive, well-organized narrative summary of the assessment data.

Format your response as clean HTML with the following guidelines:
- Use <h3> tags for section headings
- Use <p> tags for paragraphs
- Use <strong> tags for emphasis on key terms
- Use <ul> and <li> for lists where appropriate
- Do NOT include <html>, <head>, <body>, or any wrapper tags — just the content HTML
- Write in a professional, clinical tone appropriate for care documentation
- Organize the data into logical sections based on the content

Create the following sections (include only sections that have relevant data):
1. <h3>Client Demographics and Assessment Overview</h3> - Resident name, age, date of birth, move-in date, provider info, language preferences
2. <h3>Collateral Contacts</h3> - Emergency contacts, responsible parties, their relationships and contact info
3. <h3>Safety Concerns</h3> - Safety assessments, fall risks, wandering risks, emergency evacuation needs
4. <h3>Communication, Vision, and Sensory Status</h3> - Speech, hearing, vision capabilities and needs
5. <h3>Medical Diagnoses and Health Indicators</h3> - Current diagnoses, allergies, health conditions
6. <h3>Medication Management</h3> - Medication administration, RN delegation, self-administration status
7. <h3>Psychosocial and Cognitive Status</h3> - Mental health, cognitive abilities, behavioral patterns
8. <h3>Mobility and Transfers</h3> - Mobility level, transfer needs, bed mobility, skin integrity
9. <h3>Activities of Daily Living</h3> - Eating, toileting, dressing, hygiene, bathing, foot care
10. <h3>Instrumental Activities of Daily Living</h3> - Meal prep, laundry, housekeeping, shopping, transportation
11. <h3>Activities and Social Engagement</h3> - Social activities, preferences, community involvement
12. <h3>Treatment Programs and Therapies</h3> - Current therapies, treatment plans
13. <h3>Legal Documents and Advance Directives</h3> - Legal documentation status

For each section, write a flowing narrative paragraph (not just a list of fields). Integrate the data naturally into sentences. If a section has no relevant data, omit it entirely.`;

    const userPrompt = `Here is the extracted NCP assessment data. Please generate a comprehensive clinical narrative summary:\n\n${dataEntries}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-2025-04-14",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const summary = completion.choices[0]?.message?.content || "";

    console.log(`[NCP] Assessment summary generated for ${extractionId}`);

    return summary;
  } catch (error) {
    console.error("[NCP] Error generating assessment summary:", error);
    throw error;
  }
}

module.exports = {
  uploadAndExtractNcp,
  uploadAndExtractNcpBulk,
  processNcpExtraction,
  getNcpExtractionById,
  getNcpExtractionProgress,
  listNcpExtractions,
  updateNcpExtraction,
  generateNcpDocx,
  getNcpDocxDownload,
  approveNcpExtraction,
  archiveNcpExtraction,
  getNcpSchema,
  generateAssessmentSummary,
};
