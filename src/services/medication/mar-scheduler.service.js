const prisma = require("../../lib/prisma");
const { generateTimeSlots } = require("../../utils/medication.utils");

/**
 * Generate schedules for a medication between startDate and endDate
 * @param {string} medicationId - Medication ID
 * @param {Date} startDate - Start date for schedule generation
 * @param {Date} endDate - End date for schedule generation (null for no end)
 * @returns {Promise<number>} Count of schedules created
 */
async function generateSchedulesForMedication(
  medicationId,
  startDate,
  endDate = null
) {
  // Get medication details
  const medication = await prisma.medication.findUnique({
    where: { id: medicationId },
    select: {
      id: true,
      residentId: true,
      tenantId: true,
      timeSlots: true,
      startDate: true,
      endDate: true,
      isActive: true,
      isPrn: true,
    },
  });

  if (!medication) {
    throw new Error("Medication not found");
  }

  if (!medication.isActive) {
    // Don't generate schedules for inactive medications
    return 0;
  }

  if (!medication.timeSlots || medication.timeSlots.length === 0) {
    // No time slots defined, cannot generate schedules
    // If it's PRN without timeSlots, that's expected (PRN = as needed, no schedule)
    return 0;
  }

  // If medication is marked as PRN but has timeSlots, generate schedules anyway
  // (timeSlots indicate it should be scheduled, not PRN)
  if (medication.isPrn) {
    // Log a warning but still generate schedules if timeSlots exist
    console.warn(
      `[SCHEDULER] Medication ${medication.id} is marked as PRN but has timeSlots. Generating schedules anyway.`
    );
  }

  // Determine the actual date range for schedule generation
  // Use the intersection of: (requested range) AND (medication's valid range)
  let scheduleStartDate;
  let scheduleEndDate;

  if (startDate) {
    // Use provided startDate, but ensure it's not before medication's startDate
    const medStartDate = new Date(medication.startDate);
    scheduleStartDate = startDate > medStartDate ? startDate : medStartDate;
  } else {
    scheduleStartDate = new Date(medication.startDate);
  }

  if (endDate) {
    // Use provided endDate, but ensure it's not after medication's endDate (if exists)
    if (medication.endDate) {
      const medEndDate = new Date(medication.endDate);
      scheduleEndDate = endDate < medEndDate ? endDate : medEndDate;
    } else {
      scheduleEndDate = endDate;
    }
  } else {
    scheduleEndDate = medication.endDate || null;
  }

  // Ensure startDate is not after endDate
  if (scheduleEndDate && scheduleStartDate > scheduleEndDate) {
    console.log(
      `[SCHEDULER] Skipping schedule generation for medication ${
        medication.id
      }: requested range (${startDate?.toISOString()} - ${endDate?.toISOString()}) does not overlap with medication range (${medication.startDate.toISOString()} - ${
        medication.endDate?.toISOString() || "null"
      })`
    );
    return 0;
  }

  // Generate all scheduled times (pass frequency for special filtering)
  const scheduledTimes = generateTimeSlots(
    medication.timeSlots,
    scheduleStartDate,
    scheduleEndDate,
    medication.frequency // Pass frequency string for QOD, QOW, monthly, weekly, odd/even day filtering
  );

  if (scheduledTimes.length === 0) {
    return 0;
  }

  // Create schedule records in batches
  const schedules = scheduledTimes.map((scheduledTime) => {
    // Use UTC date to match database storage
    const scheduledDate = new Date(scheduledTime);
    const dateStr = scheduledDate.toISOString().split("T")[0];
    const utcScheduledDate = new Date(dateStr + "T00:00:00.000Z");

    // Format time slot label (e.g., "8AM", "12PM")
    // Use UTC methods to ensure consistent time slot labels regardless of server timezone
    const hours = scheduledTime.getUTCHours();
    const minutes = scheduledTime.getUTCMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const timeSlotLabel = `${displayHours}${
      minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : ""
    }${period}`;

    return {
      medicationId: medication.id,
      residentId: medication.residentId,
      tenantId: medication.tenantId,
      scheduledDate: utcScheduledDate,
      scheduledTime,
      timeSlot: timeSlotLabel,
      status: "Pending",
      isMissed: false,
      isLate: false,
      lateThreshold: 120, // Default 120 minutes
    };
  });

  // Use createMany with skipDuplicates to avoid conflicts
  const result = await prisma.medicationSchedule.createMany({
    data: schedules,
    skipDuplicates: true, // Skip if schedule already exists (unique constraint)
  });

  return result.count;
}

