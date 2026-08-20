const { PrismaClient } = require("@prisma/client");
const { getResidents } = require("../src/services/resident/resident.service");

const prisma = new PrismaClient();

/**
 * Behavioral Tracking Seed Script
 *
 * Usage:
 * node scripts/seed-behavioral.js <tenantId> [residentIds...] [--userIds userId1 userId2 ...] [--days 30]
 *
 * Examples:
 * node scripts/seed-behavioral.js <tenantId>
 * node scripts/seed-behavioral.js <tenantId> residentId1 residentId2
 * node scripts/seed-behavioral.js <tenantId> --userIds userId1 userId2
 * node scripts/seed-behavioral.js <tenantId> --days 60
 */

// Behavior types from enum
const BEHAVIOR_TYPES = [
  "Aggression",
  "SelfHarm",
  "Withdrawal",
  "NonCompliance",
  "MoodChanges",
  "Anxiety",
  "Agitation",
  "VerbalAbuse",
  "PhysicalAbuse",
  "PropertyDamage",
  "Wandering",
  "InappropriateBehavior",
  "Other",
];

// Severity levels
const SEVERITY_LEVELS = ["Low", "Moderate", "High"];

// Intervention types
const INTERVENTION_TYPES = [
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

// Sample triggers/contexts
const SAMPLE_TRIGGERS = [
  "Resident became upset when asked to take medication",
  "Change in routine caused distress",
  "Resident was agitated after phone call with family",
  "Loud noise in hallway triggered response",
  "Resident refused to participate in activity",
  "Conflict with another resident",
  "Resident appeared confused about location",
  "Resident was frustrated with staff instructions",
  "Resident became anxious during meal time",
  "Resident was upset about personal belongings",
  "Resident showed signs of discomfort",
  "Resident was restless and unable to sit still",
  "Resident became aggressive when approached",
  "Resident was non-compliant with care plan",
  "Resident showed signs of withdrawal from social activities",
];

// Sample staff notes
const SAMPLE_STAFF_NOTES = [
  "Resident was calm and cooperative after intervention. No further incidents observed.",
  "Staff provided reassurance and redirection. Resident responded positively.",
  "Resident required additional support and monitoring throughout the shift.",
  "Behavior escalated but was successfully de-escalated with verbal intervention.",
  "Resident appeared to be in distress. Comfort measures provided.",
  "Resident was redirected to preferred activity. Behavior improved.",
  "Staff provided one-on-one attention. Resident calmed down after 15 minutes.",
  "Resident was moved to quieter area. Behavior de-escalated.",
  "Family was notified of incident. Resident's mood improved after family contact.",
  "Resident required PRN medication. Behavior improved after medication administration.",
  "Resident was non-compliant initially but became cooperative after explanation.",
  "Staff observed increased agitation. Environmental modifications made.",
  "Resident showed signs of anxiety. Counseling provided.",
  "Resident was physically aggressive. Emergency protocols followed.",
  "Resident wandered from designated area. Safely returned to room.",
];

// Sample intervention details
const SAMPLE_INTERVENTION_DETAILS = [
  "Staff redirected resident to preferred activity. Resident engaged for 30 minutes.",
  "One-on-one counseling session provided. Resident expressed concerns and felt heard.",
  "PRN medication administered as ordered. Resident calmed within 20 minutes.",
  "Resident was given quiet time in room. Behavior improved after rest period.",
  "De-escalation techniques used. Staff maintained calm demeanor and provided reassurance.",
  "Environmental modifications made: reduced noise, dimmed lights, provided comfort items.",
  "Additional staff support provided. Resident felt more secure with extra attention.",
  "Family notified via phone call. Resident spoke with family member and mood improved.",
  "Physician notified of incident. Orders received for additional monitoring.",
  "Emergency response team activated. Situation resolved without further escalation.",
  "Resident was moved to different area. Change of environment helped de-escalate.",
  "Staff provided distraction techniques. Resident engaged in alternative activity.",
];

// Behavior type to intervention mapping (realistic combinations)
const BEHAVIOR_INTERVENTION_MAP = {
  Aggression: [
    "Redirect",
    "DeEscalation",
    "TimeOut",
    "StaffSupport",
    "PrnMedication",
  ],
  SelfHarm: [
    "EmergencyResponse",
    "PhysicianNotification",
    "StaffSupport",
    "Counseling",
  ],
  Withdrawal: [
    "Counseling",
    "StaffSupport",
    "FamilyNotification",
    "EnvironmentalModification",
  ],
  NonCompliance: ["Redirect", "Counseling", "StaffSupport", "DeEscalation"],
  MoodChanges: [
    "Counseling",
    "StaffSupport",
    "FamilyNotification",
    "PhysicianNotification",
  ],
  Anxiety: [
    "Redirect",
    "Counseling",
    "EnvironmentalModification",
    "PrnMedication",
    "StaffSupport",
  ],
  Agitation: [
    "Redirect",
    "DeEscalation",
    "EnvironmentalModification",
    "PrnMedication",
    "TimeOut",
  ],
  VerbalAbuse: ["Redirect", "DeEscalation", "TimeOut", "Counseling"],
  PhysicalAbuse: [
    "EmergencyResponse",
    "TimeOut",
    "StaffSupport",
    "PhysicianNotification",
  ],
  PropertyDamage: ["Redirect", "DeEscalation", "TimeOut", "StaffSupport"],
  Wandering: [
    "Redirect",
    "EnvironmentalModification",
    "StaffSupport",
    "FamilyNotification",
  ],
  InappropriateBehavior: ["Redirect", "Counseling", "DeEscalation", "TimeOut"],
  Other: ["Redirect", "Counseling", "StaffSupport", "DeEscalation"],
};

// Behavior type to severity probability (higher severity behaviors more likely to be High)
const BEHAVIOR_SEVERITY_MAP = {
  Aggression: { Low: 0.2, Moderate: 0.4, High: 0.4 },
  SelfHarm: { Low: 0.1, Moderate: 0.2, High: 0.7 },
  PhysicalAbuse: { Low: 0.1, Moderate: 0.3, High: 0.6 },
  VerbalAbuse: { Low: 0.3, Moderate: 0.5, High: 0.2 },
  Anxiety: { Low: 0.4, Moderate: 0.5, High: 0.1 },
  Agitation: { Low: 0.3, Moderate: 0.5, High: 0.2 },
  Withdrawal: { Low: 0.5, Moderate: 0.4, High: 0.1 },
  NonCompliance: { Low: 0.4, Moderate: 0.5, High: 0.1 },
  MoodChanges: { Low: 0.4, Moderate: 0.4, High: 0.2 },
  Wandering: { Low: 0.5, Moderate: 0.4, High: 0.1 },
  PropertyDamage: { Low: 0.2, Moderate: 0.5, High: 0.3 },
  InappropriateBehavior: { Low: 0.5, Moderate: 0.4, High: 0.1 },
  Other: { Low: 0.4, Moderate: 0.4, High: 0.2 },
};

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
 * Get staff users for a tenant
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
 * Get PRN records for a resident (to link some behavioral logs)
 */
async function getPrnRecordsForResident(tenantId, residentId, limit = 10) {
  try {
    const prnRecords = await prisma.prnRecord.findMany({
      where: {
        tenantId,
        residentId,
        deletedAt: null,
      },
      orderBy: {
        givenAt: "desc",
      },
      take: limit,
      select: {
        id: true,
        givenAt: true,
      },
    });

    return prnRecords;
  } catch (error) {
    console.error("Error fetching PRN records:", error);
    return [];
  }
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
function getRandomDate(daysAgo = 30) {
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
 * Get severity based on behavior type (weighted probability)
 */
function getSeverityForBehavior(behaviorType) {
  const probabilities = BEHAVIOR_SEVERITY_MAP[behaviorType] || {
    Low: 0.4,
    Moderate: 0.4,
    High: 0.2,
  };

  const rand = Math.random();
  if (rand < probabilities.Low) {
    return "Low";
  } else if (rand < probabilities.Low + probabilities.Moderate) {
    return "Moderate";
  } else {
    return "High";
  }
}

/**
 * Get interventions for behavior type
 */
function getInterventionsForBehavior(behaviorType, severity) {
  const availableInterventions =
    BEHAVIOR_INTERVENTION_MAP[behaviorType] || INTERVENTION_TYPES;

  // Higher severity = more interventions
  let numInterventions = 1;
  if (severity === "High") {
    numInterventions = Math.random() < 0.7 ? 2 : 3;
  } else if (severity === "Moderate") {
    numInterventions = Math.random() < 0.5 ? 1 : 2;
  }

  // Shuffle and take random interventions
  const shuffled = [...availableInterventions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, numInterventions);
}

/**
 * Create behavioral logs for a resident
 */
async function createBehavioralLogsForResident(
  tenantId,
  resident,
  staffUsers,
  prnRecords,
  daysBack = 30,
  logsPerResident = 5
) {
  const logs = [];
  const numLogs = Math.floor(Math.random() * logsPerResident) + 3; // 3-8 logs per resident

  for (let i = 0; i < numLogs; i++) {
    const behaviorType = getRandomElement(BEHAVIOR_TYPES);
    const severity = getSeverityForBehavior(behaviorType);
    const staff = getRandomElement(staffUsers);
    const dateTime = getRandomDate(daysBack);
    const trigger = getRandomElement(SAMPLE_TRIGGERS);
    const staffNotes = getRandomElement(SAMPLE_STAFF_NOTES);
    const interventions = getInterventionsForBehavior(behaviorType, severity);
    const interventionDetails = getRandomElement(SAMPLE_INTERVENTION_DETAILS);

    // 30% chance to link to a PRN record if available and intervention includes PrnMedication
    let prnRecordId = null;
    if (
      prnRecords.length > 0 &&
      interventions.includes("PrnMedication") &&
      Math.random() < 0.3
    ) {
      // Find a PRN record that was given around the same time (within 2 hours)
      const matchingPrn = prnRecords.find((prn) => {
        const timeDiff = Math.abs(
          new Date(prn.givenAt).getTime() - dateTime.getTime()
        );
        return timeDiff < 2 * 60 * 60 * 1000; // 2 hours
      });

      if (matchingPrn) {
        prnRecordId = matchingPrn.id;
      } else {
        // Use a random PRN record if no time match
        prnRecordId = getRandomElement(prnRecords).id;
      }
    }

    try {
      const log = await prisma.behavioralLog.create({
        data: {
          residentId: resident.id,
          residentName: resident.name,
          tenantId,
          dateTime,
          behaviorType,
          severity,
          trigger,
          staffNotes,
          interventions,
          interventionDetails,
          staffId: staff.id,
          staffName: staff.name,
          prnRecordId,
          createdBy: staff.id,
          isLocked: false,
          canEdit: true,
        },
      });

      logs.push(log);
    } catch (error) {
      console.error(
        `Error creating behavioral log for resident ${resident.name}:`,
        error
      );
    }
  }

  return logs;
}

/**
 * Create behavioral notes for a resident (AI-generated narratives)
 */
async function createBehavioralNotesForResident(
  tenantId,
  resident,
  behavioralLogs,
  staffUsers
) {
  if (behavioralLogs.length === 0) {
    return [];
  }

  const notes = [];
  const staff = getRandomElement(staffUsers);

  // Group logs by month and create notes for each month
  const logsByMonth = {};
  behavioralLogs.forEach((log) => {
    const monthKey = `${new Date(log.dateTime).getFullYear()}-${String(
      new Date(log.dateTime).getMonth() + 1
    ).padStart(2, "0")}`;

    if (!logsByMonth[monthKey]) {
      logsByMonth[monthKey] = [];
    }
    logsByMonth[monthKey].push(log);
  });

  // Create a note for each month with logs
  for (const [monthKey, monthLogs] of Object.entries(logsByMonth)) {
    if (monthLogs.length < 2) continue; // Skip months with less than 2 logs

    // Sort logs by date
    monthLogs.sort(
      (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
    );

    const startDate = new Date(monthLogs[0].dateTime);
    const endDate = new Date(monthLogs[monthLogs.length - 1].dateTime);

    // Set to start/end of month
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
    endDate.setTime(lastDay.getTime());
    endDate.setHours(23, 59, 59, 999);

    // Generate narrative from logs
    const narrative = generateNarrativeFromLogs(monthLogs, resident.name);

    try {
      const note = await prisma.behavioralNote.create({
        data: {
          residentId: resident.id,
          residentName: resident.name,
          tenantId,
          startDate,
          endDate,
          narrative,
          isAiGenerated: true,
          currentVersion: 0,
          generatedBy: staff.id,
        },
      });

      // Create initial version
      await prisma.behavioralNoteVersion.create({
        data: {
          noteId: note.id,
          version: 0,
          residentId: resident.id,
          residentName: resident.name,
          tenantId,
          startDate,
          endDate,
          narrative,
          isAiGenerated: true,
          createdBy: staff.id,
        },
      });

      notes.push(note);
    } catch (error) {
      console.error(
        `Error creating behavioral note for resident ${resident.name}:`,
        error
      );
    }
  }

  return notes;
}

/**
 * Generate narrative from behavioral logs
 */
function generateNarrativeFromLogs(logs, residentName) {
  const behaviorCounts = {};
  const severityCounts = { Low: 0, Moderate: 0, High: 0 };
  const interventionCounts = {};

  logs.forEach((log) => {
    behaviorCounts[log.behaviorType] =
      (behaviorCounts[log.behaviorType] || 0) + 1;
    severityCounts[log.severity] = (severityCounts[log.severity] || 0) + 1;

    if (log.interventions && Array.isArray(log.interventions)) {
      log.interventions.forEach((intervention) => {
        interventionCounts[intervention] =
          (interventionCounts[intervention] || 0) + 1;
      });
    }
  });

  const mostCommonBehavior = Object.entries(behaviorCounts).sort(
    (a, b) => b[1] - a[1]
  )[0];

  let narrative = `Behavioral Summary for ${residentName}\n\n`;
  narrative += `During this reporting period, ${logs.length} behavioral incident(s) were documented.\n\n`;

  if (mostCommonBehavior) {
    narrative += `The most frequently observed behavior was ${mostCommonBehavior[0]} (${mostCommonBehavior[1]} occurrence(s)). `;
  }

  narrative += `Severity distribution: ${severityCounts.Low} Low, ${severityCounts.Moderate} Moderate, and ${severityCounts.High} High severity incidents.\n\n`;

  const commonInterventions = Object.entries(interventionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name)
    .join(", ");

  if (commonInterventions) {
    narrative += `Common interventions utilized included: ${commonInterventions}.\n\n`;
  }

  narrative += `Staff consistently monitored and documented all incidents, implementing appropriate interventions as needed. `;
  narrative += `Ongoing assessment and care plan adjustments continue to be made based on observed patterns and resident response to interventions.`;

  return narrative;
}

/**
 * Main seed function
 */
async function seedBehavioralTracking(
  tenantId,
  residentIds = [],
  userIds = [],
  daysBack = 30
) {
  console.log("\n🌱 Starting Behavioral Tracking Seed...\n");

  // Validate tenant
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    console.error(`❌ Tenant not found: ${tenantId}`);
    process.exit(1);
  }

  console.log(`✅ Tenant found: ${tenant.name} (${tenant.slug})\n`);

  // Get residents
  let residents = [];
  if (residentIds.length > 0) {
    // Get specific residents
    const allResidents = await getResidentsForTenant(tenantId);
    residents = allResidents.filter((r) => residentIds.includes(r.id));

    if (residents.length === 0) {
      console.error(`❌ No residents found with provided IDs`);
      process.exit(1);
    }
  } else {
    // Get all residents
    residents = await getResidentsForTenant(tenantId);
  }

  if (residents.length === 0) {
    console.error(`❌ No residents found for tenant ${tenant.name}`);
    process.exit(1);
  }

  console.log(`📋 Found ${residents.length} resident(s)\n`);

  // Get staff users
  let staffUsers = [];
  if (userIds.length > 0) {
    const allStaff = await getStaffUsersForTenant(tenantId);
    staffUsers = allStaff.filter((u) => userIds.includes(u.id));

    if (staffUsers.length === 0) {
      console.error(`❌ No staff users found with provided IDs`);
      process.exit(1);
    }
  } else {
    staffUsers = await getStaffUsersForTenant(tenantId);
  }

  if (staffUsers.length === 0) {
    console.error(
      `❌ No staff users found for tenant ${tenant.name}. Please create staff users first.`
    );
    process.exit(1);
  }

  console.log(`👥 Found ${staffUsers.length} staff user(s)\n`);

  // Create behavioral logs for each resident
  let totalLogs = 0;
  let totalNotes = 0;

  for (const resident of residents) {
    console.log(`📝 Processing resident: ${resident.name}...`);

    // Get PRN records for this resident (to link some behavioral logs)
    const prnRecords = await getPrnRecordsForResident(
      tenantId,
      resident.id,
      20
    );

    // Create behavioral logs
    const logs = await createBehavioralLogsForResident(
      tenantId,
      resident,
      staffUsers,
      prnRecords,
      daysBack,
      8 // 3-8 logs per resident
    );

    totalLogs += logs.length;
    console.log(`   ✅ Created ${logs.length} behavioral log(s)`);

    // Create behavioral notes (grouped by month)
    const notes = await createBehavioralNotesForResident(
      tenantId,
      resident,
      logs,
      staffUsers
    );

    totalNotes += notes.length;
    if (notes.length > 0) {
      console.log(`   ✅ Created ${notes.length} behavioral note(s)`);
    }

    console.log("");
  }

  console.log("=".repeat(60));
  console.log("✅ Behavioral Tracking Seed Completed!\n");
  console.log(`📊 Summary:`);
  console.log(`   - Residents processed: ${residents.length}`);
  console.log(`   - Behavioral logs created: ${totalLogs}`);
  console.log(`   - Behavioral notes created: ${totalNotes}`);
  console.log(`   - Date range: Last ${daysBack} days`);
  console.log("=".repeat(60));
  console.log("\n");
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    "❌ Usage: node scripts/seed-behavioral.js <tenantId> [options]"
  );
  console.error("\nOptions:");
  console.error("  [residentIds...]     Specific resident IDs to seed");
  console.error("  --userIds <ids...>   Specific staff user IDs to use");
  console.error(
    "  --days <number>      Number of days back to generate logs (default: 30)"
  );
  console.error("\nExamples:");
  console.error("  node scripts/seed-behavioral.js <tenantId>");
  console.error(
    "  node scripts/seed-behavioral.js <tenantId> residentId1 residentId2"
  );
  console.error(
    "  node scripts/seed-behavioral.js <tenantId> --userIds userId1 userId2"
  );
  console.error("  node scripts/seed-behavioral.js <tenantId> --days 60");
  process.exit(1);
}

const tenantId = args[0];
const residentIds = [];
const userIds = [];
let daysBack = 30;

let i = 1;
while (i < args.length) {
  if (args[i] === "--userIds") {
    i++;
    while (i < args.length && !args[i].startsWith("--")) {
      userIds.push(args[i]);
      i++;
    }
  } else if (args[i] === "--days") {
    i++;
    if (i < args.length) {
      daysBack = parseInt(args[i], 10) || 30;
      i++;
    }
  } else if (!args[i].startsWith("--")) {
    residentIds.push(args[i]);
    i++;
  } else {
    i++;
  }
}

// Run seed
seedBehavioralTracking(tenantId, residentIds, userIds, daysBack)
  .catch((error) => {
    console.error("❌ Error seeding behavioral tracking:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
