const prisma = require("../../lib/prisma");
const { validateResidentId, getResidentById } = require("../resident/resident.service");
const { logVitalsAction } = require("../compliance/audit.service");

/**
 * Get medication data by ID
 * @param {string} medicationId - Medication ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object|null>} Medication object or null
 */
async function getMedicationData(medicationId, tenantId) {
  if (!medicationId) return null;

  try {
    const medication = await prisma.medication.findFirst({
      where: {
        id: medicationId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        dosage: true,
        route: true,
      },
    });
    return medication;
  } catch (error) {
    console.warn(
      `[Vitals] Could not fetch medication data for ${medicationId}:`,
      error.message
    );
    return null;
  }
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
      `[VITALS] Could not fetch resident name for ${residentId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Validate vitals data ranges
 * @param {Object} vitals - Vitals data
 * @returns {Object} Validation result
 */
function validateVitalsRanges(vitals) {
  const errors = [];

  // Validate blood pressure
  if (
    vitals.bloodPressureSystolic !== undefined &&
    vitals.bloodPressureSystolic !== null
  ) {
    if (
      vitals.bloodPressureSystolic < 50 ||
      vitals.bloodPressureSystolic > 250
    ) {
      errors.push("Systolic blood pressure must be between 50 and 250");
    }
  }

  if (
    vitals.bloodPressureDiastolic !== undefined &&
    vitals.bloodPressureDiastolic !== null
  ) {
    if (
      vitals.bloodPressureDiastolic < 30 ||
      vitals.bloodPressureDiastolic > 150
    ) {
      errors.push("Diastolic blood pressure must be between 30 and 150");
    }
  }

  // Validate systolic > diastolic
  if (
    vitals.bloodPressureSystolic &&
    vitals.bloodPressureDiastolic &&
    vitals.bloodPressureSystolic <= vitals.bloodPressureDiastolic
  ) {
    errors.push("Systolic blood pressure must be greater than diastolic");
  }

  // Validate pulse
  if (vitals.pulse !== undefined && vitals.pulse !== null) {
    if (vitals.pulse < 30 || vitals.pulse > 200) {
      errors.push("Pulse must be between 30 and 200");
    }
  }

  // Validate temperature
  if (vitals.temperature !== undefined && vitals.temperature !== null) {
    const tempUnit = vitals.temperatureUnit || "F";
    const temp = Number.parseFloat(vitals.temperature);

    if (tempUnit === "F") {
      if (temp < 90 || temp > 110) {
        errors.push("Temperature (Fahrenheit) must be between 90 and 110");
      }
    } else if (tempUnit === "C") {
      if (temp < 32 || temp > 43) {
        errors.push("Temperature (Celsius) must be between 32 and 43");
      }
    }
  }

  // Validate oxygen saturation
  if (
    vitals.oxygenSaturation !== undefined &&
    vitals.oxygenSaturation !== null
  ) {
    if (vitals.oxygenSaturation < 70 || vitals.oxygenSaturation > 100) {
      errors.push("Oxygen saturation must be between 70 and 100");
    }
  }

  // Validate weight
  if (vitals.weight !== undefined && vitals.weight !== null) {
    if (vitals.weight <= 0) {
      errors.push("Weight must be positive");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Convert temperature between Fahrenheit and Celsius
 * @param {number} temperature - Temperature value
 * @param {string} fromUnit - Source unit ("F" or "C")
 * @param {string} toUnit - Target unit ("F" or "C")
 * @returns {number} Converted temperature
 */
function convertTemperature(temperature, fromUnit, toUnit) {
  if (fromUnit === toUnit) {
    return temperature;
  }

  if (fromUnit === "F" && toUnit === "C") {
    return ((temperature - 32) * 5) / 9;
  } else if (fromUnit === "C" && toUnit === "F") {
    return (temperature * 9) / 5 + 32;
  }

  return temperature;
}

/**
 * Record vitals
 * @param {Object} data - Vitals data
 * @param {Object} requestingUser - User recording vitals
 * @returns {Promise<Object>} Created vitals record
 */
async function recordVitals(data, requestingUser) {
  // Determine tenantId
  let tenantId = null;

  if (requestingUser.role === "SUPER_ADMIN") {
    tenantId = data.tenantId || requestingUser.tenantId;
    if (!tenantId) {
      throw new Error(
        "tenantId is required when recording vitals as SUPER_ADMIN"
      );
    }
  } else {
    tenantId = requestingUser.tenantId;
    if (!tenantId) {
      throw new Error("You must belong to a tenant to record vitals");
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

  // Validate at least one vital sign is provided
  const hasVital =
    data.bloodPressureSystolic !== undefined ||
    data.bloodPressureDiastolic !== undefined ||
    data.pulse !== undefined ||
    data.temperature !== undefined ||
    data.oxygenSaturation !== undefined ||
    data.weight !== undefined;

  if (!hasVital) {
    throw new Error(
      "At least one vital sign must be provided (bloodPressure, pulse, temperature, oxygenSaturation, or weight)"
    );
  }

  // Validate vitals ranges
  const validation = validateVitalsRanges(data);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(", "));
  }

  // Get recorder user details
  const recorder = await prisma.user.findUnique({
    where: { id: requestingUser.id },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  // Validate medication if provided
  if (data.medicationId) {
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
  }

  // Create vitals record
  const vitalsRecord = await prisma.vitalSign.create({
    data: {
      residentId: data.residentId.trim(),
      tenantId,
      bloodPressureSystolic: data.bloodPressureSystolic || null,
      bloodPressureDiastolic: data.bloodPressureDiastolic || null,
      pulse: data.pulse || null,
      temperature: data.temperature
        ? Number.parseFloat(data.temperature)
        : null,
      temperatureUnit: data.temperatureUnit || "F",
      oxygenSaturation: data.oxygenSaturation || null,
      weight: data.weight ? Number.parseFloat(data.weight) : null,
      weightUnit: data.weightUnit || "lbs",
      recordedAt: new Date(data.recordedAt),
      recordedBy: requestingUser.id,
      recordedByName: recorder.name,
      medicationId: data.medicationId || null,
      notes: data.notes?.trim() || null,
    },
    include: {
      recorder: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      marRecord: {
        select: {
          id: true,
          administeredAt: true,
          status: true,
        },
      },
      prnRecord: {
        select: {
          id: true,
          givenAt: true,
          symptom: true,
        },
      },
    },
  });

  // Log audit event
  logVitalsAction({
    action: "VITALS_RECORDED",
    userId: requestingUser.id,
    tenantId,
    resourceId: vitalsRecord.id,
    req: null,
    metadata: {
      residentId: vitalsRecord.residentId,
      medicationId: vitalsRecord.medicationId,
    },
  });

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    vitalsRecord.residentId,
    vitalsRecord.tenantId
  );
  vitalsRecord.residentName = residentName;

  // Fetch and include medication data if medicationId exists
  if (vitalsRecord.medicationId) {
    const medication = await getMedicationData(
      vitalsRecord.medicationId,
      vitalsRecord.tenantId
    );
    vitalsRecord.medication = medication;
  }

  return vitalsRecord;
}

/**
 * Get vitals records with filtering
 * @param {Object} user - Current user
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Vitals records with pagination
 */
async function getVitals(user, filters = {}) {
  const {
    page = 1,
    limit = 10,
    residentId,
    medicationId,
    dateFrom,
    dateTo,
    tenantId, // From query param (SUPER_ADMIN only)
    forRecordCreation, // Exclude vitals already linked to MAR or PRN records (for use in MAR/PRN creation)
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

  // Normalize boolean query parameter (query params come as strings)
  const isForRecordCreation =
    forRecordCreation === true ||
    forRecordCreation === "true" ||
    forRecordCreation === "1";

  // Build where clause
  const where = {
    ...tenantWhere,
    ...(residentId && { residentId }),
    ...(medicationId && { medicationId }),
    ...(Object.keys(dateFilter).length > 0 && { recordedAt: dateFilter }),
    // Exclude vitals already linked to MAR or PRN records if forRecordCreation is true
    // (vitals can only be linked to one record type, so check both)
    ...(isForRecordCreation ? { marRecord: null, prnRecord: null } : {}),
  };

  // Note: STAFF can see all vitals records within their tenant (no restriction to own records)

  // Execute query with pagination
  const [records, total] = await Promise.all([
    prisma.vitalSign.findMany({
      where,
      skip,
      take: limit,
      include: {
        recorder: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        marRecord: {
          select: {
            id: true,
            administeredAt: true,
            status: true,
          },
        },
        prnRecord: {
          select: {
            id: true,
            givenAt: true,
            symptom: true,
          },
        },
      },
      orderBy: {
        recordedAt: "desc",
      },
    }),
    prisma.vitalSign.count({ where }),
  ]);

  // Populate residentName and medication data dynamically (don't save to DB)
  const recordsWithNames = await Promise.all(
    records.map(async (record) => {
      const residentName = await getResidentName(
        record.residentId,
        record.tenantId
      );
      record.residentName = residentName;

      // Fetch and include medication data if medicationId exists
      if (record.medicationId) {
        const medication = await getMedicationData(
          record.medicationId,
          record.tenantId
        );
        record.medication = medication;
      }

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
 * Get vitals record by ID
 * @param {string} vitalsId - Vitals record ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Vitals record with all relations
 */
async function getVitalsById(vitalsId, requestingUser) {
  // Build tenant filter
  let tenantWhere = {};
  if (requestingUser.role === "SUPER_ADMIN") {
    // No tenant filter for SUPER_ADMIN
  } else {
    tenantWhere = { tenantId: requestingUser.tenantId };
  }

  // Build where clause
  const where = {
    id: vitalsId,
    ...tenantWhere,
  };

  // Note: STAFF can see all vitals records within their tenant (no restriction to own records)

  const record = await prisma.vitalSign.findFirst({
    where,
    include: {
      recorder: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      marRecord: {
        include: {
          medication: {
            select: {
              id: true,
              name: true,
            },
          },
          caregiver: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      prnRecord: {
        include: {
          medication: {
            select: {
              id: true,
              name: true,
            },
          },
          caregiver: {
            select: {
              id: true,
              name: true,
            },
          },
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
    throw new Error("Vitals record not found or access denied");
  }

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    record.residentId,
    record.tenantId
  );
  record.residentName = residentName;

  // Fetch and include medication data if medicationId exists
  if (record.medicationId) {
    const medication = await getMedicationData(
      record.medicationId,
      record.tenantId
    );
    record.medication = medication;
  }

  return record;
}

/**
 * Update vitals record
 * @param {string} vitalsId - Vitals record ID
 * @param {Object} data - Update data
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Updated vitals record
 */
async function updateVitals(vitalsId, data, requestingUser) {
  // Get existing record
  const existingRecord = await getVitalsById(vitalsId, requestingUser);

  // Check permissions (within 24h or ADMIN)
  const now = new Date();
  const recordedAt = new Date(existingRecord.recordedAt);
  const hoursSinceRecorded = (now - recordedAt) / (1000 * 60 * 60);

  // STAFF can only edit within 24 hours
  if (
    requestingUser.role === "STAFF" &&
    hoursSinceRecorded > 24 &&
    requestingUser.role !== "ADMIN" &&
    requestingUser.role !== "SUPER_ADMIN"
  ) {
    throw new Error(
      "Vitals record cannot be edited after 24 hours. Please contact an administrator."
    );
  }

  // Validate vitals ranges if provided
  if (
    data.bloodPressureSystolic !== undefined ||
    data.bloodPressureDiastolic !== undefined ||
    data.pulse !== undefined ||
    data.temperature !== undefined ||
    data.oxygenSaturation !== undefined ||
    data.weight !== undefined
  ) {
    const validation = validateVitalsRanges({
      ...existingRecord,
      ...data,
    });
    if (!validation.isValid) {
      throw new Error(validation.errors.join(", "));
    }
  }

  // Build update data
  const updateData = {
    ...(data.bloodPressureSystolic !== undefined && {
      bloodPressureSystolic: data.bloodPressureSystolic || null,
    }),
    ...(data.bloodPressureDiastolic !== undefined && {
      bloodPressureDiastolic: data.bloodPressureDiastolic || null,
    }),
    ...(data.pulse !== undefined && { pulse: data.pulse || null }),
    ...(data.temperature !== undefined && {
      temperature: data.temperature
        ? Number.parseFloat(data.temperature)
        : null,
    }),
    ...(data.temperatureUnit !== undefined && {
      temperatureUnit: data.temperatureUnit || "F",
    }),
    ...(data.oxygenSaturation !== undefined && {
      oxygenSaturation: data.oxygenSaturation || null,
    }),
    ...(data.weight !== undefined && {
      weight: data.weight ? Number.parseFloat(data.weight) : null,
    }),
    ...(data.weightUnit !== undefined && {
      weightUnit: data.weightUnit || "lbs",
    }),
    ...(data.recordedAt !== undefined && {
      recordedAt: new Date(data.recordedAt),
    }),
    ...(data.medicationId !== undefined && {
      medicationId: data.medicationId || null,
    }),
    ...(data.notes !== undefined && { notes: data.notes?.trim() || null }),
    // Don't update residentName - always fetch dynamically
  };

  // Update vitals record
  const vitals = await prisma.vitalSign.update({
    where: { id: vitalsId },
    data: updateData,
    include: {
      recorder: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      marRecord: {
        select: {
          id: true,
          administeredAt: true,
          status: true,
        },
      },
      prnRecord: {
        select: {
          id: true,
          givenAt: true,
          symptom: true,
        },
      },
    },
  });

  // Log audit event
  logVitalsAction({
    action: "VITALS_UPDATED",
    userId: requestingUser.id,
    tenantId: vitals.tenantId,
    resourceId: vitals.id,
    req: null,
    metadata: {
      residentId: vitals.residentId,
      medicationId: vitals.medicationId,
    },
  });

  // Populate residentName dynamically (don't save to DB)
  const residentName = await getResidentName(
    vitals.residentId,
    vitals.tenantId
  );
  vitals.residentName = residentName;

  // Fetch and include medication data if medicationId exists
  if (vitals.medicationId) {
    const medication = await getMedicationData(
      vitals.medicationId,
      vitals.tenantId
    );
    vitals.medication = medication;
  }

  return vitals;
}

/**
 * Get vitals trends for a resident within a date range
 * @param {string} residentId - Resident ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Vitals trends data
 */
async function getVitalsTrends(residentId, startDate, endDate, tenantId) {
  // Validate resident
  const isValidResident = await validateResidentId(residentId, tenantId);
  if (!isValidResident) {
    throw new Error("Resident not found or does not belong to tenant");
  }

  // Get all vitals for date range
  const vitals = await prisma.vitalSign.findMany({
    where: {
      residentId,
      tenantId,
      recordedAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
    orderBy: {
      recordedAt: "asc",
    },
  });

  if (vitals.length === 0) {
    return {
      residentId,
      startDate,
      endDate,
      count: 0,
      trends: {},
      data: [],
    };
  }

  // Calculate trends
  const trends = {
    bloodPressure: {
      systolic: {
        values: vitals
          .filter((v) => v.bloodPressureSystolic !== null)
          .map((v) => v.bloodPressureSystolic),
        average: null,
        min: null,
        max: null,
      },
      diastolic: {
        values: vitals
          .filter((v) => v.bloodPressureDiastolic !== null)
          .map((v) => v.bloodPressureDiastolic),
        average: null,
        min: null,
        max: null,
      },
    },
    pulse: {
      values: vitals.filter((v) => v.pulse !== null).map((v) => v.pulse),
      average: null,
      min: null,
      max: null,
    },
    temperature: {
      values: vitals
        .filter((v) => v.temperature !== null)
        .map((v) => {
          // Convert to Fahrenheit for consistency
          if (v.temperatureUnit === "C") {
            return convertTemperature(v.temperature, "C", "F");
          }
          return v.temperature;
        }),
      average: null,
      min: null,
      max: null,
    },
    oxygenSaturation: {
      values: vitals
        .filter((v) => v.oxygenSaturation !== null)
        .map((v) => v.oxygenSaturation),
      average: null,
      min: null,
      max: null,
    },
    weight: {
      values: vitals
        .filter((v) => v.weight !== null)
        .map((v) => {
          // Convert to lbs for consistency
          if (v.weightUnit === "kg") {
            return v.weight * 2.20462; // Convert kg to lbs
          }
          return v.weight;
        }),
      average: null,
      min: null,
      max: null,
    },
  };

  // Calculate averages, min, max
  Object.keys(trends).forEach((key) => {
    if (key === "bloodPressure") {
      // Systolic
      if (trends.bloodPressure.systolic.values.length > 0) {
        const values = trends.bloodPressure.systolic.values;
        trends.bloodPressure.systolic.average =
          values.reduce((a, b) => a + b, 0) / values.length;
        trends.bloodPressure.systolic.min = Math.min(...values);
        trends.bloodPressure.systolic.max = Math.max(...values);
      }

      // Diastolic
      if (trends.bloodPressure.diastolic.values.length > 0) {
        const values = trends.bloodPressure.diastolic.values;
        trends.bloodPressure.diastolic.average =
          values.reduce((a, b) => a + b, 0) / values.length;
        trends.bloodPressure.diastolic.min = Math.min(...values);
        trends.bloodPressure.diastolic.max = Math.max(...values);
      }
    } else {
      if (trends[key].values.length > 0) {
        const values = trends[key].values;
        trends[key].average = values.reduce((a, b) => a + b, 0) / values.length;
        trends[key].min = Math.min(...values);
        trends[key].max = Math.max(...values);
      }
    }
  });

  // Get resident name dynamically
  const residentName = await getResidentName(residentId, tenantId);

  return {
    residentId,
    residentName,
    startDate,
    endDate,
    count: vitals.length,
    trends,
    data: vitals.map((v) => ({
      id: v.id,
      recordedAt: v.recordedAt,
      bloodPressureSystolic: v.bloodPressureSystolic,
      bloodPressureDiastolic: v.bloodPressureDiastolic,
      pulse: v.pulse,
      temperature: v.temperature,
      temperatureUnit: v.temperatureUnit,
      oxygenSaturation: v.oxygenSaturation,
      weight: v.weight,
      weightUnit: v.weightUnit,
    })),
  };
}

/**
 * Delete vitals record
 * @param {string} vitalsId - Vitals record ID
 * @param {Object} requestingUser - Current user
 * @returns {Promise<Object>} Deleted vitals record
 */
async function deleteVitals(vitalsId, requestingUser) {
  // Get existing record
  const existingRecord = await getVitalsById(vitalsId, requestingUser);

  // Check if vitals record is linked to a MAR or PRN record
  if (existingRecord.marRecord) {
    throw new Error(
      "Cannot delete vitals record that is linked to a MAR record. Please delete the MAR record first."
    );
  }

  if (existingRecord.prnRecord) {
    throw new Error(
      "Cannot delete vitals record that is linked to a PRN record. Please delete the PRN record first."
    );
  }

  // Check permissions (only ADMIN/SUPER_ADMIN, or within 24h for STAFF)
  const now = new Date();
  const recordedAt = new Date(existingRecord.recordedAt);
  const hoursSinceRecorded = (now - recordedAt) / (1000 * 60 * 60);

  if (requestingUser.role === "STAFF") {
    // STAFF can only delete within 24 hours, but can delete any record within their tenant
    if (hoursSinceRecorded > 24) {
      throw new Error(
        "Vitals record cannot be deleted after 24 hours. Please contact an administrator."
      );
    }
    // Note: STAFF can delete any vitals record within their tenant (not restricted to own records)
  }

  // Delete vitals record (hard delete for compliance - audit trail preserved)
  await prisma.vitalSign.delete({
    where: { id: vitalsId },
  });

  // Log audit event
  logVitalsAction({
    action: "VITALS_DELETED",
    userId: requestingUser.id,
    tenantId: existingRecord.tenantId,
    resourceId: vitalsId,
    req: null,
    metadata: {
      residentId: existingRecord.residentId,
      medicationId: existingRecord.medicationId,
    },
  });

  return existingRecord;
}

module.exports = {
  recordVitals,
  getVitals,
  getVitalsById,
  updateVitals,
  deleteVitals,
  getVitalsTrends,
  validateVitalsRanges,
  convertTemperature,
};
