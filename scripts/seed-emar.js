const { PrismaClient } = require("@prisma/client");
const {
  parseFrequency,
  calculateTimesPerDay,
  generateTimeSlots,
} = require("../src/utils/medication.utils");
const { getResidents } = require("../src/services/resident/resident.service");

const prisma = new PrismaClient();

/**
 * EMAR Seed Script
 *
 * Usage:
 * node scripts/seed-emar.js <tenantId> [residentIds...] [--userIds userId1 userId2 ...]
 *
 * Examples:
 * node scripts/seed-emar.js <tenantId>
 * node scripts/seed-emar.js <tenantId> residentId1 residentId2
 * node scripts/seed-emar.js <tenantId> --userIds userId1 userId2
 */

// Sample medications data
const SAMPLE_MEDICATIONS = [
  {
    name: "Metformin",
    dosage: "500mg",
    route: "Oral",
    frequency: "Twice daily", // Will parse to 8AM, 8PM
    requiresVitals: true,
    vitalsType: "BloodPressure",
    prescriberName: "Dr. Smith",
    prescriberPhone: "555-0101",
    pharmacyName: "CVS Pharmacy",
    pharmacyPhone: "555-0202",
  },
  {
    name: "Lisinopril",
    dosage: "10mg",
    route: "Oral",
    frequency: "Once daily", // Will parse to 8AM
    requiresVitals: true,
    vitalsType: "BloodPressure",
    prescriberName: "Dr. Smith",
    pharmacyName: "CVS Pharmacy",
  },
  {
    name: "Aspirin",
    dosage: "81mg",
    route: "Oral",
    frequency: "Once daily", // Will parse to 8AM
    requiresVitals: false,
    prescriberName: "Dr. Smith",
  },
  {
    name: "Atorvastatin",
    dosage: "20mg",
    route: "Oral",
    frequency: "8PM", // Explicit time format
    requiresVitals: false,
    prescriberName: "Dr. Smith",
  },
  {
    name: "Omeprazole",
    dosage: "20mg",
    route: "Oral",
    frequency: "Once daily", // Will parse to 8AM
    requiresVitals: false,
    prescriberName: "Dr. Smith",
  },
  {
    name: "Tylenol",
    dosage: "500mg",
    route: "Oral",
    frequency: "As needed",
    isPrn: true,
    requiresVitals: false,
    prescriberName: "Dr. Smith",
  },
  {
    name: "Ibuprofen",
    dosage: "400mg",
    route: "Oral",
    frequency: "As needed",
    isPrn: true,
    requiresVitals: false,
    prescriberName: "Dr. Smith",
  },
  {
    name: "Insulin Glargine",
    dosage: "20 units",
    route: "Other", // Subcutaneous - using Other since it's not in enum
    frequency: "8AM", // Explicit time format
    requiresVitals: true,
    vitalsType: "BloodPressure",
    prescriberName: "Dr. Smith",
  },
];

// Sample PRN symptoms
const PRN_SYMPTOMS = [
  "Headache",
  "Chest pain",
  "Joint pain",
  "Fever",
  "Nausea",
  "Dizziness",
  "Anxiety",
  "Insomnia",
];

// Sample notes
const SAMPLE_NOTES = [
  "Resident took medication without issues",
  "Resident was cooperative",
  "Medication given with food",
  "Resident reported feeling better",
  "No adverse reactions observed",
  "Resident refused initially but took after explanation",
];

// Sample resident responses
const RESIDENT_RESPONSES = [
  "Feeling good",
  "No complaints",
  "Feeling better",
  "Slight improvement",
  "No change",
];

/**
 * Get all residents for a tenant from Resident model
 */
async function getResidentsForTenant(tenantId) {
  try {
    const user = { tenantId, role: "ADMIN" };
    const result = await getResidents(user, {
      limit: 1000,
      offset: 0,
    });

    return result.residents.map((resident) => ({
      id: resident.id,
      name: resident.name,
    }));
  } catch (error) {
    console.error("Error fetching residents:", error);
    return [];
  }
}

/**
 * Get staff users for a tenant (for caregivers)
 */
async function getStaffUsersForTenant(tenantId) {
  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        role: {
          in: ["STAFF", "ADMIN"],
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return users;
  } catch (error) {
    console.error("Error fetching staff users:", error);
    return [];
  }
}

/**
 * Generate caregiver initials
 */
