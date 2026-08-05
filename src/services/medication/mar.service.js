const prisma = require("../../lib/prisma");
const {
  validateResidentId,
  getResidentById,
} = require("../resident/resident.service");
const {
  markScheduleAsGiven,
  markScheduleAsMissed,
  markEarlierMissedSlots,
} = require("./mar-scheduler.service");
const { logMarAction } = require("../compliance/audit.service");

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
      `[MAR] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Record dose administration
 * @param {Object} data - Dose administration data
 * @param {Object} requestingUser - User recording the dose
 * @returns {Promise<Object>} Created MAR record
 */
async function recordDose(data, requestingUser) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when recording dose as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to record doses");
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

  // Get medication and validate
  const medication = await prisma.medication.findFirst({
    where: {
      id: data.medicationId,
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      isPrn: true,
      timeSlots: true,
      requiresVitals: true,
      vitalsType: true,
    },
  });

  if (!medication) {
    throw new Error("Medication not found or access denied");
  }

  if (!medication.isActive) {
    throw new Error("Cannot record dose for inactive medication");
  }

  // For scheduled medications (non-PRN with timeSlots), scheduleId is required
  const hasTimeSlots =
    medication.timeSlots &&
    Array.isArray(medication.timeSlots) &&
    medication.timeSlots.length > 0;
  const isScheduledMedication = !medication.isPrn && hasTimeSlots;

  if (isScheduledMedication && !data.scheduleId) {
    throw new Error(
      `This medication is scheduled and requires selecting a time slot. Please provide scheduleId.`
    );
  }

  // Handle vitals: validate existing vitalsId first (if provided), then create inline if needed
  let vitalsId = data.vitalsId || null;

  // If vitalsId provided, validate it exists and is not linked to any record BEFORE processing
  if (vitalsId) {
    const existingVitals = await prisma.vitalSign.findFirst({
      where: {
        id: vitalsId,
        tenantId,
        residentId: data.residentId,
      },
      include: {
        marRecord: {
          select: {
            id: true,
          },
        },
        prnRecord: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingVitals) {
      throw new Error("Vitals record not found or does not belong to resident");
    }

    // Validate that vitals is not already linked to any record (MAR or PRN)
    if (existingVitals.marRecord) {
      throw new Error(
        "This vitals record is already linked to a MAR record and cannot be reused"
      );
    }
    if (existingVitals.prnRecord) {
      throw new Error(
        "This vitals record is already linked to a PRN record and cannot be reused"
      );
    }
  }

  if (medication.requiresVitals) {
    // If vitals data is provided inline, create vitals record using vitals service
    if (data.vitals && typeof data.vitals === "object") {
      const { recordVitals } = require("../vitals/vitals.service");

      // Validate that required vitals type is provided
      const vitalsType = medication.vitalsType;
      const vitalsData = data.vitals;

      // Map vitalsType to full names for validation
      if (vitalsType === "Temperature" && !vitalsData.temperature) {
        throw new Error("Temperature is required for this medication");
      }
      if (
        vitalsType === "BloodPressure" &&
        (!vitalsData.bloodPressureSystolic ||
          !vitalsData.bloodPressureDiastolic)
      ) {
        throw new Error(
          "Blood pressure (systolic and diastolic) is required for this medication"
        );
      }
      if (vitalsType === "Pulse" && !vitalsData.pulse) {
        throw new Error("Pulse is required for this medication");
      }
      if (vitalsType === "All") {
        // At least one vital should be provided
        if (
          !vitalsData.temperature &&
          !vitalsData.pulse &&
          !vitalsData.bloodPressureSystolic &&
          !vitalsData.oxygenSaturation
        ) {
          throw new Error(
            "At least one vital sign is required for this medication"
          );
        }
      }

      // Prepare vitals data for recordVitals service
      const vitalsRecordData = {
        residentId: data.residentId.trim(),
        tenantId,
        medicationId: medication.id,
        recordedAt: vitalsData.recordedAt || data.administeredAt,
        bloodPressureSystolic: vitalsData.bloodPressureSystolic || null,
        bloodPressureDiastolic: vitalsData.bloodPressureDiastolic || null,
        pulse: vitalsData.pulse || null,
        temperature: vitalsData.temperature || null,
        temperatureUnit: vitalsData.temperatureUnit || "F",
        oxygenSaturation: vitalsData.oxygenSaturation || null,
        weight: vitalsData.weight || null,
        weightUnit: vitalsData.weightUnit || "lbs",
        notes: vitalsData.notes?.trim() || null,
      };

      // Create vitals record using vitals service
      const vitalsRecord = await recordVitals(vitalsRecordData, requestingUser);
      vitalsId = vitalsRecord.id;
    } else if (!vitalsId) {
      // Medication requires vitals but neither vitalsId nor vitals data provided
      const vitalsTypeMessage = medication.vitalsType
        ? `Required vitals type: ${medication.vitalsType}. `
        : "";
      throw new Error(
        `Vitals are required for medication ${medication.name}. ` +
          `${vitalsTypeMessage}` +
          `Please provide either vitalsId (for existing vitals record) or vitals data object ` +
          `with the required vital signs (temperature, pulse, bloodPressure, etc.)`
      );
    }
  }

  // Get schedule if scheduleId provided
  let schedule = null;
  if (data.scheduleId) {
    schedule = await prisma.medicationSchedule.findFirst({
      where: {
        id: data.scheduleId,
        medicationId: medication.id,
        tenantId,
      },
    });

    if (!schedule) {
      throw new Error("Schedule not found or does not match medication");
    }
  }

  // Get caregiver user details
  const caregiver = await prisma.user.findUnique({
    where: { id: requestingUser.id },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  // Generate caregiver initials (first letter of first name + first letter of last name)
  const caregiverInitials = caregiver.name
    ? caregiver.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : null;

  // Prepare scheduled time (use schedule's scheduledTime if available, otherwise use administeredAt)
  const scheduledTime = schedule
    ? new Date(schedule.scheduledTime)
    : new Date(data.scheduledTime || data.administeredAt);

  // Normalize status to match enum (Given, NotGiven, Refused)
  // Legacy statuses are mapped to new ones for backward compatibility
  let normalizedStatus = data.status;
  if (data.status) {
    const statusMap = {
      GIVEN: "Given",
      NOTGIVEN: "NotGiven",
      NOT_GIVEN: "NotGiven",
      REFUSED: "Refused",
      // Legacy status mappings for backward compatibility
      MISSED: "NotGiven", // Map MISSED to NotGiven
      SKIPPED: "NotGiven", // Map SKIPPED to NotGiven
      HOLD: "NotGiven", // Map HOLD to NotGiven
      HELD: "NotGiven",
      LATE: "Given", // Map LATE to Given (medication was given, just late)
    };
    normalizedStatus =
      statusMap[data.status.toUpperCase()] ||
      (["Given", "NotGiven", "Refused"].includes(data.status)
        ? data.status
        : "Given"); // Default to Given if invalid
  }

  // Validate reason fields based on status
  if (normalizedStatus === "NotGiven" && !data.notGivenReason) {
    throw new Error(
      "Reason is required when medication status is 'Not Given'. Please provide notGivenReason."
    );
  }
  if (normalizedStatus === "Refused" && !data.refusedReason) {
    throw new Error(
      "Reason is required when medication status is 'Refused'. Please provide refusedReason."
    );
  }

  // Create MAR record
  const marRecord = await prisma.marRecord.create({
    data: {
      medicationId: medication.id,
      scheduleId: data.scheduleId || null,
      residentId: data.residentId.trim(),
      tenantId,
      administeredAt: new Date(data.administeredAt),
      scheduledTime,
      status: normalizedStatus,
      caregiverId: requestingUser.id,
      caregiverName: caregiver.name,
      caregiverInitials,
      signature: data.signature || null,
      signatureType: data.signatureType || null,
      notes: data.notes?.trim() || null,
      residentResponse: data.residentResponse?.trim() || null,
      notGivenReason: data.notGivenReason?.trim() || null,
      refusedReason: data.refusedReason?.trim() || null,
      vitalsId: vitalsId,
      createdBy: requestingUser.id,
    },
    include: {
      medication: {
        select: {
          id: true,
          name: true,
          dosage: true,
          route: true,
        },
      },
      caregiver: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      vitals: {
        select: {
          id: true,
          bloodPressureSystolic: true,
          bloodPressureDiastolic: true,
          pulse: true,
          temperature: true,
          oxygenSaturation: true,
        },
      },
      schedule: {
        select: {
          id: true,
          scheduledTime: true,
          timeSlot: true,
        },
      },
    },
  });

  // Update schedule status if schedule exists
  if (schedule) {
    if (normalizedStatus === "Given") {
      // Mark schedule as given, passing the administeredAt time for accurate late calculation
      await markScheduleAsGiven(
        schedule.id,
        marRecord.id,
        marRecord.administeredAt
      );

      // Auto-mark earlier missed slots for the same medication/resident/date
      // This ensures that if recording a 4pm dose, any earlier unrecorded slots (e.g., 12pm) are marked as missed
      const scheduleDate = new Date(schedule.scheduledDate);
      const markedCount = await markEarlierMissedSlots(
        medication.id,
        data.residentId.trim(),
        scheduleDate,
        schedule.id,
        marRecord.administeredAt,
        tenantId
      );

      if (markedCount > 0) {
        console.log(
          `[MAR] Auto-marked ${markedCount} earlier missed slot(s) when recording dose for schedule ${schedule.id}`
        );
      }
    } else if (
      normalizedStatus === "NotGiven" ||
      normalizedStatus === "Refused"
    ) {
      // Map NotGiven/Refused to Missed for schedule status
      await markScheduleAsMissed(schedule.id);
    } else {
      // Update schedule status directly (for legacy statuses)
      await prisma.medicationSchedule.update({
        where: { id: schedule.id },
        data: { status: normalizedStatus === "Given" ? "Given" : "Missed" },
      });
    }
  }

  // Log audit event
  logMarAction({
    action: "MAR_RECORD_CREATED",
    userId: requestingUser.id,
    tenantId,
    resourceId: marRecord.id,
    req: null, // Will be passed from controller
    metadata: {
      residentId: marRecord.residentId,
      medicationId: medication.id,
      medicationName: medication.name,
      status: normalizedStatus,
      ...(marRecord.notGivenReason && {
        notGivenReason: marRecord.notGivenReason,
      }),
      ...(marRecord.refusedReason && {
        refusedReason: marRecord.refusedReason,
      }),
    },
  });

  return marRecord;
}

/**
 * Get MAR records with filtering
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} MAR records with pagination
 */
async function getMarRecords(user, filters = {}) {
  const {
    page = 1,
    limit = 10,
    residentId,
    medicationId,
    dateFrom,
    dateTo,
    status,
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

  // Build date filter
  const dateFilter = {};
  if (dateFrom) {
    dateFilter.gte = new Date(dateFrom);
  }
  if (dateTo) {
    dateFilter.lte = new Date(dateTo);
  }

  // Normalize status to match enum (Given, NotGiven, Refused)
  let normalizedStatus = null;
  if (status) {
    const statusMap = {
      GIVEN: "Given",
      NOTGIVEN: "NotGiven",
      NOT_GIVEN: "NotGiven",
      REFUSED: "Refused",
      // Legacy status mappings
      MISSED: "NotGiven",
      SKIPPED: "NotGiven",
      HOLD: "NotGiven",
      HELD: "NotGiven",
      LATE: "Given",
    };
    normalizedStatus =
      statusMap[status.toUpperCase()] ||
      (["Given", "NotGiven", "Refused"].includes(status) ? status : null);
  }

  // Build where clause
  const where = {
    ...tenantWhere,
    ...(residentId && { residentId }),
    ...(medicationId && { medicationId }),
    ...(normalizedStatus && { status: normalizedStatus }),
    ...(Object.keys(dateFilter).length > 0 && { administeredAt: dateFilter }),
  };

  // Note: STAFF can see all MAR records within their tenant (no restriction to own records)

  // Execute query with pagination
  const [records, total] = await Promise.all([
    prisma.marRecord.findMany({
      where,
      skip,
      take: limit,
      include: {
        medication: {
          select: {
            id: true,
            name: true,
            dosage: true,
            route: true,
          },
        },
        caregiver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        vitals: {
          select: {
            id: true,
            bloodPressureSystolic: true,
            bloodPressureDiastolic: true,
            pulse: true,
            temperature: true,
            oxygenSaturation: true,
          },
        },
        schedule: {
          select: {
            id: true,
            scheduledTime: true,
            timeSlot: true,
          },
        },
      },
      orderBy: {
        administeredAt: "desc",
      },
    }),
    prisma.marRecord.count({ where }),
  ]);

  // Populate residentName dynamically (don't save to DB)
  const recordsWithNames = await Promise.all(
    records.map(async (record) => {
      const residentName = await getResidentName(
        record.residentId,
        record.tenantId
      );
      record.residentName = residentName;
      return record;
    })
  );

  return {
    records: recordsWithNames,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get MAR record by ID
 * @param {string} recordId - MAR record ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} MAR record with all relations
 */
async function getMarRecordById(recordId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: recordId,
    ...tenantWhere,
  };

  // Note: STAFF can see all MAR records within their tenant (no restriction to own records)

  const record = await prisma.marRecord.findFirst({
    where,
    include: {
      medication: {
        select: {
          id: true,
          name: true,
          dosage: true,
          route: true,
          requiresVitals: true,
          vitalsType: true,
          specialInstructions: true,
        },
      },
      caregiver: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      vitals: {
        select: {
          id: true,
          bloodPressureSystolic: true,
          bloodPressureDiastolic: true,
          pulse: true,
          temperature: true,
          oxygenSaturation: true,
          weight: true,
          recordedAt: true,
        },
      },
      schedule: {
        select: {
          id: true,
          scheduledTime: true,
          timeSlot: true,
          status: true,
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

  if (!record) {
    throw new Error("MAR record not found or access denied");
  }

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    record.residentId,
    record.tenantId
  );
  record.residentName = residentName;

  return record;
}

/**
 * Update MAR record
 * @param {string} recordId - MAR record ID
 * @param {Object} data - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated MAR record
 */
async function updateMarRecord(recordId, data, requestingUser) {
  // Get existing record
  const existingRecord = await getMarRecordById(recordId, requestingUser);

  // Check 24-hour edit lock
  const now = new Date();
  const administeredAt = new Date(existingRecord.administeredAt);
  const hoursSinceAdministered = (now - administeredAt) / (1000 * 60 * 60);

  // Check if locked
  if (existingRecord.isLocked && !existingRecord.canEdit) {
    throw new Error("MAR record is locked and cannot be edited");
  }

  // Check 24-hour rule (STAFF can only edit within 24 hours, but can edit any record)
  if (
    requestingUser.role === "STAFF" &&
    hoursSinceAdministered > 24 &&
    !existingRecord.canEdit
  ) {
    throw new Error(
      "MAR record cannot be edited after 24 hours. Please contact an administrator."
    );
  }

  // Note: STAFF can edit any MAR record within their tenant (not restricted to own records)

  // Normalize status if provided
  let normalizedStatus = null;
  if (data.status) {
    const statusMap = {
      GIVEN: "Given",
      NOTGIVEN: "NotGiven",
      NOT_GIVEN: "NotGiven",
      REFUSED: "Refused",
      // Legacy status mappings
      MISSED: "NotGiven",
      SKIPPED: "NotGiven",
      HOLD: "NotGiven",
      HELD: "NotGiven",
      LATE: "Given",
    };
    normalizedStatus =
      statusMap[data.status.toUpperCase()] ||
      (["Given", "NotGiven", "Refused"].includes(data.status)
        ? data.status
        : null);
  }

  // Validate reason fields if status is being updated
  if (normalizedStatus === "NotGiven" && !data.notGivenReason) {
    // Check if existing record already has a reason
    if (!existingRecord.notGivenReason) {
      throw new Error(
        "Reason is required when medication status is 'Not Given'. Please provide notGivenReason."
      );
    }
  }
  if (normalizedStatus === "Refused" && !data.refusedReason) {
    // Check if existing record already has a reason
    if (!existingRecord.refusedReason) {
      throw new Error(
        "Reason is required when medication status is 'Refused'. Please provide refusedReason."
      );
    }
  }

  // Build update data
  const updateData = {
    ...(data.administeredAt && {
      administeredAt: new Date(data.administeredAt),
    }),
    ...(data.scheduledTime && { scheduledTime: new Date(data.scheduledTime) }),
    ...(normalizedStatus && { status: normalizedStatus }),
    ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
    ...(data.residentResponse !== undefined && {
      residentResponse: data.residentResponse?.trim() || null,
    }),
    ...(data.signature !== undefined && { signature: data.signature || null }),
    ...(data.signatureType !== undefined && {
      signatureType: data.signatureType || null,
    }),
    ...(data.vitalsId !== undefined && { vitalsId: data.vitalsId || null }),
    ...(data.notGivenReason !== undefined && {
      notGivenReason: data.notGivenReason?.trim() || null,
    }),
    ...(data.refusedReason !== undefined && {
      refusedReason: data.refusedReason?.trim() || null,
    }),
    editedAt: now,
    editedBy: requestingUser.id,
  };

  // Update record
  const record = await prisma.marRecord.update({
    where: { id: recordId },
    data: updateData,
    include: {
      medication: {
        select: {
          id: true,
          name: true,
          dosage: true,
          route: true,
        },
      },
      caregiver: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      vitals: {
        select: {
          id: true,
          bloodPressureSystolic: true,
          bloodPressureDiastolic: true,
          pulse: true,
          temperature: true,
          oxygenSaturation: true,
        },
      },
      schedule: {
        select: {
          id: true,
          scheduledTime: true,
          timeSlot: true,
        },
      },
    },
  });

  // Log audit event
  logMarAction({
    action: "MAR_RECORD_UPDATED",
    userId: requestingUser.id,
    tenantId: record.tenantId,
    resourceId: record.id,
    req: null,
    metadata: {
      residentId: record.residentId,
      medicationId: record.medicationId,
      editedBy: requestingUser.id,
    },
  });

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    record.residentId,
    record.tenantId
  );
  record.residentName = residentName;

  return record;
}

/**
 * Delete MAR record
 * @param {string} recordId - MAR record ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Deleted MAR record
 */
async function deleteMarRecord(recordId, requestingUser) {
  // Get existing record
  const existingRecord = await getMarRecordById(recordId, requestingUser);

  // Check permissions - only ADMIN/SUPER_ADMIN can delete
  if (
    requestingUser.role !== "ADMIN" &&
    requestingUser.role !== "SUPER_ADMIN"
  ) {
    throw new Error("Only an administrator can delete this.");
  }

  // Update schedule status back to Pending if schedule exists
  if (existingRecord.scheduleId) {
    await prisma.medicationSchedule.update({
      where: { id: existingRecord.scheduleId },
      data: {
        status: "Pending",
        isLate: false,
        isMissed: false,
      },
    });
  }

  // Delete MAR record (hard delete for compliance - audit trail preserved)
  await prisma.marRecord.delete({
    where: { id: recordId },
  });

  // Log audit event
  logMarAction({
    action: "MAR_RECORD_DELETED",
    userId: requestingUser.id,
    tenantId: existingRecord.tenantId,
    resourceId: recordId,
    req: null,
    metadata: {
      residentId: existingRecord.residentId,
      medicationId: existingRecord.medicationId,
    },
  });

  return existingRecord;
}

/**
 * Get MAR grid for resident and date
 * @param {string} residentId - Resident ID
 * @param {Date} date - Date for MAR grid
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} MAR grid data structure
 */
async function getMarGrid(residentId, date, tenantId) {
  // Validate resident
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error("Resident not found or does not belong to tenant");
  }

  // Get all active medications for resident
  const medications = await prisma.medication.findMany({
    where: {
      residentId,
      tenantId,
      isActive: true,
      deletedAt: null,
    },
    orderBy: {
      name: "asc",
    },
  });

  // Get all schedules for the date
  const { getSchedulesForDate } = require("./mar-scheduler.service");
  const schedules = await getSchedulesForDate(residentId, date, tenantId);

  // Get all MAR records for the date
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const marRecords = await prisma.marRecord.findMany({
    where: {
      residentId,
      tenantId,
      administeredAt: {
        gte: targetDate,
        lt: nextDate,
      },
    },
    include: {
      caregiver: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      vitals: {
        select: {
          id: true,
          bloodPressureSystolic: true,
          bloodPressureDiastolic: true,
          pulse: true,
          temperature: true,
          oxygenSaturation: true,
        },
      },
    },
  });

  // Build grid structure: medications × time slots
  const timeSlots = new Set();
  schedules.forEach((schedule) => {
    timeSlots.add(schedule.timeSlot);
  });

  const sortedTimeSlots = Array.from(timeSlots).sort();

  const grid = medications.map((medication) => {
    const medicationSchedules = schedules.filter(
      (s) => s.medicationId === medication.id
    );

    const medicationRecords = marRecords.filter(
      (r) => r.medicationId === medication.id
    );

    const timeSlotData = sortedTimeSlots.map((timeSlot) => {
      const schedule = medicationSchedules.find((s) => s.timeSlot === timeSlot);
      const record = medicationRecords.find((r) => {
        const rTime = new Date(r.administeredAt);
        const sTime = schedule ? new Date(schedule.scheduledTime) : null;
        // Match record to schedule if within 30 minutes
        if (sTime) {
          const diffMinutes = Math.abs((rTime - sTime) / (1000 * 60));
          return diffMinutes <= 30;
        }
        return false;
      });

      return {
        timeSlot,
        schedule: schedule
          ? {
              id: schedule.id,
              scheduledTime: schedule.scheduledTime,
              status: schedule.status,
              isLate: schedule.isLate,
              isMissed: schedule.isMissed,
            }
          : null,
        record: record
          ? {
              id: record.id,
              administeredAt: record.administeredAt,
              status: record.status,
              caregiverInitials: record.caregiverInitials,
              signature: record.signature ? "✓" : null,
              notes: record.notes,
              vitals: record.vitals,
            }
          : null,
      };
    });

    return {
      medication: {
        id: medication.id,
        name: medication.name,
        dosage: medication.dosage,
        route: medication.route,
        requiresVitals: medication.requiresVitals,
        vitalsType: medication.vitalsType,
        specialInstructions: medication.specialInstructions,
      },
      timeSlots: timeSlotData,
    };
  });

  // Get resident name dynamically
  const residentName = await getResidentName(residentId, tenantId);

  return {
    residentId,
    residentName,
    date: targetDate,
    timeSlots: sortedTimeSlots,
    grid,
  };
}

/**
 * Lock MAR record (admin override)
 * @param {string} recordId - MAR record ID
 * @param {Object} requestingUser - Current user (must be ADMIN or SUPER_ADMIN)
 * @returns {Promise<Object>} Locked MAR record
 */
async function lockMarRecord(recordId, requestingUser) {
  // Check permissions
  if (
    requestingUser.role !== "ADMIN" &&
    requestingUser.role !== "SUPER_ADMIN"
  ) {
    throw new Error("Only administrators can lock MAR records");
  }

  // Get existing record
  const existingRecord = await getMarRecordById(recordId, requestingUser);

  // Lock record
  const record = await prisma.marRecord.update({
    where: { id: recordId },
    data: {
      isLocked: true,
      lockedAt: new Date(),
      canEdit: false,
    },
    include: {
      medication: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log audit event
  logMarAction({
    action: "MAR_RECORD_LOCKED",
    userId: requestingUser.id,
    tenantId: record.tenantId,
    resourceId: record.id,
    req: null,
    metadata: {
      residentId: record.residentId,
      medicationId: record.medicationId,
    },
  });

  return record;
}

/**
 * Unlock MAR record (admin only)
 * @param {string} recordId - MAR record ID
 * @param {Object} requestingUser - Current user (must be ADMIN or SUPER_ADMIN)
 * @returns {Promise<Object>} Unlocked MAR record
 */
async function unlockMarRecord(recordId, requestingUser) {
  // Check permissions
  if (
    requestingUser.role !== "ADMIN" &&
    requestingUser.role !== "SUPER_ADMIN"
  ) {
    throw new Error("Only administrators can unlock MAR records");
  }

  // Get existing record
  const existingRecord = await getMarRecordById(recordId, requestingUser);

  // Unlock record
  const record = await prisma.marRecord.update({
    where: { id: recordId },
    data: {
      isLocked: false,
      canEdit: true,
    },
    include: {
      medication: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Log audit event
  logMarAction({
    action: "MAR_RECORD_UNLOCKED",
    userId: requestingUser.id,
    tenantId: record.tenantId,
    resourceId: record.id,
    req: null,
    metadata: {
      residentId: record.residentId,
      medicationId: record.medicationId,
    },
  });

  return record;
}

module.exports = {
  recordDose,
  getMarRecords,
  getMarRecordById,
  updateMarRecord,
  deleteMarRecord,
  lockMarRecord,
  unlockMarRecord,
};