/**
 * Regenerate schedules for a medication (delete future pending schedules and regenerate)
 * @param {string} medicationId - Medication ID
 * @returns {Promise<number>} Count of schedules created
 */
async function regenerateSchedulesForMedication(medicationId) {
  // Get medication details
  const medication = await prisma.medication.findUnique({
    where: { id: medicationId },
    select: {
      id: true,
      residentId: true,
      tenantId: true,
      timeSlots: true,
      frequency: true, // Include frequency for special filtering
      startDate: true,
      endDate: true,
      isActive: true,
      isPrn: true,
    },
  });

  if (!medication) {
    throw new Error("Medication not found");
  }

  if (!medication.isActive) {
    // Don't generate schedules for inactive medications
    return 0;
  }

  // Skip PRN medications only if they don't have timeSlots
  // If they have timeSlots, they should have schedules (even if marked as PRN)
  if (
    medication.isPrn &&
    (!medication.timeSlots || medication.timeSlots.length === 0)
  ) {
    return 0;
  }

  if (
    medication.isPrn &&
    medication.timeSlots &&
    medication.timeSlots.length > 0
  ) {
    // Log a warning but still generate schedules if timeSlots exist
    console.warn(
      `[SCHEDULER] Medication ${medication.id} is marked as PRN but has timeSlots. Generating schedules anyway.`
    );
  }

  // Delete future pending schedules (preserve Given/Missed/Late records)
  const now = new Date();
  await prisma.medicationSchedule.deleteMany({
    where: {
      medicationId,
      status: "Pending",
      scheduledTime: {
        gte: now,
      },
    },
  });

  // Regenerate from current date (or medication startDate if later)
  const startDate = medication.startDate > now ? medication.startDate : now;
  const endDate = medication.endDate;

  return generateSchedulesForMedication(medicationId, startDate, endDate);
}

/**
 * Generate schedules for all active medications for a resident
 * @param {string} residentId - Resident ID
 * @param {Date} startDate - Start date for schedule generation
 * @param {Date} endDate - End date for schedule generation (null for no end)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Summary of schedules created
 */
async function generateSchedulesForResident(
  residentId,
  startDate,
  endDate = null,
  tenantId
) {
  // Get all active medications for resident
  const medications = await prisma.medication.findMany({
    where: {
      residentId,
      tenantId,
      isActive: true,
      isPrn: false,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      timeSlots: true,
    },
  });

  const summary = {
    totalMedications: medications.length,
    schedulesCreated: 0,
    medicationsProcessed: [],
  };

  // Generate schedules for each medication
  for (const medication of medications) {
    if (medication.timeSlots && medication.timeSlots.length > 0) {
      try {
        const count = await generateSchedulesForMedication(
          medication.id,
          startDate,
          endDate
        );
        summary.schedulesCreated += count;
        summary.medicationsProcessed.push({
          medicationId: medication.id,
          name: medication.name,
          schedulesCreated: count,
        });
      } catch (error) {
        console.error(
          `[SCHEDULER] Failed to generate schedules for medication ${medication.id}:`,
          error
        );
        summary.medicationsProcessed.push({
          medicationId: medication.id,
          name: medication.name,
          error: error.message,
        });
      }
    }
  }

  return summary;
}

/**
 * Get all schedules for a specific date for a resident
 * @param {string} residentId - Resident ID
 * @param {Date} date - Date to get schedules for
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of schedules with medication and MAR record details
 */
