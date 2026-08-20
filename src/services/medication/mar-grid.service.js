const prisma = require("../../lib/prisma");
const { validateResidentId, getResidentById } = require("../resident/resident.service");
const {
  getSchedulesForDate,
  generateSchedulesForMedication,
} = require("./mar-scheduler.service");
const { getPendingPrnFollowups } = require("./prn-record.service");

/**
 * Get resident name from residentId
 * Fetches dynamically from form submissions
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
      `[MAR-GRID] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Get MAR grid for resident and date
 * @param {string} residentId - Resident ID
 * @param {Date|string} date - Date for MAR grid
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} MAR grid data structure
 */
async function getMarGrid(residentId, date, tenantId) {
  // Validate resident
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error("Resident not found or does not belong to tenant");
  }

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

  // Get all active medications for resident that are valid for the requested date
  // A medication is valid if:
  // - startDate <= requestedDate
  // - endDate >= requestedDate OR endDate IS NULL
  const medications = await prisma.medication.findMany({
    where: {
      residentId,
      tenantId,
      isActive: true,
      deletedAt: null,
      startDate: {
        lte: targetDate, // Medication must have started by or on this date
      },
      OR: [
        {
          endDate: {
            gte: targetDate, // Medication ends on or after this date
          },
        },
        {
          endDate: null, // Medication has no end date (ongoing)
        },
      ],
    },
    select: {
      id: true,
      name: true,
      dosage: true,
      route: true,
      requiresVitals: true,
      vitalsType: true,
      specialInstructions: true,
      timeSlots: true, // Include timeSlots to check if schedules need to be generated
      isPrn: true, // Include isPrn to filter out PRN medications
    },
    orderBy: {
      name: "asc",
    },
  });

  // Get all schedules for the date
  let schedules = await getSchedulesForDate(residentId, targetDate, tenantId);

  // If no schedules found, check if we need to generate them
  // This can happen if medications were created but schedules weren't generated,
  // or if the requested date is outside the originally generated range
  if (schedules.length === 0) {
    // Check if any medications have timeSlots but no schedules
    // If a medication has timeSlots defined, it should have schedules (even if marked as PRN)
    const medicationsNeedingSchedules = medications.filter(
      (med) =>
        med.timeSlots &&
        Array.isArray(med.timeSlots) &&
        med.timeSlots.length > 0
    );

    console.log(
      `[MAR-GRID] Debug: Total medications: ${medications.length}, Medications needing schedules: ${medicationsNeedingSchedules.length}`
    );
    console.log(
      `[MAR-GRID] Debug: Medications breakdown:`,
      medications.map((m) => ({
        id: m.id,
        name: m.name,
        isPrn: m.isPrn,
        hasTimeSlots:
          !!m.timeSlots && Array.isArray(m.timeSlots) && m.timeSlots.length > 0,
        timeSlots: m.timeSlots,
      }))
    );

    if (medicationsNeedingSchedules.length > 0) {
      console.log(
        `[MAR-GRID] No schedules found for date ${targetDate.toISOString()}. Auto-generating for ${
          medicationsNeedingSchedules.length
        } medication(s)...`
      );

      // Generate schedules for medications that need them
      for (const medication of medicationsNeedingSchedules) {
        try {
          // Generate schedules for a range around the requested date (30 days before and after)
          const generateStartDate = new Date(targetDate);
          generateStartDate.setUTCDate(generateStartDate.getUTCDate() - 30);
          const generateEndDate = new Date(targetDate);
          generateEndDate.setUTCDate(generateEndDate.getUTCDate() + 30);

          console.log(
            `[MAR-GRID] Generating schedules for medication ${medication.id} (${medication.name}) with timeSlots:`,
            medication.timeSlots,
            `from ${generateStartDate.toISOString()} to ${generateEndDate.toISOString()}`
          );

          const count = await generateSchedulesForMedication(
            medication.id,
            generateStartDate,
            generateEndDate
          );

          console.log(
            `[MAR-GRID] Generated ${count} schedules for medication ${medication.id}`
          );
        } catch (error) {
          console.error(
            `[MAR-GRID] Failed to auto-generate schedules for medication ${medication.id}:`,
            error.message,
            error.stack
          );
          // Continue with other medications
        }
      }

      // Fetch schedules again after generation
      schedules = await getSchedulesForDate(residentId, targetDate, tenantId);
      console.log(
        `[MAR-GRID] After auto-generation, found ${
          schedules.length
        } schedules for date ${targetDate.toISOString()}`
      );
    } else {
      console.log(
        `[MAR-GRID] No medications with timeSlots found. Medications:`,
        medications.map((m) => ({
          id: m.id,
          name: m.name,
          isPrn: m.isPrn,
          hasTimeSlots:
            !!m.timeSlots &&
            Array.isArray(m.timeSlots) &&
            m.timeSlots.length > 0,
          timeSlots: m.timeSlots,
        }))
      );
    }
  }

  // Get all MAR records for the date (and also include records linked to schedules for this date)
  // This ensures we get records even if they were created on a different date but linked to today's schedule
  const marRecords = await prisma.marRecord.findMany({
    where: {
      residentId,
      tenantId,
      OR: [
        {
          // Records administered on this date
          administeredAt: {
            gte: targetDate,
            lt: nextDate,
          },
        },
        {
          // OR records linked to schedules for this date (even if administered on different date)
          schedule: {
            scheduledDate: {
              gte: targetDate,
              lt: nextDate,
            },
          },
        },
      ],
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
      schedule: {
        select: {
          id: true,
          scheduledTime: true,
          timeSlot: true,
        },
      },
    },
  });

  // Build grid structure: medications × time slots
  const timeSlots = new Set();
  schedules.forEach((schedule) => {
    timeSlots.add(schedule.timeSlot);
  });

  // Sort time slots properly (handle AM/PM format)
  const sortedTimeSlots = Array.from(timeSlots).sort((a, b) => {
    // Convert time slot strings to comparable format
    const parseTimeSlot = (slot) => {
      const match = slot.match(/(\d+):?(\d*)(AM|PM)/i);
      if (!match) return 0;
      let hours = Number.parseInt(match[1]);
      const minutes = match[2] ? Number.parseInt(match[2]) : 0;
      const period = match[3].toUpperCase();
      if (period === "PM" && hours !== 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };
    return parseTimeSlot(a) - parseTimeSlot(b);
  });

  const grid = medications.map((medication) => {
    const medicationSchedules = schedules.filter(
      (s) => s.medicationId === medication.id
    );

    const medicationRecords = marRecords.filter(
      (r) => r.medicationId === medication.id
    );

    const timeSlotData = sortedTimeSlots.map((timeSlot) => {
      const schedule = medicationSchedules.find((s) => s.timeSlot === timeSlot);

      // Priority 1: Use record linked via scheduleId (from schedule.marRecord relation)
      let record = null;
      if (schedule && schedule.marRecord) {
        // Find the full record in medicationRecords (with all includes)
        record = medicationRecords.find((r) => r.id === schedule.marRecord.id);
        // If not found in medicationRecords, construct from schedule.marRecord
        if (!record && schedule.marRecord) {
          record = {
            id: schedule.marRecord.id,
            administeredAt: schedule.marRecord.administeredAt,
            status: schedule.marRecord.status,
            caregiverInitials: schedule.marRecord.caregiverInitials,
            signature: schedule.marRecord.signature,
            notes: null, // Not included in schedule.marRecord
            vitals: null, // Not included in schedule.marRecord
          };
        }
      }

      // Priority 2: Match by scheduleId from record's schedule relation
      if (!record && schedule) {
        record = medicationRecords.find((r) =>
          r.schedule && r.schedule.id === schedule.id
        );
      }

      // Priority 3: Fallback - Match record to schedule by time (within 30 minutes)
      if (!record && schedule) {
        record = medicationRecords.find((r) => {
          const rTime = new Date(r.administeredAt);
          const sTime = new Date(schedule.scheduledTime);
          const diffMinutes = Math.abs((rTime - sTime) / (1000 * 60));
          return diffMinutes <= 30;
        });
      }

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

  // Format date as YYYY-MM-DD for response (extract from original input)
  // Use the original date string if available, otherwise format from targetDate
  let formattedDate;
  if (typeof date === "string") {
    formattedDate = date.split("T")[0];
  } else {
    formattedDate = targetDate.toISOString().split("T")[0];
  }

  return {
    residentId,
    residentName,
    date: formattedDate,
    timeSlots: sortedTimeSlots,
    grid,
  };
}

/**
 * Get MAR grid for date range (maximum 30 days)
 * @param {string} residentId - Resident ID
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} MAR grids for date range
 */
async function getMarGridRange(residentId, startDate, endDate, tenantId) {
  // Validate resident
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error("Resident not found or does not belong to tenant");
  }

  // Parse dates properly to avoid timezone issues
  // Use UTC dates to match database storage (PostgreSQL stores DateTime in UTC)
  let start, end;

  if (typeof startDate === "string") {
    const dateStr = startDate.split("T")[0];
    // Create UTC date: YYYY-MM-DD 00:00:00 UTC
    start = new Date(dateStr + "T00:00:00.000Z");
  } else {
    const dateStr = startDate.toISOString().split("T")[0];
    start = new Date(dateStr + "T00:00:00.000Z");
  }

  if (typeof endDate === "string") {
    const dateStr = endDate.split("T")[0];
    // Create UTC date: YYYY-MM-DD 23:59:59.999 UTC
    end = new Date(dateStr + "T23:59:59.999Z");
  } else {
    const dateStr = endDate.toISOString().split("T")[0];
    end = new Date(dateStr + "T23:59:59.999Z");
  }

  // Validate date range (maximum 30 days)
  const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (daysDiff > 30) {
    throw new Error("Date range cannot exceed 30 days");
  }

  if (end < start) {
    throw new Error("endDate must be after or equal to startDate");
  }

  // Generate grids for each date in range
  const grids = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const grid = await getMarGrid(residentId, currentDate, tenantId);
    grids.push({
      resident: {
        id: residentId,
        name: grid.residentName,
      },
      date: new Date(currentDate).toISOString().split("T")[0], // YYYY-MM-DD format
      timeSlots: grid.timeSlots,
      grid: grid.grid,
    });

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    residentId,
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
    grids,
    count: grids.length,
  };
}

/**
 * Get resident medication dashboard
 * @param {string|null|"all"} residentId - Resident ID, "all" for all residents, or null
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Dashboard data with summary, recent records, and pending PRN follow-ups
 */
async function getResidentMedicationDashboard(residentId, tenantId) {
  const isAllResidents = !residentId || residentId === "all";

  // If specific resident, validate it exists
  if (!isAllResidents) {
    const isValidResident = await validateResidentId(residentId, tenantId);
    if (!isValidResident) {
      throw new Error("Resident not found or does not belong to tenant");
    }
  }

  // Get today's date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Build where clause for resident filter
  const residentWhere = isAllResidents ? {} : { residentId };

  // Get active medications count
  const activeMedications = await prisma.medication.count({
    where: {
      ...residentWhere,
      tenantId,
      isActive: true,
      deletedAt: null,
    },
  });

  // Get scheduled doses for today
  const scheduledToday = await prisma.medicationSchedule.count({
    where: {
      ...residentWhere,
      tenantId,
      scheduledDate: {
        gte: today,
        lt: tomorrow,
      },
    },
  });

  // Get missed doses for today
  const missedDoses = await prisma.marRecord.count({
    where: {
      ...residentWhere,
      tenantId,
      administeredAt: {
        gte: today,
        lt: tomorrow,
      },
      status: "Missed",
    },
  });

  // Get late doses for today
  const lateDoses = await prisma.marRecord.count({
    where: {
      ...residentWhere,
      tenantId,
      administeredAt: {
        gte: today,
        lt: tomorrow,
      },
      status: "Late",
    },
  });

  // Get pending PRN follow-ups
  // For "all", getPendingPrnFollowups accepts null residentId
  const pendingPrnFollowups = await getPendingPrnFollowups(
    isAllResidents ? null : residentId,
    tenantId
  );

  // Get recent MAR records (last 10)
  const recentRecords = await prisma.marRecord.findMany({
    where: {
      ...residentWhere,
      tenantId,
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
    },
    orderBy: {
      administeredAt: "desc",
    },
    take: 10,
  });

  // Populate resident names for recent records
  const recentRecordsWithNames = await Promise.all(
    recentRecords.map(async (record) => {
      const residentName = await getResidentName(record.residentId, tenantId);
      return {
        id: record.id,
        residentId: record.residentId,
        residentName,
        medication: record.medication,
        administeredAt: record.administeredAt,
        status: record.status,
        caregiverInitials: record.caregiverInitials,
        caregiver: record.caregiver,
        notes: record.notes,
      };
    })
  );

  // Populate resident names for PRN follow-ups
  const pendingPrnFollowupsWithNames = await Promise.all(
    pendingPrnFollowups.map(async (record) => {
      const residentName = await getResidentName(record.residentId, tenantId);
      return {
        id: record.id,
        residentId: record.residentId,
        residentName,
        medication: record.medication,
        symptom: record.symptom,
        givenAt: record.givenAt,
        caregiver: record.caregiver,
        minutesSinceGiven: record.minutesSinceGiven,
        hoursSinceGiven: record.hoursSinceGiven,
        isOverdue: record.isOverdue,
      };
    })
  );

  return {
    resident: isAllResidents
      ? {
          id: "all",
          name: "All Residents",
        }
      : {
          id: residentId,
          name: await getResidentName(residentId, tenantId),
        },
    summary: {
      activeMedications,
      scheduledToday,
      prnDosesPending: pendingPrnFollowups.length,
      missedDoses,
      lateDoses,
    },
    recentRecords: recentRecordsWithNames,
    pendingPrnFollowups: pendingPrnFollowupsWithNames,
  };
}

module.exports = {
  getMarGrid,
  getMarGridRange,
  getResidentMedicationDashboard,
};
