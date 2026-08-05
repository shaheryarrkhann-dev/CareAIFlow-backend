const prisma = require("../../lib/prisma");
const { validateResidentId, getResidentById } = require("../resident/resident.service");
const { uploadPdfToS3 } = require("../../utils/s3.util");
const {
  parseFrequency,
  calculateTimesPerDay,
  generateTimeSlots,
} = require("../../utils/medication.utils");
const {
  generateSchedulesForMedication,
  regenerateSchedulesForMedication,
} = require("./mar-scheduler.service");

/**
 * Convert string boolean to actual boolean
 * Handles "true", "false", true, false, and undefined
 */
function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return Boolean(value);
}

/**
 * Get resident name from residentId
 * Fetches from Resident model
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
      `[MEDICATION] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Create new medication
 * ADMIN/SUPER_ADMIN can create medications for any resident
 * STAFF can create medications for residents in their tenant
 */
async function createMedication(
  data,
  requestingUser,
  tenantIdFromQuery = null
) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = tenantIdFromQuery || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when creating medication as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to create medications");
    }
  }

  // Validate that residentId exists and belongs to the tenant
  const isValidResident = await validateResidentId(
    data.residentId.trim(),
    tenantId
  );

  if (!isValidResident) {
    throw new Error(
      "Resident not found or does not belong to your organization"
    );
  }

  // Validate Scheduled vs PRN mutual exclusivity
  const isPrn = toBoolean(data.isPrn, false);

  // If PRN, ensure no time slots/schedules
  if (isPrn) {
    // PRN medications should not have schedules
    // Clear any frequency/time slots if provided
    if (data.frequency && !data.frequency.toLowerCase().includes("prn") &&
        !data.frequency.toLowerCase().includes("as needed")) {
      console.warn(
        `[MEDICATION] Medication marked as PRN but has frequency: ${data.frequency}. Clearing time slots.`
      );
    }
  }

  // Parse frequency into time slots (only for non-PRN medications)
  let timeSlots = [];
  let timesPerDay = 0;

  if (!isPrn) {
    timeSlots = parseFrequency(data.frequency);
    timesPerDay = calculateTimesPerDay(data.frequency);
  } else {
    // For PRN medications, ensure no time slots
    timeSlots = [];
    timesPerDay = 0;
  }

  // Handle prescription PDF upload if provided
  let prescriptionPdfUrl = null;
  let prescriptionS3Key = null;

  if (data.prescriptionPdf) {
    try {
      const s3Result = await uploadPdfToS3({
        tenantId,
        fileName:
          data.prescriptionPdf.originalname || `prescription_${Date.now()}.pdf`,
        buffer: data.prescriptionPdf.buffer,
      });
      prescriptionPdfUrl = s3Result.s3Url;
      prescriptionS3Key = s3Result.s3Key;
    } catch (error) {
      console.error("[MEDICATION] Failed to upload prescription PDF:", error);
      throw new Error(`Failed to upload prescription PDF: ${error.message}`);
    }
  }

  // Validate prisma client
  if (!prisma?.medication) {
    console.error("[MEDICATION] Prisma client not initialized");
    throw new Error(
      "Database client not initialized. Please regenerate Prisma client."
    );
  }

  // Create medication
  const medication = await prisma.medication.create({
    data: {
      residentId: data.residentId.trim(),
      tenantId,
      name: data.name.trim(),
      dosage: data.dosage.trim(),
      route: data.route,
      frequency: data.frequency.trim(),
      timesPerDay,
      timeSlots: timeSlots.length > 0 ? timeSlots : null,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      isActive: toBoolean(data.isActive, true),
      isPrn: toBoolean(data.isPrn, false),
      requiresVitals: toBoolean(data.requiresVitals, false),
      vitalsType: data.vitalsType || null,
      prescriberName: data.prescriberName?.trim() || null,
      prescriberPhone: data.prescriberPhone?.trim() || null,
      pharmacyName: data.pharmacyName?.trim() || null,
      pharmacyPhone: data.pharmacyPhone?.trim() || null,
      specialInstructions: data.specialInstructions?.trim() || null,
      prescriptionPdfUrl,
      prescriptionS3Key,
      createdBy: requestingUser.id,
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Auto-generate schedules if medication is active and not PRN
  // Ensure PRN medications never get schedules
  if (medication.isActive && !medication.isPrn && timeSlots.length > 0) {
    try {
      const scheduleCount = await generateSchedulesForMedication(
        medication.id,
        medication.startDate,
        medication.endDate
      );
      console.log(
        `[MEDICATION] Generated ${scheduleCount} schedules for medication ${medication.id}`
      );
    } catch (error) {
      console.error(
        `[MEDICATION] Failed to generate schedules for medication ${medication.id}:`,
        error
      );
      // Don't fail medication creation if schedule generation fails
    }
  }

  return medication;
}

/**
 * Get medications with filtering (tenant-scoped)
 * Supports filters: residentId, isActive, isPrn
 */
async function getMedications(user, filters = {}) {
  const {
    page = 1,
    limit = 10,
    residentId,
    isActive,
    isPrn,
    tenantId, // From query param (SUPER_ADMIN only)
  } = filters;

  const skip = (page - 1) * limit;

  // Build tenant filter
  let tenantWhere = {};
  if (user.role === "SUPER_ADMIN") {
    if (tenantId) {
      tenantWhere = { tenantId };
    }
    // else no filter = all tenants
  } else {
    tenantWhere = { tenantId: user.tenantId };
  }

  // Build where clause
  const where = {
    ...tenantWhere,
    ...(residentId && { residentId }),
    ...(isActive !== undefined && { isActive }),
    ...(isPrn !== undefined && { isPrn }),
    // Filter out soft-deleted medications
    deletedAt: null,
  };

  // Execute query with pagination
  const [medications, total] = await Promise.all([
    prisma.medication.findMany({
      where,
      skip,
      take: limit,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            schedules: true,
            marRecords: true,
            prnRecords: true,
            prescriptions: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.medication.count({ where }),
  ]);

  // Populate residentName dynamically (don't save to DB)
  const medicationsWithNames = await Promise.all(
    medications.map(async (medication) => {
      const residentName = await getResidentName(
        medication.residentId,
        medication.tenantId
      );
      // Add residentName to response without saving to DB
      medication.residentName = residentName;
      return medication;
    })
  );

  return {
    medications: medicationsWithNames,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get medication by ID with all relations
 */
async function getMedicationById(medicationId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: medicationId,
    ...tenantWhere,
    // Filter out soft-deleted medications
    deletedAt: null,
  };

  const medication = await prisma.medication.findFirst({
    where,
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      schedules: {
        take: 10, // Limit to recent schedules
        orderBy: {
          scheduledTime: "desc",
        },
      },
      marRecords: {
        take: 10, // Limit to recent records
        orderBy: {
          administeredAt: "desc",
        },
        include: {
          caregiver: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      prnRecords: {
        take: 10, // Limit to recent records
        orderBy: {
          givenAt: "desc",
        },
        include: {
          caregiver: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      prescriptions: {
        orderBy: {
          uploadedAt: "desc",
        },
      },
      _count: {
        select: {
          schedules: true,
          marRecords: true,
          prnRecords: true,
          prescriptions: true,
        },
      },
    },
  });

  if (!medication) {
    throw new Error("Medication not found or access denied");
  }

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    medication.residentId,
    medication.tenantId
  );
  medication.residentName = residentName;

  return medication;
}

/**
 * Update medication
 * ADMIN can update any medication in their tenant
 * SUPER_ADMIN can update any medication
 * STAFF can update medications for residents in their tenant
 */
async function updateMedication(medicationId, data, requestingUser) {
  // First, get the medication to check access
  const existingMedication = await getMedicationById(
    medicationId,
    requestingUser
  );

  // Check if isPrn is being changed
  const isPrnChanged = data.isPrn !== undefined &&
    toBoolean(data.isPrn) !== existingMedication.isPrn;
  const newIsPrn = data.isPrn !== undefined ? toBoolean(data.isPrn) : existingMedication.isPrn;

  // Validate Scheduled vs PRN mutual exclusivity
  if (newIsPrn && data.frequency) {
    // If changing to PRN, clear time slots
    const frequencyLower = data.frequency.toLowerCase();
    if (!frequencyLower.includes("prn") && !frequencyLower.includes("as needed")) {
      throw new Error(
        "PRN medications cannot have scheduled frequencies. " +
        "If this medication needs both scheduled and PRN administration, " +
        "please create two separate medication entries."
      );
    }
  }

  // Check if frequency or times changed (need to regenerate schedules)
  const frequencyChanged =
    data.frequency && data.frequency !== existingMedication.frequency;
  const timesChanged =
    data.timesPerDay !== undefined &&
    data.timesPerDay !== existingMedication.timesPerDay;

  // Parse new frequency if provided (only for non-PRN medications)
  let timeSlots = existingMedication.timeSlots;
  let timesPerDay = existingMedication.timesPerDay;

  if (data.frequency && !newIsPrn) {
    timeSlots = parseFrequency(data.frequency);
    timesPerDay = calculateTimesPerDay(data.frequency);
  } else if (newIsPrn) {
    // If changing to PRN, clear time slots
    timeSlots = [];
    timesPerDay = 0;
  }

  // Handle prescription PDF upload if provided
  let prescriptionPdfUrl = existingMedication.prescriptionPdfUrl;
  let prescriptionS3Key = existingMedication.prescriptionS3Key;

  if (data.prescriptionPdf) {
    try {
      const s3Result = await uploadPdfToS3({
        tenantId: existingMedication.tenantId,
        fileName:
          data.prescriptionPdf.originalname || `prescription_${Date.now()}.pdf`,
        buffer: data.prescriptionPdf.buffer,
      });
      prescriptionPdfUrl = s3Result.s3Url;
      prescriptionS3Key = s3Result.s3Key;
    } catch (error) {
      console.error("[MEDICATION] Failed to upload prescription PDF:", error);
      throw new Error(`Failed to upload prescription PDF: ${error.message}`);
    }
  }

  // Build update data
  const updateData = {
    ...(data.name && { name: data.name.trim() }),
    ...(data.dosage && { dosage: data.dosage.trim() }),
    ...(data.route && { route: data.route }),
    ...(data.frequency && { frequency: data.frequency.trim() }),
    ...(data.frequency && !newIsPrn && { timesPerDay }),
    ...(data.frequency && !newIsPrn && {
      timeSlots: timeSlots.length > 0 ? timeSlots : null,
    }),
    ...(newIsPrn && { timeSlots: null, timesPerDay: 0 }), // Clear schedules if PRN
    ...(data.startDate && { startDate: new Date(data.startDate) }),
    ...(data.endDate !== undefined && {
      endDate: data.endDate ? new Date(data.endDate) : null,
    }),
    ...(data.isActive !== undefined && { isActive: toBoolean(data.isActive) }),
    ...(data.isPrn !== undefined && { isPrn: toBoolean(data.isPrn) }),
    ...(data.requiresVitals !== undefined && {
      requiresVitals: toBoolean(data.requiresVitals),
    }),
    ...(data.vitalsType !== undefined && {
      vitalsType: data.vitalsType || null,
    }),
    ...(data.prescriberName !== undefined && {
      prescriberName: data.prescriberName?.trim() || null,
    }),
    ...(data.prescriberPhone !== undefined && {
      prescriberPhone: data.prescriberPhone?.trim() || null,
    }),
    ...(data.pharmacyName !== undefined && {
      pharmacyName: data.pharmacyName?.trim() || null,
    }),
    ...(data.pharmacyPhone !== undefined && {
      pharmacyPhone: data.pharmacyPhone?.trim() || null,
    }),
    ...(data.specialInstructions !== undefined && {
      specialInstructions: data.specialInstructions?.trim() || null,
    }),
    ...(prescriptionPdfUrl && { prescriptionPdfUrl }),
    ...(prescriptionS3Key && { prescriptionS3Key }),
    ...(data.residentId && {
      residentId: data.residentId.trim(),
    }),
  };

  // Update medication
  const medication = await prisma.medication.update({
    where: { id: medicationId },
    data: updateData,
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // If changing from PRN to Scheduled, or frequency/times changed, regenerate schedules
  // But only if medication is active and not PRN
  if (
    (frequencyChanged || timesChanged || isPrnChanged) &&
    medication.isActive &&
    !medication.isPrn &&
    timeSlots.length > 0
  ) {
    try {
      const scheduleCount = await regenerateSchedulesForMedication(
        medication.id
      );
      console.log(
        `[MEDICATION] Regenerated ${scheduleCount} schedules for medication ${medication.id}`
      );
    } catch (error) {
      console.error(
        `[MEDICATION] Failed to regenerate schedules for medication ${medication.id}:`,
        error
      );
      // Don't fail medication update if schedule regeneration fails
    }
  }

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    medication.residentId,
    medication.tenantId
  );
  medication.residentName = residentName;

  return medication;
}

/**
 * Delete medication (soft delete)
 * Only SUPER_ADMIN can delete medications to avoid accidental loss of records
 * ADMIN can deactivate medications instead
 * STAFF cannot delete medications
 */
async function deleteMedication(medicationId, requestingUser) {
  // Check permissions - only SUPER_ADMIN can delete
  if (requestingUser.role !== "SUPER_ADMIN") {
    throw new Error(
      "Only an administrator can delete medications. Use deactivate instead to preserve records."
    );
  }
  // First, get the medication to check access
  const existingMedication = await getMedicationById(
    medicationId,
    requestingUser
  );

  // Check if there are pending doses (schedules with status Pending)
  const pendingSchedules = await prisma.medicationSchedule.count({
    where: {
      medicationId,
      status: "Pending",
    },
  });

  if (pendingSchedules > 0) {
    throw new Error(
      `Cannot delete medication with ${pendingSchedules} pending doses. Please deactivate instead.`
    );
  }

  // Soft delete
  const medication = await prisma.medication.update({
    where: { id: medicationId },
    data: {
      deletedAt: new Date(),
      isActive: false, // Also deactivate
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return medication;
}

/**
 * Activate medication
 * Regenerates schedules from startDate
 */
async function activateMedication(medicationId, requestingUser) {
  // First, get the medication to check access
  const existingMedication = await getMedicationById(
    medicationId,
    requestingUser
  );

  if (existingMedication.isActive) {
    throw new Error("Medication is already active");
  }

  // Activate medication
  const medication = await prisma.medication.update({
    where: { id: medicationId },
    data: {
      isActive: true,
      deletedAt: null, // Clear soft delete
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Regenerate schedules if not PRN and has time slots
  if (
    !medication.isPrn &&
    medication.timeSlots &&
    medication.timeSlots.length > 0
  ) {
    try {
      const scheduleCount = await regenerateSchedulesForMedication(
        medication.id
      );
      console.log(
        `[MEDICATION] Regenerated ${scheduleCount} schedules for medication ${medication.id}`
      );
    } catch (error) {
      console.error(
        `[MEDICATION] Failed to regenerate schedules for medication ${medication.id}:`,
        error
      );
      // Don't fail medication activation if schedule generation fails
    }
  }

  return medication;
}

/**
 * Deactivate medication
 * Cancels future schedules
 */
async function deactivateMedication(medicationId, requestingUser) {
  // First, get the medication to check access
  const existingMedication = await getMedicationById(
    medicationId,
    requestingUser
  );

  if (!existingMedication.isActive) {
    throw new Error("Medication is already inactive");
  }

  // Deactivate medication
  const medication = await prisma.medication.update({
    where: { id: medicationId },
    data: {
      isActive: false,
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Cancel future schedules (status = Pending)
  await prisma.medicationSchedule.updateMany({
    where: {
      medicationId,
      status: "Pending",
    },
    data: {
      status: "Hold",
    },
  });

  return medication;
}

module.exports = {
  createMedication,
  getMedications,
  getMedicationById,
  updateMedication,
  deleteMedication,
  activateMedication,
  deactivateMedication,
};