async function getSchedulesForDate(residentId, date, tenantId) {
  // Parse date properly to avoid timezone issues
  // Use UTC dates to match database storage (PostgreSQL stores DateTime in UTC)
  let targetDate;
  if (typeof date === "string") {
    // Handle ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
    const dateStr = date.split("T")[0]; // Get just the date part
    // Create UTC date: YYYY-MM-DD 00:00:00 UTC
    targetDate = new Date(dateStr + "T00:00:00.000Z");
  } else {
    // If it's already a Date object, convert to UTC midnight
    const dateStr = date.toISOString().split("T")[0];
    targetDate = new Date(dateStr + "T00:00:00.000Z");
  }

  // Next day in UTC
  const nextDate = new Date(targetDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const schedules = await prisma.medicationSchedule.findMany({
    where: {
      residentId,
      tenantId,
      scheduledDate: {
        gte: targetDate,
        lt: nextDate,
      },
    },
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
      marRecord: {
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
      },
    },
    orderBy: {
      scheduledTime: "asc",
    },
  });

  return schedules;
}

/**
 * Mark a schedule as given (link to MAR record)
 * @param {string} scheduleId - Schedule ID
 * @param {string} marRecordId - MAR record ID
 * @param {Date} administeredAt - When the medication was actually administered (optional, defaults to now)
 * @returns {Promise<Object>} Updated schedule
 */
async function markScheduleAsGiven(scheduleId, marRecordId, administeredAt = null) {
  // Get schedule and MAR record
  const schedule = await prisma.medicationSchedule.findUnique({
    where: { id: scheduleId },
  });

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  const marRecord = await prisma.marRecord.findUnique({
    where: { id: marRecordId },
  });

  if (!marRecord) {
    throw new Error("MAR record not found");
  }

  // Use provided administeredAt or fall back to MAR record's administeredAt or current time
  const actualAdministeredAt = administeredAt
    ? new Date(administeredAt)
    : new Date(marRecord.administeredAt || new Date());

  // Calculate if late (based on lateThreshold)
  const scheduledTime = new Date(schedule.scheduledTime);
  const lateThreshold = schedule.lateThreshold || 120; // Default 120 minutes (2 hours)
  const minutesLate = (actualAdministeredAt - scheduledTime) / (1000 * 60);

  // Determine status: Given (on-time) or Late (given but late)
  // If within 30 minutes, consider it on-time; otherwise late
  const gracePeriod = 30; // 30 minutes grace period
  const isLate = minutesLate > gracePeriod;
  const status = isLate ? "Late" : "Given";

  // Update schedule
  const updatedSchedule = await prisma.medicationSchedule.update({
    where: { id: scheduleId },
    data: {
      status,
      isLate,
      marRecord: {
        connect: { id: marRecordId },
      },
    },
    include: {
      marRecord: true,
    },
  });

  return updatedSchedule;
}

/**
 * Mark a schedule as missed
 * @param {string} scheduleId - Schedule ID
 * @param {string} reason - Reason for missing (optional)
 * @returns {Promise<Object>} Updated schedule
 */
async function markScheduleAsMissed(scheduleId, reason = null) {
  const schedule = await prisma.medicationSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      medication: true,
    },
  });

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  // Update schedule status
  const updatedSchedule = await prisma.medicationSchedule.update({
    where: { id: scheduleId },
    data: {
      status: "Missed",
      isMissed: true,
    },
  });

  // Note: MAR record creation for missed doses will be handled in Phase 4 (MAR service)
  // For now, we just update the schedule status

  return updatedSchedule;
}

/**
 * Auto-mark earlier missed slots when recording a dose for a later slot
 * This ensures that if a user records a 4pm dose, any earlier unrecorded slots (e.g., 12pm) are marked as missed
 * @param {string} medicationId - Medication ID
 * @param {string} residentId - Resident ID
 * @param {Date} currentDate - Current date (to find schedules for the same day)
 * @param {string} currentScheduleId - The schedule ID being recorded (exclude this one)
 * @param {Date} recordingTime - The time when the dose is being recorded (to determine if earlier slots should be marked)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Count of schedules marked as missed
 */
