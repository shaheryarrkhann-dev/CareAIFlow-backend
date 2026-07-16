const prisma = require("../../lib/prisma");
const { validateResidentId, getResidentById } = require("../resident/resident.service");
const { logPrnAction } = require("../compliance/audit.service");

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
      `[PRN] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Record PRN dose administration
 * @param {Object} data - PRN dose data
 * @param {Object} requestingUser - User recording the PRN dose
 * @returns {Promise<Object>} Created PRN record
 */
async function recordPrnDose(data, requestingUser) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when recording PRN dose as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to record PRN doses");
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

  // Get medication and validate it's PRN
  const medication = await prisma.medication.findFirst({
    where: {
      id: data.medicationId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!medication) {
    throw new Error("Medication not found or access denied");
  }

  if (!medication.isPrn) {
    throw new Error("Medication is not a PRN medication");
  }

  if (!medication.isActive) {
    throw new Error("Cannot record PRN dose for inactive medication");
  }

  // Validate required PRN workflow fields
  // whyGiven is required (can come from whyGiven or symptom field for backward compatibility)
  const whyGiven = data.whyGiven?.trim() || data.symptom?.trim();
  if (!whyGiven || whyGiven.length === 0) {
    throw new Error(
      "Why the PRN was given is required. Please provide 'whyGiven' or 'symptom' field."
    );
  }

  // symptomsNoted is required
  if (!data.symptomsNoted || data.symptomsNoted.trim().length === 0) {
    throw new Error(
      "Symptoms noted are required when administering PRN medication. Please provide 'symptomsNoted' field."
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
        recordedAt: vitalsData.recordedAt || data.givenAt,
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
      throw new Error(
        `Vitals are required for PRN medication ${medication.name}. ` +
          `Please provide either vitalsId or vitals data (temperature, pulse, bloodPressure, etc.)`
      );
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

  // Generate caregiver initials
  const caregiverInitials = caregiver.name
    ? caregiver.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2)
    : null;

  // Create PRN record
  const prnRecord = await prisma.prnRecord.create({
    data: {
      medicationId: medication.id,
      residentId: data.residentId.trim(),
      tenantId,
      whyGiven: whyGiven,
      symptomsNoted: data.symptomsNoted.trim(),
      symptom: whyGiven, // Keep symptom field for backward compatibility
      givenAt: new Date(data.givenAt),
      caregiverId: requestingUser.id,
      caregiverName: caregiver.name,
      caregiverInitials,
      signature: data.signature || null,
      notes: data.notes?.trim() || null,
      vitalsId: data.vitalsId || null,
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
    },
  });

  // Log audit event
  logPrnAction({
    action: "PRN_RECORD_CREATED",
    userId: requestingUser.id,
    tenantId,
    resourceId: prnRecord.id,
    req: null,
    metadata: {
      residentId: prnRecord.residentId,
      medicationId: medication.id,
      medicationName: medication.name,
      whyGiven: whyGiven,
      symptomsNoted: data.symptomsNoted,
    },
  });

  // Note: Follow-up reminder scheduling can be implemented later as a background job
  // For now, the response can be recorded manually via recordPrnResponse()

  return prnRecord;
}

/**
 * Record PRN response (follow-up after 30-60 minutes)
 * @param {string} prnRecordId - PRN record ID
 * @param {Object} responseData - Response data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated PRN record
 */
async function recordPrnResponse(prnRecordId, responseData, requestingUser) {
  // Get existing PRN record
  const existingRecord = await getPrnRecordById(prnRecordId, requestingUser);

  // Validate it's been at least 30 minutes since givenAt
  const now = new Date();
  const givenAt = new Date(existingRecord.givenAt);
  const minutesSinceGiven = (now - givenAt) / (1000 * 60);

  if (minutesSinceGiven < 30) {
    throw new Error(
      `Response can only be recorded at least 30 minutes after PRN was given. ${Math.round(
        minutesSinceGiven
      )} minutes have passed.`
    );
  }

  // Update PRN record with response/effectiveness
  const prnRecord = await prisma.prnRecord.update({
    where: { id: prnRecordId },
    data: {
      ...(responseData.response !== undefined && {
        response: responseData.response?.trim() || null,
      }),
      ...(responseData.effectiveness !== undefined && {
        effectiveness: responseData.effectiveness?.trim() || null,
      }),
      responseRecordedAt: now,
      ...(responseData.physicianNotified !== undefined && {
        physicianNotified: responseData.physicianNotified,
      }),
      ...(responseData.physicianNotified && {
        physicianNotifiedAt: responseData.physicianNotified ? now : null,
      }),
      ...(responseData.physicianNotes !== undefined && {
        physicianNotes: responseData.physicianNotes?.trim() || null,
      }),
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
    },
  });

  // Log audit event
  logPrnAction({
    action: "PRN_RECORD_UPDATED",
    userId: requestingUser.id,
    tenantId: prnRecord.tenantId,
    resourceId: prnRecord.id,
    req: null,
    metadata: {
      residentId: prnRecord.residentId,
      medicationId: prnRecord.medicationId,
      responseRecorded: true,
    },
  });

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    prnRecord.residentId,
    prnRecord.tenantId
  );
  prnRecord.residentName = residentName;

  return prnRecord;
}

/**
 * Notify physician about PRN dose
 * @param {string} prnRecordId - PRN record ID
 * @param {string} notes - Physician notes
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated PRN record
 */
async function notifyPhysician(prnRecordId, notes, requestingUser) {
  // Get existing PRN record
  const existingRecord = await getPrnRecordById(prnRecordId, requestingUser);

  // Update physician notification
  const prnRecord = await prisma.prnRecord.update({
    where: { id: prnRecordId },
    data: {
      physicianNotified: true,
      physicianNotifiedAt: new Date(),
      physicianNotes: notes?.trim() || null,
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
    },
  });

  // Log audit event
  logPrnAction({
    action: "PRN_RECORD_COMPLETED",
    userId: requestingUser.id,
    tenantId: prnRecord.tenantId,
    resourceId: prnRecord.id,
    req: null,
    metadata: {
      residentId: prnRecord.residentId,
      medicationId: prnRecord.medicationId,
      physicianNotified: true,
    },
  });

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    prnRecord.residentId,
    prnRecord.tenantId
  );
  prnRecord.residentName = residentName;

  return prnRecord;
}

/**
 * Get PRN records with filtering
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} PRN records with pagination
 */
async function getPrnRecords(user, filters = {}) {
  const {
    page = 1,
    limit = 10,
    residentId,
    medicationId,
    dateFrom,
    dateTo,
    hasResponse, // Filter by completion status
    physicianNotified,
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

  // Build where clause
  const where = {
    ...tenantWhere,
    ...(residentId && { residentId }),
    ...(medicationId && { medicationId }),
    ...(Object.keys(dateFilter).length > 0 && { givenAt: dateFilter }),
    ...(hasResponse !== undefined && {
      response:
        hasResponse === "true" || hasResponse === true ? { not: null } : null,
    }),
    ...(physicianNotified !== undefined && {
      physicianNotified:
        physicianNotified === "true" || physicianNotified === true,
    }),
  };

  // Note: STAFF can see all PRN records within their tenant (no restriction to own records)

  // Execute query with pagination
  const [records, total] = await Promise.all([
    prisma.prnRecord.findMany({
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
      },
      orderBy: {
        givenAt: "desc",
      },
    }),
    prisma.prnRecord.count({ where }),
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
 * Get PRN record by ID
 * @param {string} prnRecordId - PRN record ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} PRN record with all relations
 */
async function getPrnRecordById(prnRecordId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: prnRecordId,
    ...tenantWhere,
  };

  // Note: STAFF can see all PRN records within their tenant (no restriction to own records)

  const record = await prisma.prnRecord.findFirst({
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
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!record) {
    throw new Error("PRN record not found or access denied");
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
 * Get pending PRN follow-ups (records given in last 2 hours without response)
 * @param {string} residentId - Resident ID (optional, if not provided returns for all residents in tenant)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of pending PRN records
 */
async function getPendingPrnFollowups(residentId, tenantId) {
  // Calculate 2 hours ago
  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

  // Build where clause
  const where = {
    tenantId,
    givenAt: {
      gte: twoHoursAgo,
    },
    response: null, // No response recorded yet
  };

  if (residentId) {
    where.residentId = residentId;
  }

  const records = await prisma.prnRecord.findMany({
    where,
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
      givenAt: "desc",
    },
  });

  // Calculate time since given for each record and populate residentName
  const now = new Date();
  const recordsWithTimeSince = await Promise.all(
    records.map(async (record) => {
      const givenAt = new Date(record.givenAt);
      const minutesSinceGiven = Math.round((now - givenAt) / (1000 * 60));
      const hoursSinceGiven = Math.round((minutesSinceGiven / 60) * 10) / 10;

      // Populate residentName dynamically (don't save to DB)
      const residentName = await getResidentName(record.residentId, tenantId);

      return {
        ...record,
        residentName,
        minutesSinceGiven,
        hoursSinceGiven,
        isOverdue: minutesSinceGiven > 60, // Overdue if more than 60 minutes
      };
    })
  );

  return recordsWithTimeSince;
}

module.exports = {
  recordPrnDose,
  recordPrnResponse,
  notifyPhysician,
  getPrnRecords,
  getPrnRecordById,
  getPendingPrnFollowups,
};
