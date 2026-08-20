/**
 * Data Migration Script: Migrate Resident Fields
 *
 * This script migrates existing resident data from old fields to new fields
 * based on the new resident_fields.json schema.
 *
 * IMPORTANT:
 * - Run this script on STAGING first
 * - Create a database backup before running
 * - Old fields are kept intact (not deleted)
 * - Only migrates data where new fields are empty/null
 *
 * Usage:
 *   node scripts/migrate-resident-fields.js [--dry-run] [--tenant-id=<uuid>]
 *
 * Options:
 *   --dry-run: Show what would be migrated without making changes
 *   --tenant-id: Migrate only specific tenant (for testing)
 */

const prisma = require("../src/lib/prisma");
const fs = require("fs");
const path = require("path");

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const tenantIdArg = args.find((arg) => arg.startsWith("--tenant-id="));
const tenantId = tenantIdArg ? tenantIdArg.split("=")[1] : null;

// Migration statistics
const stats = {
  total: 0,
  migrated: 0,
  skipped: 0,
  errors: 0,
  fieldMappings: {},
};

/**
 * Field mapping configuration
 * Maps old field names (Prisma camelCase) to new field names (Prisma camelCase)
 * Only maps fields that have a direct 1:1 relationship
 */
const fieldMappings = {
  // Allergies
  medicalAllergies: "allergiesMedicationAllergies", // Copy to medication allergies (can't auto-split)
  dietFoodAllergies: "allergiesFoodAllergies", // Direct merge

  // External Facilities
  admissionPreviousLivingArrangement: "externalFacilityPreviousLiving",
  admissionReferralSource: "externalFacilityReferringFacility",

  // Pharmacy
  medicalCurrentPharmacy: "pharmacyName", // Direct mapping

  // Diagnosis (only if new field is empty)
  medicalPrimaryDiagnosis: "diagnosisPrimaryDiagnosis",
  medicalSecondaryDiagnoses: "diagnosisSecondaryDiagnoses",
  medicalChronicConditions: "diagnosisChronicConditions",

  // Note: Care Provider name/clinic/phone fields are NOT migrated because:
  // - Old fields: medicalPrimaryCareProviderName, medicalPrimaryCareClinic, medicalPrimaryCareProviderPhone
  // - These are the SAME fields used in resident_fields.json (just different naming)
  // - The service layer handles the mapping between JSON field names and DB field names
  // - Only NEW fields like careProviderPrimaryCareFax are separate
};

/**
 * Convert Prisma camelCase field name to snake_case for logging
 */