async function markEarlierMissedSlots(
  medicationId,
  residentId,
  currentDate,
  currentScheduleId,
  recordingTime,
  tenantId
) {
  // Parse date to get start and end of day in UTC
  const targetDate = new Date(currentDate);
  targetDate.setUTCHours(0, 0, 0, 0);
  const nextDate = new Date(targetDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  // Get the current schedule to know its scheduled time
  const currentSchedule = await prisma.medicationSchedule.findUnique({
    where: { id: currentScheduleId },
    select: {
      scheduledTime: true,
    },
  });

  if (!currentSchedule) {
    return 0;
  }

  const currentScheduledTime = new Date(currentSchedule.scheduledTime);

  // Find all pending schedules for the same medication, resident, and date
  // that are earlier than the current schedule's time
  // and have passed (their scheduled time is before the recording time)
  const earlierPendingSchedules = await prisma.medicationSchedule.findMany({
    where: {
      medicationId,
      residentId,
      tenantId,
      scheduledDate: {
        gte: targetDate,
        lt: nextDate,
      },
      status: "Pending",
      scheduledTime: {
        lt: currentScheduledTime, // Earlier than the current schedule
      },
      id: {
        not: currentScheduleId, // Exclude the current schedule
      },
    },
  });

  let markedCount = 0;

  // Mark each earlier schedule as missed if its scheduled time has passed
  for (const schedule of earlierPendingSchedules) {
    const scheduledTime = new Date(schedule.scheduledTime);

    // Only mark as missed if the scheduled time has passed
    // (i.e., we're recording a later dose and this earlier one was never recorded)
    if (scheduledTime < recordingTime) {
      await prisma.medicationSchedule.update({
        where: { id: schedule.id },
        data: {
          status: "Missed",
          isMissed: true,
        },
      });
      markedCount++;

      console.log(
        `[MAR-SCHEDULER] Auto-marked schedule ${schedule.id} (${schedule.timeSlot}) as Missed when recording later dose`
      );
    }
  }

  return markedCount;
}

/**
 * Sync schedule statuses for schedules that have MAR records but status is still Pending
 * This fixes old records created before scheduleId linking was implemented
 * @param {string} tenantId - Tenant ID (optional, if not provided syncs all)
 * @returns {Promise<number>} Count of schedules updated
 */
async function syncScheduleStatuses(tenantId = null) {
  // Find all schedules with status "Pending" that have linked MAR records
  const whereClause = {
    status: "Pending",
    marRecord: {
      isNot: null,
    },
  };

  if (tenantId) {
    whereClause.tenantId = tenantId;
  }

  const schedulesWithRecords = await prisma.medicationSchedule.findMany({
    where: whereClause,
    include: {
      marRecord: {
        select: {
          id: true,
          status: true,
          administeredAt: true,
        },
      },
    },
  });

  let updatedCount = 0;

  for (const schedule of schedulesWithRecords) {
    if (!schedule.marRecord) continue;

    const marStatus = schedule.marRecord.status;
    const administeredAt = new Date(schedule.marRecord.administeredAt);
    const scheduledTime = new Date(schedule.scheduledTime);

    // Calculate if late (30 minute grace period)
    const gracePeriod = 30; // minutes
    const minutesLate = (administeredAt - scheduledTime) / (1000 * 60);
    const isLate = minutesLate > gracePeriod;

    let newStatus;
    let updateData = {};

    if (marStatus === "Given") {
      newStatus = isLate ? "Late" : "Given";
      updateData = {
        status: newStatus,
        isLate,
        isMissed: false,
      };
    } else if (marStatus === "NotGiven" || marStatus === "Refused") {
      newStatus = "Missed";
      updateData = {
        status: newStatus,
        isMissed: true,
        isLate: false,
      };
    } else {
      // Unknown status, skip
      continue;
    }

    await prisma.medicationSchedule.update({
      where: { id: schedule.id },
      data: updateData,
    });

    updatedCount++;
    console.log(
      `[MAR-SCHEDULER] Synced schedule ${schedule.id} (${schedule.timeSlot}) from Pending to ${newStatus} based on MAR record status ${marStatus}`
    );
  }

  return updatedCount;
}

/**
 * Check and mark late schedules for a resident on a specific date
 * @param {string} residentId - Resident ID
 * @param {Date} date - Date to check
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Count of late schedules marked
 */
async function checkAndMarkLateSchedules(residentId, date, tenantId) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const nextDate = new Date(targetDate);
  nextDate.setDate(nextDate.getDate() + 1);

  const now = new Date();

  // Get all pending schedules for the date
  const pendingSchedules = await prisma.medicationSchedule.findMany({
    where: {
      residentId,
      tenantId,
      scheduledDate: {
        gte: targetDate,
        lt: nextDate,
      },
      status: "Pending",
      scheduledTime: {
        lt: now, // Only check past schedules
      },
    },
  });

  let lateCount = 0;

  // Check each schedule and mark as late if past threshold
  for (const schedule of pendingSchedules) {
    const scheduledTime = new Date(schedule.scheduledTime);
    const lateThreshold = schedule.lateThreshold || 120; // Default 120 minutes
    const minutesLate = (now - scheduledTime) / (1000 * 60);

    if (minutesLate > lateThreshold) {
      // Mark as late
      await prisma.medicationSchedule.update({
        where: { id: schedule.id },
        data: {
          status: "Late",
          isLate: true,
        },
      });

      lateCount++;
    }
  }

  return lateCount;
}

