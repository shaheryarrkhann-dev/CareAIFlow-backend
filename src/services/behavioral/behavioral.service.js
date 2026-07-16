const prisma = require("../../lib/prisma");
const {
  validateResidentId,
  getResidentById,
} = require("../resident/resident.service");
const { logBehavioralAction } = require("../compliance/audit.service");

/**
 * Get resident name from residentId
 * Fetches from Resident model (static schema)
 * @param {string} residentId - Resident UUID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string|null>} Resident name or null if not found
 */
async function getResidentName(residentId, tenantId) {
  try {
    const user = { tenantId, role: "ADMIN" };
    const resident = await getResidentById(residentId, user);
    return resident.name || null;
  } catch (error) {
    console.warn(
      `[BEHAVIORAL] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Check if behavioral log can be edited (24-hour rule)
 * @param {Object} log - Behavioral log record
 * @param {Object} requestingUser - Current user
 * @returns {Object} { canEdit: boolean, reason?: string }
 */
function checkEditPermission(log, requestingUser) {
  const now = new Date();
  const logDateTime = new Date(log.dateTime);
  const hoursSinceLog = (now - logDateTime) / (1000 * 60 * 60);

  // Check if locked
  if (log.isLocked && !log.canEdit) {
    return {
      canEdit: false,
      reason: "Behavioral log is locked and cannot be edited",
    };
  }

  // ADMIN and SUPER_ADMIN can always edit (if canEdit flag is true)
  if (
    (requestingUser.role === "ADMIN" ||
      requestingUser.role === "SUPER_ADMIN") &&
    log.canEdit
  ) {
    return { canEdit: true };
  }

  // STAFF can only edit within 24 hours
  if (requestingUser.role === "STAFF" || requestingUser.role === "GUARDIAN") {
    if (hoursSinceLog > 24 && !log.canEdit) {
      return {
        canEdit: false,
        reason:
          "Behavioral log cannot be edited after 24 hours. Please contact an administrator.",
      };
    }
    // STAFF can edit their own logs within 24 hours
    if (log.createdBy === requestingUser.id) {
      return { canEdit: true };
    }
    // STAFF can edit any log within their tenant within 24 hours
    return { canEdit: true };
  }

  return { canEdit: true };
}

/**
 * Create new behavioral log entry
 * @param {Object} data - Behavioral log data
 * @param {Object} requestingUser - User creating the log
 * @returns {Promise<Object>} Created behavioral log
 */
async function createBehavioralLog(data, requestingUser) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when creating behavioral log as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to create behavioral logs");
    }
  }

  // Validate residentId
  const isValidResident = await validateResidentId(
    data.residentId.trim(),
    tenantId
  );
  if (!isValidResident) {
    throw new Error(
      "Resident not found or does not belong to your organization"
    );
  }

  // Validate PRN record if provided
  if (data.prnRecordId) {
    const prnRecord = await prisma.prnRecord.findFirst({
      where: {
        id: data.prnRecordId,
        tenantId,
        residentId: data.residentId,
      },
    });

    if (!prnRecord) {
      throw new Error(
        "PRN record not found or does not belong to this resident"
      );
    }
  }

  // Get resident name
  const residentName = await getResidentName(data.residentId, tenantId);

  // Get staff name
  const staff = await prisma.user.findUnique({
    where: { id: requestingUser.id },
    select: { name: true },
  });

  // Validate and prepare interventions array (required field)
  if (
    !data.interventions ||
    !Array.isArray(data.interventions) ||
    data.interventions.length === 0
  ) {
    throw new Error("interventions is required and must be a non-empty array");
  }

  const validInterventions = [
    "Redirect",
    "Counseling",
    "PrnMedication",
    "TimeOut",
    "DeEscalation",
    "EnvironmentalModification",
    "StaffSupport",
    "FamilyNotification",
    "PhysicianNotification",
    "EmergencyResponse",
    "Other",
  ];
  const interventions = data.interventions.filter((i) =>
    validInterventions.includes(i)
  );

  if (interventions.length === 0) {
    throw new Error(
      "interventions must contain at least one valid intervention type"
    );
  }

  // Handle observedBehaviors - array of behavior names
  let observedBehaviors = null;
  if (data.observedBehaviors) {
    if (Array.isArray(data.observedBehaviors)) {
      // Filter out empty strings and ensure all are strings
      observedBehaviors = data.observedBehaviors
        .filter((b) => b && typeof b === "string" && b.trim().length > 0)
        .map((b) => b.trim());
      // If array becomes empty, set to null
      if (observedBehaviors.length === 0) {
        observedBehaviors = null;
      }
    }
  }

  // Create behavioral log
  const behavioralLog = await prisma.behavioralLog.create({
    data: {
      residentId: data.residentId.trim(),
      residentName: residentName,
      tenantId,
      dateTime: new Date(data.dateTime),
      duration: data.duration?.trim() || null,
      behaviorType: data.behaviorType || null,
      observedBehaviors: observedBehaviors, // Array of behavior names
      severity: data.severity,
      trigger: data.trigger?.trim() || null,
      staffNotes: data.staffNotes?.trim() || null,
      residentExplanation: data.residentExplanation?.trim() || null,
      outcome: data.outcome?.trim() || null,
      interventions: interventions,
      interventionDetails: data.interventionDetails?.trim() || null,
      selectedTier: data.selectedTier?.trim() || null,
      staffId: requestingUser.id,
      staffName: staff?.name || null,
      prnRecordId: data.prnRecordId || null,
      createdBy: requestingUser.id,
    },
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      prnRecord: {
        select: {
          id: true,
          medication: {
            select: {
              id: true,
              name: true,
              dosage: true,
            },
          },
          givenAt: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log audit event
  logBehavioralAction({
    action: "BEHAVIORAL_LOG_CREATED",
    userId: requestingUser.id,
    tenantId: behavioralLog.tenantId,
    resourceId: behavioralLog.id,
    req: null,
    metadata: {
      residentId: behavioralLog.residentId,
      behaviorType: behavioralLog.behaviorType,
      severity: behavioralLog.severity,
    },
  });

  return behavioralLog;
}

/**
 * Get behavioral logs with filtering
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Behavioral logs with pagination
 */
async function getBehavioralLogs(user, filters = {}) {
  // Determine tenantId
  let tenantId = null;
  if (user.role === "SUPER_ADMIN") {
    tenantId = filters.tenantId || null; // null means all tenants
  } else {
    tenantId = user.tenantId;
    if (!tenantId) {
      return {
        logs: [],
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 50,
          total: 0,
          totalPages: 0,
        },
      };
    }
  }

  // Build tenant filter
  const tenantWhere = tenantId ? { tenantId } : {};

  // Pagination
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 50));
  const skip = (page - 1) * limit;

  // Extract filters
  const { residentId, behaviorType, severity, dateFrom, dateTo, staffId } =
    filters;

  // Build date filter
  const dateFilter = {};
  if (dateFrom) {
    dateFilter.gte = new Date(dateFrom);
  }
  if (dateTo) {
    // Add one day to include the entire end date
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);
    dateFilter.lte = endDate;
  }

  // Build where clause
  const where = {
    ...tenantWhere,
    deletedAt: null, // Only non-deleted logs
    ...(residentId && { residentId }),
    ...(behaviorType && { behaviorType }),
    ...(severity && { severity }),
    ...(staffId && { staffId }),
    ...(Object.keys(dateFilter).length > 0 && { dateTime: dateFilter }),
  };

  // Execute query with pagination
  const [logs, total] = await Promise.all([
    prisma.behavioralLog.findMany({
      where,
      skip,
      take: limit,
      include: {
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        prnRecord: {
          select: {
            id: true,
            medication: {
              select: {
                id: true,
                name: true,
                dosage: true,
              },
            },
            givenAt: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
    prisma.behavioralLog.count({ where }),
  ]);

  // Populate residentName dynamically (don't save to DB)
  const logsWithNames = await Promise.all(
    logs.map(async (log) => {
      const residentName = await getResidentName(log.residentId, log.tenantId);
      log.residentName = residentName || log.residentName;
      return log;
    })
  );

  return {
    logs: logsWithNames,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get behavioral log by ID
 * @param {string} logId - Behavioral log ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Behavioral log with all relations
 */
async function getBehavioralLogById(logId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: logId,
    ...tenantWhere,
    deletedAt: null, // Only non-deleted logs
  };

  const log = await prisma.behavioralLog.findFirst({
    where,
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      prnRecord: {
        select: {
          id: true,
          medication: {
            select: {
              id: true,
              name: true,
              dosage: true,
            },
          },
          givenAt: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!log) {
    throw new Error("Behavioral log not found or access denied");
  }

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(log.residentId, log.tenantId);
  log.residentName = residentName || log.residentName;

  return log;
}

/**
 * Update behavioral log
 * @param {string} logId - Behavioral log ID
 * @param {Object} data - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated behavioral log
 */
async function updateBehavioralLog(logId, data, requestingUser) {
  // Get existing log
  const existingLog = await getBehavioralLogById(logId, requestingUser);

  // Check edit permissions (24-hour rule)
  const editCheck = checkEditPermission(existingLog, requestingUser);
  if (!editCheck.canEdit) {
    throw new Error(editCheck.reason || "Cannot edit this behavioral log");
  }

  // Validate PRN record if provided
  if (data.prnRecordId !== undefined) {
    if (data.prnRecordId) {
      const prnRecord = await prisma.prnRecord.findFirst({
        where: {
          id: data.prnRecordId,
          tenantId: existingLog.tenantId,
          residentId: existingLog.residentId,
        },
      });

      if (!prnRecord) {
        throw new Error(
          "PRN record not found or does not belong to this resident"
        );
      }
    }
  }

  // Validate and prepare interventions array (required field)
  let interventions = undefined;
  if (data.interventions !== undefined) {
    if (!Array.isArray(data.interventions) || data.interventions.length === 0) {
      throw new Error(
        "interventions is required and must be a non-empty array"
      );
    }
    const validInterventions = [
      "Redirect",
      "Counseling",
      "PrnMedication",
      "TimeOut",
      "DeEscalation",
      "EnvironmentalModification",
      "StaffSupport",
      "FamilyNotification",
      "PhysicianNotification",
      "EmergencyResponse",
      "Other",
    ];
    interventions = data.interventions.filter((i) =>
      validInterventions.includes(i)
    );
    if (interventions.length === 0) {
      throw new Error(
        "interventions must contain at least one valid intervention type"
      );
    }
  }

  // Check if this is a batch record
  const isBatchRecord = existingLog.services && Array.isArray(existingLog.services) && existingLog.services.length > 0;
  
  // Handle services updates for batch records AND converting non-batch to batch
  let updatedServices = undefined;
  let allInterventions = new Set();
  let allObservedBehaviors = new Set();
  
  // Handle adding services (works for both batch and non-batch records)
  if (data.servicesToAdd && Array.isArray(data.servicesToAdd) && data.servicesToAdd.length > 0) {
    const staff = await prisma.user.findUnique({
      where: { id: requestingUser.id },
      select: { name: true },
    });
    
    if (isBatchRecord) {
      // Start with existing services
      updatedServices = [...(existingLog.services || [])];
      
      // Get the next available index
      const maxIndex = updatedServices.length > 0 
        ? Math.max(...updatedServices.map(s => s.index || 0))
        : 0;
      
      // Process and add new services
      for (let i = 0; i < data.servicesToAdd.length; i++) {
        const newService = data.servicesToAdd[i];
        // Assign index if not provided
        if (newService.index === undefined) {
          newService.index = maxIndex + i + 1;
        }
        const processedService = await processServiceForBatch(
          newService, 
          existingLog.residentId, 
          existingLog.tenantId, 
          existingLog.dateTime, 
          staff
        );
        updatedServices.push(processedService);
      }
    } else {
      // Convert non-batch record to batch record
      // First, convert existing log data into a service
      const existingService = {
        index: 1,
        timeOrDuration: existingLog.duration || null,
        behaviorType: existingLog.behaviorType,
        observedBehaviors: existingLog.observedBehaviors || null,
        severity: existingLog.severity || null,
        residentExplanation: existingLog.residentExplanation || null,
        outcome: existingLog.outcome || null,
        interventions: existingLog.interventions || ["Other"],
        interventionDetails: existingLog.interventionDetails || null,
        staffName: existingLog.staffName || null,
        signature: null, // Extract from staffNotes if needed
        summary: existingLog.staffNotes || null,
        dateTime: existingLog.dateTime.toISOString(),
      };
      
      // Extract signature from staffNotes if present
      if (existingLog.staffNotes) {
        const signatureMatch = existingLog.staffNotes.match(/Signature:\s*(.+?)(?:\s*\||$)/);
        if (signatureMatch) {
          existingService.signature = signatureMatch[1].trim();
        }
      }
      
      // Start with the existing service as first service
      updatedServices = [existingService];
      
      // Process and add new services
      for (let i = 0; i < data.servicesToAdd.length; i++) {
        const newService = data.servicesToAdd[i];
        // Assign index if not provided (starting from 2)
        if (newService.index === undefined) {
          newService.index = i + 2;
        }
        const processedService = await processServiceForBatch(
          newService, 
          existingLog.residentId, 
          existingLog.tenantId, 
          existingLog.dateTime, 
          staff
        );
        updatedServices.push(processedService);
      }
    }
  }
  
  // Handle services array (for both batch and non-batch records)
  if (data.services !== undefined) {
    if (Array.isArray(data.services) && data.services.length > 0) {
      // If services array is provided, it can be:
      // 1. Full replacement (all services) - convert non-batch to batch if needed
      // 2. Partial update (services with index to update specific ones) - only for batch records
      
      const staff = await prisma.user.findUnique({
        where: { id: requestingUser.id },
        select: { name: true },
      });
      
      // Check if services have index field (partial update)
      const hasIndexField = data.services.some(s => s.index !== undefined);
      
      // If it's a batch record AND has index fields, do partial update
      // Otherwise, do full replacement (handles both batch replacement and non-batch to batch conversion)
      if (hasIndexField && isBatchRecord) {
        // Partial update: update services by index (only for existing batch records)
        if (!updatedServices) {
          updatedServices = [...(existingLog.services || [])];
        }
        
        for (const serviceUpdate of data.services) {
          if (serviceUpdate.index !== undefined) {
            const serviceIndex = updatedServices.findIndex(s => s.index === serviceUpdate.index);
            if (serviceIndex !== -1) {
              // Update existing service - merge with existing data
              const existingService = updatedServices[serviceIndex];
              updatedServices[serviceIndex] = {
                ...existingService,
                ...serviceUpdate,
                // Ensure index is preserved
                index: existingService.index,
                // Preserve dateTime if not provided
                dateTime: serviceUpdate.dateTime || existingService.dateTime,
              };
            } else {
              // Service with this index doesn't exist - treat as new service
              const processedService = await processServiceForBatch(
                serviceUpdate,
                existingLog.residentId,
                existingLog.tenantId,
                existingLog.dateTime,
                staff
              );
              updatedServices.push(processedService);
            }
          }
        }
      } else {
        // Full replacement - validate and process all services
        // This handles:
        // 1. Batch record full replacement
        // 2. Converting non-batch to batch (when services array is provided)
        try {
          const processedServices = [];
          for (let i = 0; i < data.services.length; i++) {
            const service = data.services[i];
            // Preserve index if provided, otherwise assign sequential
            if (service.index === undefined) {
              service.index = i + 1;
            }
            const processedService = await processServiceForBatch(
              service,
              existingLog.residentId,
              existingLog.tenantId,
              existingLog.dateTime,
              staff
            );
            processedServices.push(processedService);
          }
          updatedServices = processedServices;
          console.log('[BEHAVIORAL UPDATE] Processed services:', updatedServices.length, 'services');
        } catch (error) {
          console.error('[BEHAVIORAL UPDATE] Error processing services:', error);
          throw new Error(`Failed to process services: ${error.message}`);
        }
      }
    } else if (data.services === null) {
      // Clear services (convert to non-batch record)
      updatedServices = null;
    } else if (Array.isArray(data.services) && data.services.length === 0) {
      // Empty array - clear services
      updatedServices = null;
    }
  } else if (isBatchRecord && !updatedServices) {
    // If no services update but it's a batch record, keep existing services
    updatedServices = [...(existingLog.services || [])];
  }
  
  // Recalculate aggregated fields from all services
  if (updatedServices && updatedServices.length > 0) {
    // Sort services by index to maintain order
    updatedServices.sort((a, b) => (a.index || 0) - (b.index || 0));
    
    updatedServices.forEach(service => {
      // Aggregate interventions
      if (service.interventions && Array.isArray(service.interventions)) {
        service.interventions.forEach(intervention => allInterventions.add(intervention));
      }
      // Aggregate observed behaviors
      if (service.observedBehaviors && Array.isArray(service.observedBehaviors)) {
        service.observedBehaviors.forEach(behavior => allObservedBehaviors.add(behavior));
      }
    });
  }
  
  // Debug: Log what will be saved
  if (data.services !== undefined) {
    console.log('[BEHAVIORAL UPDATE] Final updatedServices:', updatedServices ? `${updatedServices.length} services` : 'null/undefined');
  }

  // Handle observedBehaviors - array of behavior names
  let observedBehaviors = undefined;
  if (data.observedBehaviors !== undefined) {
    if (data.observedBehaviors === null) {
      observedBehaviors = null;
    } else if (Array.isArray(data.observedBehaviors)) {
      // Filter out empty strings and ensure all are strings
      const filtered = data.observedBehaviors
        .filter((b) => b && typeof b === "string" && b.trim().length > 0)
        .map((b) => b.trim());
      // If array becomes empty, set to null
      observedBehaviors = filtered.length === 0 ? null : filtered;
    }
  } else if ((isBatchRecord || updatedServices) && updatedServices && allObservedBehaviors.size > 0) {
    // Use aggregated observed behaviors from services
    observedBehaviors = Array.from(allObservedBehaviors);
  }

  // Handle interventions - use aggregated if batch record or when converting to batch
  if ((isBatchRecord || updatedServices) && updatedServices && allInterventions.size > 0 && interventions === undefined) {
    interventions = Array.from(allInterventions);
  }

  // Update main log fields from first service if not explicitly provided (for batch records or when converting to batch)
  let mainDateTime = data.dateTime ? new Date(data.dateTime) : undefined;
  let mainBehaviorType = data.behaviorType !== undefined ? data.behaviorType : undefined;
  let mainSeverity = data.severity;
  
  if ((isBatchRecord || updatedServices) && updatedServices && updatedServices.length > 0) {
    if (!mainDateTime && updatedServices[0]?.dateTime) {
      mainDateTime = new Date(updatedServices[0].dateTime);
    }
    if (mainBehaviorType === undefined && updatedServices[0]?.behaviorType !== undefined) {
      mainBehaviorType = updatedServices[0].behaviorType;
    }
    if (!mainSeverity && updatedServices[0]?.severity) {
      mainSeverity = updatedServices[0].severity;
    }
  }

  // Build update data
  const updateData = {
    ...(mainDateTime && { dateTime: mainDateTime }),
    ...(data.duration !== undefined && {
      duration: data.duration?.trim() || null,
    }),
    ...(mainBehaviorType !== undefined && { behaviorType: mainBehaviorType }),
    ...(observedBehaviors !== undefined && { observedBehaviors }),
    ...(mainSeverity && { severity: mainSeverity }),
    ...(data.trigger !== undefined && {
      trigger: data.trigger?.trim() || null,
    }),
    ...(data.staffNotes !== undefined && {
      staffNotes: data.staffNotes?.trim() || null,
    }),
    ...(data.residentExplanation !== undefined && {
      residentExplanation: data.residentExplanation?.trim() || null,
    }),
    ...(data.outcome !== undefined && {
      outcome: data.outcome?.trim() || null,
    }),
    ...(interventions !== undefined && { interventions }),
    ...(data.interventionDetails !== undefined && {
      interventionDetails: data.interventionDetails?.trim() || null,
    }),
    ...(data.selectedTier !== undefined && {
      selectedTier: data.selectedTier?.trim() || null,
    }),
    ...(data.prnRecordId !== undefined && {
      prnRecordId: data.prnRecordId || null,
    }),
    ...(updatedServices !== undefined ? { services: updatedServices } : {}),
    editedAt: new Date(),
    editedBy: requestingUser.id,
  };
  
  // Ensure services are included if they were processed
  if (data.services !== undefined && updatedServices !== undefined) {
    updateData.services = updatedServices;
    console.log('[BEHAVIORAL UPDATE] Including services in updateData:', updateData.services ? `${updateData.services.length} services` : 'null');
  }

  // Update log
  const log = await prisma.behavioralLog.update({
    where: { id: logId },
    data: updateData,
    include: {
      staff: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      prnRecord: {
        select: {
          id: true,
          medication: {
            select: {
              id: true,
              name: true,
              dosage: true,
            },
          },
          givenAt: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log audit event
  logBehavioralAction({
    action: "BEHAVIORAL_LOG_UPDATED",
    userId: requestingUser.id,
    tenantId: log.tenantId,
    resourceId: log.id,
    req: null,
    metadata: {
      residentId: log.residentId,
      behaviorType: log.behaviorType,
      severity: log.severity,
      editedBy: requestingUser.id,
    },
  });

  // Populate residentName dynamically
  const residentName = await getResidentName(log.residentId, log.tenantId);
  log.residentName = residentName || log.residentName;

  return log;
}

/**
 * Delete behavioral log (soft delete)
 * @param {string} logId - Behavioral log ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Deleted behavioral log
 */
async function deleteBehavioralLog(logId, requestingUser) {
  // Get existing log
  const existingLog = await getBehavioralLogById(logId, requestingUser);

  // Check permissions - only ADMIN/SUPER_ADMIN can delete
  if (
    requestingUser.role !== "ADMIN" &&
    requestingUser.role !== "SUPER_ADMIN"
  ) {
    throw new Error("Only an administrator can delete this.");
  }

  // Soft delete (set deletedAt)
  const log = await prisma.behavioralLog.update({
    where: { id: logId },
    data: {
      deletedAt: new Date(),
      editedAt: new Date(),
      editedBy: requestingUser.id,
    },
    include: {
      staff: {
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
    },
  });

  // Log audit event
  logBehavioralAction({
    action: "BEHAVIORAL_LOG_DELETED",
    userId: requestingUser.id,
    tenantId: log.tenantId,
    resourceId: log.id,
    req: null,
    metadata: {
      residentId: log.residentId,
      behaviorType: log.behaviorType,
      severity: log.severity,
      deletedBy: requestingUser.id,
    },
  });

  // Populate residentName dynamically
  const residentName = await getResidentName(log.residentId, log.tenantId);
  log.residentName = residentName || log.residentName;

  return log;
}

/**
 * Get behavioral dashboard summary
 * @param {string} residentId - Resident ID (optional)
 * @param {number} month - Month (1-12)
 * @param {number} year - Year
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Dashboard summary data
 */
async function getBehavioralDashboard(
  residentId = null,
  month = null,
  year = null,
  tenantId = null
) {
  // Default to current month/year if not provided
  const now = new Date();
  const targetMonth = month || now.getMonth() + 1;
  const targetYear = year || now.getFullYear();

  // Build date range for the month
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  // Build where clause
  const where = {
    deletedAt: null,
    ...(tenantId && { tenantId }),
    ...(residentId && { residentId }),
    dateTime: {
      gte: startDate,
      lte: endDate,
    },
  };

  // Get all logs for the period
  const logs = await prisma.behavioralLog.findMany({
    where,
    select: {
      id: true,
      behaviorType: true,
      severity: true,
      dateTime: true,
      residentId: true,
    },
  });

  // Calculate statistics
  const totalIncidents = logs.length;
  const severityCounts = {
    Low: logs.filter((l) => l.severity === "Low").length,
    Moderate: logs.filter((l) => l.severity === "Moderate").length,
    High: logs.filter((l) => l.severity === "High").length,
  };

  // Count behavior types
  const behaviorTypeCounts = {};
  logs.forEach((log) => {
    behaviorTypeCounts[log.behaviorType] =
      (behaviorTypeCounts[log.behaviorType] || 0) + 1;
  });

  // Find most frequent behavior
  const mostFrequentBehavior = Object.keys(behaviorTypeCounts).reduce(
    (a, b) => (behaviorTypeCounts[a] > behaviorTypeCounts[b] ? a : b),
    null
  );

  // Count by day for trend
  const dailyCounts = {};
  logs.forEach((log) => {
    const day = new Date(log.dateTime).toISOString().split("T")[0];
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });

  // Detect escalations (3+ high severity in a week)
  const weeklyHighSeverity = {};
  logs
    .filter((l) => l.severity === "High")
    .forEach((log) => {
      const logDate = new Date(log.dateTime);
      const weekStart = new Date(logDate);
      weekStart.setDate(logDate.getDate() - logDate.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split("T")[0];
      weeklyHighSeverity[weekKey] = (weeklyHighSeverity[weekKey] || 0) + 1;
    });

  const escalationWeeks = Object.entries(weeklyHighSeverity)
    .filter(([_, count]) => count >= 3)
    .map(([week, count]) => ({ week, count }));

  return {
    period: {
      month: targetMonth,
      year: targetYear,
      startDate,
      endDate,
    },
    summary: {
      totalIncidents,
      severityCounts,
      mostFrequentBehavior: mostFrequentBehavior
        ? {
            type: mostFrequentBehavior,
            count: behaviorTypeCounts[mostFrequentBehavior],
          }
        : null,
    },
    trends: {
      dailyCounts,
      behaviorTypeCounts,
    },
    alerts: {
      escalationWeeks: escalationWeeks.length > 0 ? escalationWeeks : null,
      hasEscalation: escalationWeeks.length > 0,
    },
  };
}

/**
 * Parse time from timeOrDuration string
 * @param {string} timeOrDuration - Time string like "14:30" or duration like "2 hours"
 * @returns {Object} { hours: number, minutes: number } or null if no time found
 */
function parseTimeFromString(timeOrDuration) {
  if (!timeOrDuration) return null;

  // Try to match time format (HH:MM or H:MM)
  const timeMatch = timeOrDuration.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    return {
      hours: parseInt(timeMatch[1], 10),
      minutes: parseInt(timeMatch[2], 10),
    };
  }

  return null;
}

/**
 * Process a single service for batch record (helper function)
 * @param {Object} service - Service data
 * @param {string} residentId - Resident ID
 * @param {string} tenantId - Tenant ID
 * @param {Date} baseDate - Base date for the record
 * @param {Object} staff - Staff user object
 * @returns {Promise<Object>} Processed service object
 */
async function processServiceForBatch(service, residentId, tenantId, baseDate, staff) {
  let dateTime;

  // Use service.date if available, otherwise fall back to baseDate
  const serviceDate = service.date || baseDate;
  const serviceBaseDate = new Date(serviceDate);
  
  if (isNaN(serviceBaseDate.getTime())) {
    throw new Error(`Invalid date format for service`);
  }

  // Check if serviceDate is a full ISO datetime string
  const isFullDateTime =
    typeof serviceDate === "string" &&
    serviceDate.includes("T") &&
    serviceDate.includes(":");

  if (isFullDateTime) {
    dateTime = new Date(serviceDate);
  } else {
    // Parse time from timeOrDuration
    const timeInfo = parseTimeFromString(service.timeOrDuration);

    const year = serviceBaseDate.getFullYear();
    const month = serviceBaseDate.getMonth();
    const day = serviceBaseDate.getDate();

    if (timeInfo) {
      dateTime = new Date(
        year,
        month,
        day,
        timeInfo.hours,
        timeInfo.minutes,
        0,
        0
      );
    } else {
      dateTime = new Date(year, month, day, 0, 0, 0, 0);
    }
  }

  // Handle interventions
  let interventionDetails = null;
  let interventions = ["Other"];

  if (service.interventions) {
    if (Array.isArray(service.interventions)) {
      interventions = service.interventions;
    } else {
      interventionDetails = service.interventions.trim();
      interventions = ["Other"];
    }
  }

  // Validate interventions
  const validInterventions = [
    "Redirect",
    "Counseling",
    "PrnMedication",
    "TimeOut",
    "DeEscalation",
    "EnvironmentalModification",
    "StaffSupport",
    "FamilyNotification",
    "PhysicianNotification",
    "EmergencyResponse",
    "Other",
  ];
  const filteredInterventions = interventions.filter((i) =>
    validInterventions.includes(i)
  );

  if (filteredInterventions.length === 0) {
    throw new Error(
      "interventions must contain at least one valid intervention type"
    );
  }

  // Handle observedBehaviors
  let observedBehaviors = null;
  if (service.observedBehaviors) {
    if (Array.isArray(service.observedBehaviors)) {
      observedBehaviors = service.observedBehaviors
        .filter((b) => b && typeof b === "string" && b.trim().length > 0)
        .map((b) => b.trim());
      if (observedBehaviors.length === 0) {
        observedBehaviors = null;
      }
    }
  }

  // Get service index
  const serviceIndex = service.index !== undefined ? service.index : (Date.now() % 10000); // Fallback to timestamp if no index

  // Return normalized service data
  return {
    index: serviceIndex,
    timeOrDuration: service.timeOrDuration?.trim() || null,
    behaviorType: service.behaviorType || null,
    observedBehaviors: observedBehaviors,
    severity: service.severity || null,
    residentExplanation: service.residentExplanation?.trim() || null,
    outcome: service.outcome?.trim() || null,
    interventions: filteredInterventions,
    interventionDetails: interventionDetails,
    staffName: service.staffName?.trim() || null,
    signature: service.signature?.trim() || null,
    summary: service.summary?.trim() || null,
    dateTime: dateTime.toISOString(),
  };
}

/**
 * Create multiple behavioral logs in batch
 * @param {Object} data - Batch data with residentId, date, and services array
 * @param {Object} requestingUser - User creating the logs
 * @returns {Promise<Object>} Created logs with success/failure info
 */
async function createBehavioralLogsBatch(data, requestingUser) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when creating behavioral logs as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to create behavioral logs");
    }
  }

  // Validate residentId
  const isValidResident = await validateResidentId(
    data.residentId.trim(),
    tenantId
  );
  if (!isValidResident) {
    throw new Error(
      "Resident not found or does not belong to your organization"
    );
  }

  // Get resident name
  const residentName = await getResidentName(data.residentId, tenantId);

  // Get staff name
  const staff = await prisma.user.findUnique({
    where: { id: requestingUser.id },
    select: { name: true },
  });

  // Parse base date - ensure it's a proper Date object
  // This is used as a fallback if individual service dates are not provided
  const baseDate = new Date(data.date);
  if (isNaN(baseDate.getTime())) {
    throw new Error("Invalid date format provided");
  }

  // Process all services and normalize them
  const processedServices = [];
  let firstServiceDateTime = null;
  let firstServiceBehaviorType = null;
  let firstServiceSeverity = null;
  let allInterventions = new Set();
  let allObservedBehaviors = new Set();

  for (let i = 0; i < data.services.length; i++) {
    const service = data.services[i];
    
    try {
      let dateTime;

      // Use service.date if available, otherwise fall back to data.date
      const serviceDate = service.date || data.date;
      const serviceBaseDate = new Date(serviceDate);
      
      if (isNaN(serviceBaseDate.getTime())) {
        throw new Error(`Invalid date format for service ${i + 1}`);
      }

      // Check if serviceDate is a full ISO datetime string (has time component)
      const isFullDateTime =
        typeof serviceDate === "string" &&
        serviceDate.includes("T") &&
        serviceDate.includes(":");

      if (isFullDateTime) {
        dateTime = new Date(serviceDate);
      } else {
        // Parse time from timeOrDuration if serviceDate is just a date
        const timeInfo = parseTimeFromString(service.timeOrDuration);

        const year = serviceBaseDate.getFullYear();
        const month = serviceBaseDate.getMonth();
        const day = serviceBaseDate.getDate();

        if (timeInfo) {
          dateTime = new Date(
            year,
            month,
            day,
            timeInfo.hours,
            timeInfo.minutes,
            0,
            0
          );
        } else {
          dateTime = new Date(year, month, day, 0, 0, 0, 0);
        }
      }

      // Store first service's dateTime for the main record
      if (i === 0) {
        firstServiceDateTime = dateTime;
        firstServiceBehaviorType = service.behaviorType;
        firstServiceSeverity = service.severity;
      }

      // Handle interventions
      let interventionDetails = null;
      let interventions = ["Other"];

      if (service.interventions) {
        if (Array.isArray(service.interventions)) {
          interventions = service.interventions;
        } else {
          interventionDetails = service.interventions.trim();
          interventions = ["Other"];
        }
      }

      // Validate interventions
      const validInterventions = [
        "Redirect",
        "Counseling",
        "PrnMedication",
        "TimeOut",
        "DeEscalation",
        "EnvironmentalModification",
        "StaffSupport",
        "FamilyNotification",
        "PhysicianNotification",
        "EmergencyResponse",
        "Other",
      ];
      const filteredInterventions = interventions.filter((i) =>
        validInterventions.includes(i)
      );

      if (filteredInterventions.length === 0) {
        throw new Error(
          `Service ${i + 1}: interventions must contain at least one valid intervention type`
        );
      }

      // Add to all interventions set
      filteredInterventions.forEach(intervention => allInterventions.add(intervention));

      // Handle observedBehaviors
      let observedBehaviors = null;
      if (service.observedBehaviors) {
        if (Array.isArray(service.observedBehaviors)) {
          observedBehaviors = service.observedBehaviors
            .filter((b) => b && typeof b === "string" && b.trim().length > 0)
            .map((b) => b.trim());
          if (observedBehaviors.length === 0) {
            observedBehaviors = null;
          } else {
            observedBehaviors.forEach(behavior => allObservedBehaviors.add(behavior));
          }
        }
      }

      // Get service index
      const serviceIndex = service.index !== undefined ? service.index : i + 1;

      // Normalize service data for storage
      processedServices.push({
        index: serviceIndex,
        timeOrDuration: service.timeOrDuration?.trim() || null,
        behaviorType: service.behaviorType || null,
        observedBehaviors: observedBehaviors,
        severity: service.severity || null,
        residentExplanation: service.residentExplanation?.trim() || null,
        outcome: service.outcome?.trim() || null,
        interventions: filteredInterventions,
        interventionDetails: interventionDetails,
        staffName: service.staffName?.trim() || null,
        signature: service.signature?.trim() || null,
        summary: service.summary?.trim() || null,
        dateTime: dateTime.toISOString(),
      });
    } catch (error) {
      const serviceIndex = service.index !== undefined ? service.index : i + 1;
      throw new Error(`Service ${serviceIndex}: ${error.message}`);
    }
  }

  // Validate we have at least one service
  if (processedServices.length === 0) {
    throw new Error("At least one service is required");
  }

  // Create a single behavioral log record with all services
  try {
    const behavioralLog = await prisma.behavioralLog.create({
      data: {
        residentId: data.residentId.trim(),
        residentName: residentName,
        tenantId,
        dateTime: firstServiceDateTime,
        duration: null, // Not applicable for batch records
        behaviorType: firstServiceBehaviorType || null, // Use first service's behaviorType or null
        observedBehaviors: Array.from(allObservedBehaviors).length > 0 ? Array.from(allObservedBehaviors) : null,
        severity: firstServiceSeverity, // Use first service's severity
        trigger: null,
        staffNotes: null, // Services have individual staff notes
        residentExplanation: null, // Services have individual explanations
        outcome: null, // Services have individual outcomes
        interventions: Array.from(allInterventions), // Aggregate all interventions
        interventionDetails: null, // Services have individual intervention details
        selectedTier: data.selectedTier?.trim() || null,
        services: processedServices, // Store all services as JSON
        staffId: requestingUser.id,
        staffName: staff?.name || null, // Use logged-in user's name
        prnRecordId: null,
        createdBy: requestingUser.id,
      },
      include: {
        staff: {
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
      },
    });

    // Log audit event
    logBehavioralAction({
      action: "BEHAVIORAL_LOG_CREATED",
      userId: requestingUser.id,
      tenantId: behavioralLog.tenantId,
      resourceId: behavioralLog.id,
      req: null,
      metadata: {
        residentId: behavioralLog.residentId,
        behaviorType: behavioralLog.behaviorType,
        severity: behavioralLog.severity,
        serviceCount: processedServices.length,
        isBatch: true,
      },
    });

    return {
      logs: [{
        id: behavioralLog.id,
        residentId: behavioralLog.residentId,
        dateTime: behavioralLog.dateTime,
        behaviorType: behavioralLog.behaviorType,
        serviceCount: processedServices.length,
        services: processedServices,
      }],
      failed: [],
      success: true,
    };
  } catch (error) {
    throw new Error(`Failed to create behavioral log batch: ${error.message}`);
  }
}

module.exports = {
  createBehavioralLog,
  createBehavioralLogsBatch,
  getBehavioralLogs,
  getBehavioralLogById,
  updateBehavioralLog,
  deleteBehavioralLog,
  getBehavioralDashboard,
  getResidentName,
};