function generateInitials(name) {
  if (!name) return null;
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Get random element from array
 */
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Get random date within last N days
 */
function getRandomDate(daysAgo = 7) {
  const now = new Date();
  const daysBack = Math.floor(Math.random() * daysAgo);
  const hours = Math.floor(Math.random() * 24);
  const minutes = Math.floor(Math.random() * 60);
  const date = new Date(now);
  date.setDate(date.getDate() - daysBack);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Get random date today
 */
function getRandomTimeToday() {
  const now = new Date();
  const hours = Math.floor(Math.random() * 24);
  const minutes = Math.floor(Math.random() * 60);
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Seed medications for a resident
 */
async function seedMedications(residentId, tenantId, userId, medications) {
  const createdMedications = [];

  for (const medData of medications) {
    const isPrn = medData.isPrn || false;

    // PRN medications should not have time slots or schedules
    let timeSlots = [];
    let timesPerDay = 0;
    if (!isPrn) {
      timeSlots = parseFrequency(medData.frequency);
      timesPerDay = calculateTimesPerDay(medData.frequency);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Started 30 days ago
    const endDate = null; // No end date for now

    const medication = await prisma.medication.create({
      data: {
        residentId,
        tenantId,
        name: medData.name,
        dosage: medData.dosage,
        route: medData.route,
        frequency: medData.frequency,
        timesPerDay: isPrn ? 0 : timesPerDay,
        timeSlots: isPrn ? null : (timeSlots.length > 0 ? timeSlots : null),
        startDate,
        endDate,
        isActive: true,
        isPrn,
        requiresVitals: medData.requiresVitals || false,
        vitalsType: medData.vitalsType || null,
        prescriberName: medData.prescriberName || null,
        prescriberPhone: medData.prescriberPhone || null,
        pharmacyName: medData.pharmacyName || null,
        pharmacyPhone: medData.pharmacyPhone || null,
        createdBy: userId,
      },
    });

    createdMedications.push(medication);
    console.log(`  ✓ Created medication: ${medication.name} for resident ${residentId}`);
  }

  return createdMedications;
}

/**
 * Generate schedules for medications
 */
async function generateSchedulesForMedications(medications, tenantId) {
  let totalSchedules = 0;

  for (const medication of medications) {
    if (medication.isPrn || !medication.timeSlots || medication.timeSlots.length === 0) {
      continue;
    }

    const startDate = new Date(medication.startDate);
    const endDate = medication.endDate || null;

    // Generate schedules for next 60 days
    const scheduleEndDate = new Date();
    scheduleEndDate.setDate(scheduleEndDate.getDate() + 60);

    const scheduledTimes = generateTimeSlots(
      medication.timeSlots,
      startDate,
      scheduleEndDate,
      medication.frequency // Pass frequency string for QOD, QOW, monthly, weekly, odd/even day filtering
    );

    const schedules = scheduledTimes.map((scheduledTime) => {
      const scheduledDate = new Date(scheduledTime);
      const dateStr = scheduledDate.toISOString().split("T")[0];
      const utcScheduledDate = new Date(dateStr + "T00:00:00.000Z");

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
        tenantId,
        scheduledDate: utcScheduledDate,
        scheduledTime,
        timeSlot: timeSlotLabel,
        status: "Pending",
        isMissed: false,
        isLate: false,
        lateThreshold: 120,
      };
    });

    if (schedules.length > 0) {
      const result = await prisma.medicationSchedule.createMany({
        data: schedules,
        skipDuplicates: true,
      });
      totalSchedules += result.count;
      console.log(`  ✓ Generated ${result.count} schedules for ${medication.name}`);
    }
  }

  return totalSchedules;
}

/**
 * Seed MAR records
 */
async function seedMarRecords(
  medications,
  schedules,
  staffUsers,
  tenantId
) {
  let totalRecords = 0;

  // Get schedules for past 7 days that are still pending
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const pastSchedules = schedules.filter(
    (s) => new Date(s.scheduledTime) >= sevenDaysAgo && new Date(s.scheduledTime) < now
  );

  console.log(`  Found ${pastSchedules.length} schedules in past 7 days`);

  // Create MAR records for some schedules (mix of Given, Late, Missed)
  const schedulesToProcess = Math.min(pastSchedules.length, 50);
  for (let i = 0; i < schedulesToProcess; i++) {
    const schedule = pastSchedules[i];
    const medication = medications.find((m) => m.id === schedule.medicationId);
    const caregiver = getRandomElement(staffUsers);

    if (!medication || !caregiver) continue;

    const scheduledTime = new Date(schedule.scheduledTime);
    const administeredAt = new Date(scheduledTime);

    // Randomly determine status - use new enum values: Given, NotGiven, Refused
    const rand = Math.random();
    let status = "Given";
    let notGivenReason = null;
    let refusedReason = null;
    let administeredOffset = 0; // minutes

    if (rand < 0.75) {
      // 75% Given (some on time, some late but still Given)
      if (Math.random() < 0.3) {
        // 30% of Given are late (but status is still "Given")
        administeredOffset = 60 + Math.floor(Math.random() * 120); // 60-180 minutes late
      } else {
        // On time or slightly early/late
        administeredOffset = Math.floor(Math.random() * 30) - 15; // -15 to +15 minutes
      }
      status = "Given";
    } else if (rand < 0.9) {
      // 15% NotGiven - requires reason
      status = "NotGiven";
      notGivenReason = getRandomElement([
        "Out of stock",
        "Held due to vitals",
        "Resident unavailable",
        "Medication not available",
      ]);
      administeredOffset = Math.floor(Math.random() * 60);
    } else {
      // 10% Refused - requires reason
      status = "Refused";
      refusedReason = getRandomElement([
        "Resident refused",
        "Resident refused - no explanation",
        "Resident declined medication",
      ]);
      administeredOffset = Math.floor(Math.random() * 60);
    }

    administeredAt.setMinutes(administeredAt.getMinutes() + administeredOffset);

    // Create vitals if required
    let vitalsId = null;
    if (medication.requiresVitals) {
      const vitalsData = {
        residentId: schedule.residentId,
        tenantId,
        medicationId: medication.id,
        recordedAt: administeredAt,
        recordedBy: caregiver.id,
        recordedByName: caregiver.name,
        temperatureUnit: "F",
        weightUnit: "lbs",
      };

      if (medication.vitalsType === "BloodPressure" || medication.vitalsType === "All") {
        vitalsData.bloodPressureSystolic = 110 + Math.floor(Math.random() * 30); // 110-140
        vitalsData.bloodPressureDiastolic = 70 + Math.floor(Math.random() * 20); // 70-90
      }
      if (medication.vitalsType === "Pulse" || medication.vitalsType === "All") {
        vitalsData.pulse = 60 + Math.floor(Math.random() * 40); // 60-100
      }
      if (medication.vitalsType === "Temperature" || medication.vitalsType === "All") {
        vitalsData.temperature = 97.5 + Math.random() * 2.5; // 97.5-100
        vitalsData.temperatureUnit = "F";
      }

      const vitals = await prisma.vitalSign.create({
        data: vitalsData,
      });
      vitalsId = vitals.id;
    }

    const caregiverInitials = generateInitials(caregiver.name);

    const marRecord = await prisma.marRecord.create({
      data: {
        medicationId: medication.id,
        scheduleId: schedule.id,
        residentId: schedule.residentId,
        tenantId,
        administeredAt,
        scheduledTime: scheduledTime,
        status,
        caregiverId: caregiver.id,
        caregiverName: caregiver.name,
        caregiverInitials,
        signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", // Dummy signature
        signatureType: "drawing",
        notes: getRandomElement(SAMPLE_NOTES),
        residentResponse: status === "Given" ? getRandomElement(RESIDENT_RESPONSES) : null,
        notGivenReason,
        refusedReason,
        vitalsId,
        createdBy: caregiver.id,
      },
    });

    // Update schedule status based on MAR record status
    const scheduleStatus = status === "Given" ? "Given" : "Missed";
    const isLate = status === "Given" && administeredOffset > 30; // Consider late if > 30 min late
    await prisma.medicationSchedule.update({
      where: { id: schedule.id },
      data: {
        status: scheduleStatus,
        isLate,
        isMissed: status !== "Given",
        marRecord: {
          connect: { id: marRecord.id },
        },
      },
    });

    totalRecords++;
  }

  console.log(`  ✓ Created ${totalRecords} MAR records from schedules`);

  // If we don't have enough MAR records from schedules, create some standalone ones
  // This ensures we have demo data even if schedules weren't fully generated
  if (totalRecords < 10) {
    console.log(`  Creating additional standalone MAR records...`);
    const scheduledMedications = medications.filter((m) => !m.isPrn);
    const numStandalone = Math.min(20, scheduledMedications.length * 3);

    for (let i = 0; i < numStandalone; i++) {
      const medication = getRandomElement(scheduledMedications);
      const caregiver = getRandomElement(staffUsers);
      if (!medication || !caregiver) continue;

      // Create a random time in the past 7 days
      const administeredAt = getRandomDate(7);
      const scheduledTime = new Date(administeredAt);
      // Set to a typical medication time (8AM, 12PM, 4PM, or 8PM)
      const times = [8, 12, 16, 20];
      scheduledTime.setHours(getRandomElement(times), 0, 0, 0);

      // Randomly determine status - use new enum values
      const rand = Math.random();
      let status = "Given";
      let notGivenReason = null;
      let refusedReason = null;

      if (rand < 0.75) {
        status = "Given";
        // Some may be late but still "Given"
        if (Math.random() < 0.3) {
          administeredAt.setMinutes(administeredAt.getMinutes() + 60 + Math.floor(Math.random() * 120));
        }
      } else if (rand < 0.9) {
        status = "NotGiven";
        notGivenReason = getRandomElement([
          "Out of stock",
          "Held due to vitals",
          "Resident unavailable",
          "Medication not available",
        ]);
      } else {
        status = "Refused";
        refusedReason = getRandomElement([
          "Resident refused",
          "Resident refused - no explanation",
          "Resident declined medication",
        ]);
      }

      // Create vitals if required
      let vitalsId = null;
      if (medication.requiresVitals) {
        const vitalsData = {
          residentId: medication.residentId,
          tenantId,
          medicationId: medication.id,
          recordedAt: administeredAt,
          recordedBy: caregiver.id,
          recordedByName: caregiver.name,
          temperatureUnit: "F",
          weightUnit: "lbs",
        };

        if (medication.vitalsType === "BloodPressure" || medication.vitalsType === "All") {
          vitalsData.bloodPressureSystolic = 110 + Math.floor(Math.random() * 30);
          vitalsData.bloodPressureDiastolic = 70 + Math.floor(Math.random() * 20);
        }
        if (medication.vitalsType === "Pulse" || medication.vitalsType === "All") {
          vitalsData.pulse = 60 + Math.floor(Math.random() * 40);
        }
        if (medication.vitalsType === "Temperature" || medication.vitalsType === "All") {
          vitalsData.temperature = 97.5 + Math.random() * 2.5;
          vitalsData.temperatureUnit = "F";
        }

        const vitals = await prisma.vitalSign.create({
          data: vitalsData,
        });
        vitalsId = vitals.id;
      }

      const caregiverInitials = generateInitials(caregiver.name);

      await prisma.marRecord.create({
        data: {
          medicationId: medication.id,
          scheduleId: null, // Standalone, not linked to schedule
          residentId: medication.residentId,
          tenantId,
          administeredAt,
          scheduledTime,
          status,
          caregiverId: caregiver.id,
          caregiverName: caregiver.name,
          caregiverInitials,
          signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          signatureType: "drawing",
          notes: getRandomElement(SAMPLE_NOTES),
          residentResponse: status === "Given" ? getRandomElement(RESIDENT_RESPONSES) : null,
          notGivenReason,
          refusedReason,
          vitalsId,
          createdBy: caregiver.id,
        },
      });

      totalRecords++;
    }
    console.log(`  ✓ Created ${numStandalone} additional standalone MAR records`);
  }

  return totalRecords;
}

/**
 * Seed PRN records
 */
async function seedPrnRecords(prnMedications, staffUsers, tenantId) {
  let totalPrnRecords = 0;

  for (const medication of prnMedications) {
    // Create 2-5 PRN records per medication
    const numRecords = 2 + Math.floor(Math.random() * 4);

    for (let i = 0; i < numRecords; i++) {
      const caregiver = getRandomElement(staffUsers);
      const givenAt = getRandomDate(7); // Within last 7 days
      const caregiverInitials = generateInitials(caregiver.name);

      // Get why given and symptoms noted (both required fields)
      const whyGiven = getRandomElement(PRN_SYMPTOMS);
      const symptomsNoted = `${whyGiven} observed. Resident reported ${whyGiven.toLowerCase()}.`;

      // Some PRN records have follow-ups, some don't
      const hasResponse = Math.random() < 0.4; // 40% have responses
      const responseRecordedAt = hasResponse
        ? new Date(givenAt.getTime() + (30 + Math.random() * 30) * 60000) // 30-60 min later
        : null;

      const prnRecord = await prisma.prnRecord.create({
        data: {
          medicationId: medication.id,
          residentId: medication.residentId,
          tenantId,
          whyGiven: whyGiven, // Required field
          symptomsNoted: symptomsNoted, // Required field
          symptom: whyGiven, // Keep for backward compatibility
          givenAt,
          caregiverId: caregiver.id,
          caregiverName: caregiver.name,
          caregiverInitials,
          signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          notes: getRandomElement(SAMPLE_NOTES),
          response: hasResponse ? getRandomElement(RESIDENT_RESPONSES) : null,
          effectiveness: hasResponse && Math.random() < 0.5 ? getRandomElement(RESIDENT_RESPONSES) : null,
          responseRecordedAt,
          physicianNotified: hasResponse && Math.random() < 0.2, // 20% notified physician
          physicianNotifiedAt: hasResponse && Math.random() < 0.2 ? responseRecordedAt : null,
        },
      });

      totalPrnRecords++;
    }
  }

  console.log(`  ✓ Created ${totalPrnRecords} PRN records`);
  return totalPrnRecords;
}

/**
 * Seed standalone vitals records
 */
async function seedVitalsRecords(residents, staffUsers, tenantId) {
  let totalVitals = 0;

  // Create 2-3 vitals records per resident
  for (const resident of residents) {
    const numRecords = 2 + Math.floor(Math.random() * 2);

    for (let i = 0; i < numRecords; i++) {
      const recorder = getRandomElement(staffUsers);
      const recordedAt = getRandomDate(14); // Within last 14 days

      const vitals = await prisma.vitalSign.create({
        data: {
          residentId: resident.id,
          tenantId,
          recordedAt,
          recordedBy: recorder.id,
          recordedByName: recorder.name,
          bloodPressureSystolic: 110 + Math.floor(Math.random() * 30), // 110-140
          bloodPressureDiastolic: 70 + Math.floor(Math.random() * 20), // 70-90
          pulse: 60 + Math.floor(Math.random() * 40), // 60-100
          temperature: 97.5 + Math.random() * 2.5, // 97.5-100
          temperatureUnit: "F",
          oxygenSaturation: 95 + Math.floor(Math.random() * 5), // 95-100
          weight: 120 + Math.random() * 60, // 120-180 lbs
          weightUnit: "lbs",
          notes: "Routine vitals check",
        },
      });

      totalVitals++;
    }
  }

  console.log(`  ✓ Created ${totalVitals} standalone vitals records`);
  return totalVitals;
}

/**
 * Main seed function
 */
async function main() {
  console.log("Starting EMAR seed script...\n");

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node scripts/seed-emar.js <tenantId> [residentIds...] [--userIds userId1 userId2 ...]");
    console.error("\nExample:");
    console.error("  node scripts/seed-emar.js <tenantId>");
    console.error("  node scripts/seed-emar.js <tenantId> residentId1 residentId2");
    console.error("  node scripts/seed-emar.js <tenantId> --userIds userId1 userId2");
    process.exit(1);
  }

  const tenantId = args[0];
  if (!tenantId) {
    console.error("Error: tenantId is required");
    process.exit(1);
  }

  console.log(`Tenant ID: ${tenantId}`);

  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    console.error(`Error: Tenant with ID ${tenantId} not found`);
    process.exit(1);
  }

  console.log(`\n🌱 Seeding EMAR data for tenant: ${tenant.name} (${tenantId})\n`);

  // Parse arguments
  let residentIds = [];
  let userIds = [];
  let parsingUserIds = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--userIds") {
      parsingUserIds = true;
      continue;
    }

    if (parsingUserIds) {
      userIds.push(args[i]);
    } else {
      residentIds.push(args[i]);
    }
  }

  // Get residents
  let residents = [];
  if (residentIds.length > 0) {
    // Use provided resident IDs
    for (const residentId of residentIds) {
      // Validate resident exists (we'll create medications anyway, but log if not found)
      residents.push({ id: residentId, name: "Resident" });
    }
    console.log(`Using ${residentIds.length} provided resident ID(s)`);
  } else {
    // Fetch all residents for tenant
    console.log("Fetching residents for tenant...");
    residents = await getResidentsForTenant(tenantId);
    if (residents.length === 0) {
      console.error("Error: No residents found for this tenant. Please create form submissions first or provide resident IDs.");
      process.exit(1);
    }
    console.log(`Found ${residents.length} resident(s)`);
  }

  // Get staff users
  let staffUsers = [];
  if (userIds.length > 0) {
    // Use provided user IDs
    for (const userId of userIds) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });
      if (user) {
        staffUsers.push(user);
      }
    }
    console.log(`Using ${staffUsers.length} provided user ID(s) as caregivers`);
  } else {
    // Fetch staff users for tenant
    console.log("Fetching staff users for tenant...");
    staffUsers = await getStaffUsersForTenant(tenantId);
    if (staffUsers.length === 0) {
      console.error("Error: No staff users found for this tenant. Please create staff users first or provide user IDs.");
      process.exit(1);
    }
    console.log(`Found ${staffUsers.length} staff user(s)`);
  }

  if (staffUsers.length === 0) {
    console.error("Error: No caregivers available. Please provide user IDs or create staff users.");
    process.exit(1);
  }

  // Use first staff user as creator if no specific user provided
  const creatorUserId = userIds.length > 0 ? userIds[0] : staffUsers[0].id;

  console.log("\n📋 Creating medications...\n");

  // Seed medications for each resident
  const allMedications = [];
  const prnMedications = [];

  for (const resident of residents) {
    console.log(`\nResident: ${resident.name || resident.id}`);

    // Select 4-6 random medications per resident
    const numMeds = 4 + Math.floor(Math.random() * 3);
    const selectedMeds = SAMPLE_MEDICATIONS.sort(() => Math.random() - 0.5).slice(0, numMeds);

    const medications = await seedMedications(
      resident.id,
      tenantId,
      creatorUserId,
      selectedMeds
    );

    allMedications.push(...medications);
    prnMedications.push(...medications.filter((m) => m.isPrn));
  }

  console.log(`\n✅ Created ${allMedications.length} total medications`);
  console.log(`   - ${allMedications.length - prnMedications.length} scheduled medications`);
  console.log(`   - ${prnMedications.length} PRN medications`);

  // Generate schedules - fetch medications fresh from DB to ensure timeSlots are loaded
  console.log("\n📅 Generating medication schedules...\n");
  const medicationIds = allMedications.map((m) => m.id);
  const freshMedications = await prisma.medication.findMany({
    where: {
      id: { in: medicationIds },
    },
    select: {
      id: true,
      residentId: true,
      timeSlots: true,
      isPrn: true,
      startDate: true,
      endDate: true,
      name: true,
    },
  });
  const totalSchedules = await generateSchedulesForMedications(freshMedications, tenantId);
  console.log(`\n✅ Generated ${totalSchedules} total schedules`);

  // Get all schedules for MAR records
  const allSchedules = await prisma.medicationSchedule.findMany({
    where: {
      tenantId,
      medicationId: {
        in: allMedications.map((m) => m.id),
      },
    },
  });

  // Seed MAR records
  console.log("\n💊 Creating MAR records...\n");
  const totalMarRecords = await seedMarRecords(
    allMedications,
    allSchedules,
    staffUsers,
    tenantId
  );
  console.log(`\n✅ Created ${totalMarRecords} MAR records`);

  // Seed PRN records
  if (prnMedications.length > 0) {
    console.log("\n🩹 Creating PRN records...\n");
    const totalPrnRecords = await seedPrnRecords(
      prnMedications,
      staffUsers,
      tenantId
    );
    console.log(`\n✅ Created ${totalPrnRecords} PRN records`);
  }

  // Seed standalone vitals
  console.log("\n🩺 Creating vitals records...\n");
  const totalVitals = await seedVitalsRecords(residents, staffUsers, tenantId);
  console.log(`\n✅ Created ${totalVitals} vitals records`);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ EMAR Seed Complete!");
  console.log("=".repeat(50));
  console.log(`\nSummary:`);
  console.log(`  - Medications: ${allMedications.length}`);
  console.log(`  - Schedules: ${totalSchedules}`);
  console.log(`  - MAR Records: ${totalMarRecords}`);
  console.log(`  - PRN Records: ${prnMedications.length > 0 ? "Created" : "None (no PRN medications)"}`);
  console.log(`  - Vitals Records: ${totalVitals}`);
  console.log(`\n🎉 You can now view the EMAR dashboard with sample data!`);
  console.log("=".repeat(50) + "\n");
}

main()
  .catch((e) => {
    console.error("Error seeding EMAR data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