/**
 * Get schedules for a specific medication, resident, and date
 * Used for showing available slots when creating MAR records
 * @param {string} medicationId - Medication ID
 * @param {string} residentId - Resident ID
 * @param {Date|string} date - Date to get schedules for
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of schedules with medication and MAR record details
 */
async function getSchedulesForMedicationAndDate(
  medicationId,
  residentId,
  date,
  tenantId
) {
  // Validate medication exists and belongs to tenant
  const medication = await prisma.medication.findFirst({
    where: {
      id: medicationId,
      residentId,
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      isActive: true,
      isPrn: true,
      timeSlots: true,
    },
  });

  if (!medication) {
    throw new Error(
      "Medication not found or does not belong to the specified resident and tenant"
    );
  }

  // Parse date properly to avoid timezone issues
  let targetDate;
  if (typeof date === "string") {
    const dateStr = date.split("T")[0];
    targetDate = new Date(dateStr + "T00:00:00.000Z");
  } else {
    const dateStr = date.toISOString().split("T")[0];
    targetDate = new Date(dateStr + "T00:00:00.000Z");
  }

  // Next day in UTC
  const nextDate = new Date(targetDate);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const schedules = await prisma.medicationSchedule.findMany({
    where: {
      medicationId,
      residentId,
      tenantId,
      scheduledDate: {
        gte: targetDate,
        lt: nextDate,
      },
    },
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
      marRecord: {
        select: {
          id: true,
          status: true,
          administeredAt: true,
          caregiverInitials: true,
          signature: true,
        },
      },
    },
    orderBy: {
      scheduledTime: "asc",
    },
  });

  return schedules;
}

/**
 * Get schedules for a medication within a date range
 * @param {string} medicationId - Medication ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of schedules
 */
async function getSchedulesForMedication(medicationId, startDate, endDate) {
  const schedules = await prisma.medicationSchedule.findMany({
    where: {
      medicationId,
      scheduledDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      marRecord: {
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
    },
    orderBy: {
      scheduledTime: "asc",
    },
  });

  return schedules;
}

module.exports = {
  generateSchedulesForMedication,
  regenerateSchedulesForMedication,
  generateSchedulesForResident,
  getSchedulesForDate,
  getSchedulesForMedicationAndDate,
  markScheduleAsGiven,
  markScheduleAsMissed,
  markEarlierMissedSlots,
  syncScheduleStatuses,
  checkAndMarkLateSchedules,
  getSchedulesForMedication,
};