function toSnakeCase(str) {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Migrate a single resident record
 */
async function migrateResident(resident) {
  const updates = {};
  let hasUpdates = false;

  // Apply field mappings
  for (const [oldField, newField] of Object.entries(fieldMappings)) {
    const oldValue = resident[oldField];
    const newValue = resident[newField];

    // Only migrate if:
    // 1. Old field has a value
    // 2. New field is empty/null/undefined
    if (oldValue !== null && oldValue !== undefined && oldValue !== "") {
      if (
        newValue === null ||
        newValue === undefined ||
        newValue === "" ||
        (Array.isArray(newValue) && newValue.length === 0)
      ) {
        updates[newField] = oldValue;
        hasUpdates = true;

        // Track field mapping for statistics
        const oldFieldSnake = toSnakeCase(oldField);
        const newFieldSnake = toSnakeCase(newField);
        if (!stats.fieldMappings[oldFieldSnake]) {
          stats.fieldMappings[oldFieldSnake] = {};
        }
        if (!stats.fieldMappings[oldFieldSnake][newFieldSnake]) {
          stats.fieldMappings[oldFieldSnake][newFieldSnake] = 0;
        }
        stats.fieldMappings[oldFieldSnake][newFieldSnake]++;
      }
    }
  }

  // Special handling for emergency contact fields
  // Map admission_poa_* to emergency_poa_* if emergency fields are empty
  if (
    resident.admissionPoaOnFile !== null &&
    resident.admissionPoaOnFile !== undefined &&
    (resident.emergencyPoaOnFile === null ||
      resident.emergencyPoaOnFile === undefined)
  ) {
    updates.emergencyPoaOnFile = resident.admissionPoaOnFile;
    hasUpdates = true;
  }

  if (
    resident.admissionPoaType &&
    !resident.emergencyPoaType
  ) {
    updates.emergencyPoaType = resident.admissionPoaType;
    hasUpdates = true;
  }

  if (
    resident.admissionCodeStatus &&
    !resident.emergencyCodeStatus
  ) {
    updates.emergencyCodeStatus = resident.admissionCodeStatus;
    hasUpdates = true;
  }

  // Special handling: Map insurance_* fields to payer_* fields in resident_fields.json
  // But these are already mapped in the service layer, so we don't need to migrate them
  // The database still uses insurance_* prefix, which is fine

  if (!hasUpdates) {
    stats.skipped++;
    return { migrated: false, reason: "No fields to migrate" };
  }

  if (isDryRun) {
    stats.migrated++;
    return {
      migrated: true,
      updates,
      reason: "DRY RUN - Would update",
    };
  }

  try {
    // Update resident with new field values
    await prisma.resident.update({
      where: { id: resident.id },
      data: updates,
    });

    stats.migrated++;
    return { migrated: true, updates };
  } catch (error) {
    stats.errors++;
    console.error(
      `[Migration] Error updating resident ${resident.id}:`,
      error.message
    );
    return { migrated: false, error: error.message };
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log("=".repeat(80));
  console.log("RESIDENT FIELDS MIGRATION SCRIPT");
  console.log("=".repeat(80));
  console.log(`Mode: ${isDryRun ? "DRY RUN (no changes will be made)" : "LIVE (will update database)"}`);
  if (tenantId) {
    console.log(`Tenant Filter: ${tenantId}`);
  }
  console.log("=".repeat(80));
  console.log("");

  try {
    // Build query
    const whereClause = tenantId ? { tenantId } : {};

    // Get all residents
    console.log("Fetching residents...");
    const residents = await prisma.resident.findMany({
      where: whereClause,
      // Select all fields we need for migration
      select: {
        id: true,
        tenantId: true,
        // Old fields
        medicalAllergies: true,
        dietFoodAllergies: true,
        admissionPreviousLivingArrangement: true,
        admissionReferralSource: true,
        medicalCurrentPharmacy: true,
        medicalPrimaryDiagnosis: true,
        medicalSecondaryDiagnoses: true,
        medicalChronicConditions: true,
        admissionPoaOnFile: true,
        admissionPoaType: true,
        admissionCodeStatus: true,
        // New fields (to check if they're empty)
        allergiesMedicationAllergies: true,
        allergiesFoodAllergies: true,
        externalFacilityPreviousLiving: true,
        externalFacilityReferringFacility: true,
        pharmacyName: true,
        diagnosisPrimaryDiagnosis: true,
        diagnosisSecondaryDiagnoses: true,
        diagnosisChronicConditions: true,
        emergencyPoaOnFile: true,
        emergencyPoaType: true,
        emergencyCodeStatus: true,
      },
    });

    stats.total = residents.length;
    console.log(`Found ${stats.total} resident(s) to process\n`);

    if (stats.total === 0) {
      console.log("No residents found. Exiting.");
      return;
    }

    // Process each resident
    console.log("Processing residents...");
    for (let i = 0; i < residents.length; i++) {
      const resident = residents[i];
      const result = await migrateResident(resident);

      if ((i + 1) % 10 === 0) {
        console.log(
          `Progress: ${i + 1}/${stats.total} (${Math.round(
            ((i + 1) / stats.total) * 100
          )}%)`
        );
      }

      if (result.migrated && result.updates) {
        console.log(
          `  ✓ Resident ${resident.id}: Migrated ${Object.keys(result.updates).length} field(s)`
        );
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("MIGRATION SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total Residents: ${stats.total}`);
    console.log(`Migrated: ${stats.migrated}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log("");

    if (Object.keys(stats.fieldMappings).length > 0) {
      console.log("Field Mappings Applied:");
      for (const [oldField, mappings] of Object.entries(
        stats.fieldMappings
      )) {
        for (const [newField, count] of Object.entries(mappings)) {
          console.log(`  ${oldField} → ${newField}: ${count} resident(s)`);
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    if (isDryRun) {
      console.log("DRY RUN COMPLETE - No changes were made to the database");
      console.log("Run without --dry-run to apply migrations");
    } else {
      console.log("MIGRATION COMPLETE");
      console.log("⚠️  IMPORTANT: Old fields are still in the database.");
      console.log("    They will be removed in Phase 8 after verification.");
    }
    console.log("=".repeat(80));
  } catch (error) {
    console.error("\n[ERROR] Migration failed:", error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
if (require.main === module) {
  runMigration().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { runMigration, migrateResident };
