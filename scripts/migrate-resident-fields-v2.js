/**
 * Data Migration Script: Migrate Resident Fields (v2)
 *
 * Migrates existing resident data from OLD schema to NEW schema
 * (from updated_resident_fields.json / resident_fields.json).
 *
 * IMPORTANT:
 * - Run migrations first: npx prisma migrate deploy
 * - Create a database backup before running
 * - Only migrates data where new fields are empty/null
 * - After successful migration, drops old columns (use --skip-drop to skip)
 * - After dropping: update schema.prisma to remove old Resident fields, run npx prisma generate
 *
 * Usage:
 *   node scripts/migrate-resident-fields-v2.js [--dry-run] [--tenant-id=<uuid>] [--skip-drop]
 */

const prisma = require("../src/lib/prisma");

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const skipDrop = args.includes("--skip-drop");
const tenantIdArg = args.find((arg) => arg.startsWith("--tenant-id="));
const tenantId = tenantIdArg ? tenantIdArg.split("=")[1] : null;

const stats = { total: 0, migrated: 0, skipped: 0, errors: 0 };

/**
 * Map old Prisma field names to new Prisma field names
 * Only migrates when new field is empty
 */
const fieldMappings = {
  // Resident Identification
  residentFullLegalName: "residentIdentificationFullLegalName",
  residentPreferredName: "residentIdentificationPreferredName",
  residentDateOfBirth: "residentIdentificationDateOfBirth",
  residentGenderSex: "residentIdentificationGender",
  residentSsn: "residentIdentificationSsn",
  admissionDate: "residentIdentificationAdmissionDate",
  admissionRoomNumber: "residentIdentificationRoomNumber",
  admissionStatus: "residentIdentificationResidentStatus",

  // Photo (profile picture)
  residentPhoto: "residentIdentificationProfilePicture",

  // Emergency / Legal Contacts
  emergencyPrimaryContactName: "emergencyLegalContactsPrimaryName",
  emergencyPrimaryContactRelationship:
    "emergencyLegalContactsPrimaryRelationship",
  emergencyPrimaryContactPhone: "emergencyLegalContactsPrimaryPhone",
  emergencySecondaryContactName: "emergencyLegalContactsSecondaryName",
  emergencySecondaryContactPhone: "emergencyLegalContactsSecondaryPhone",
  emergencyPoaOnFile: "emergencyLegalContactsGuardianPoaExists",
  emergencyAdvancedDirectiveOnFile:
    "emergencyLegalContactsCopyOfGuardianshipPoaOnFile",

  // Medical Providers
  medicalPrimaryCareProviderName:
    "medicalProvidersPrimaryCareProviderNamePhone",
  pharmacyName: "medicalProvidersPharmacyNamePhone",
  externalFacilityHospitalErMostUsed: "medicalProvidersPreferredHospitalEr",
  insurancePrimaryPayer: "medicalProvidersHealthInsurancePayorType",
  residentMedicaidDshsId: "medicalProvidersMedicaidIdClientId",

  // Diagnoses
  diagnosisPrimaryDiagnosis: "diagnosesHealthConditionsDiagnoses",
  allergiesMedicationAllergies: "diagnosesHealthConditionsAllergies",
  allergiesFoodAllergies: "diagnosesHealthConditionsAllergies", // Merge - append if both exist
  allergiesEnvironmentalAllergies: "diagnosesHealthConditionsAllergies",

  // Functional / Care Needs
  careNeedsFallRisk: "behavioralSafetyRisksFallRisk",
  careNeedsMobilityAidsUsed: "functionalStatusAdlsMobilityStatus",

  // Financial / Case Management
  careProviderCaseManagerName: "financialCaseManagementCaseManagerName",
  careProviderCaseManagerPhone: "financialCaseManagementCaseManagerPhoneEmail",
  insuranceAuthorizationStartDate:
    "financialCaseManagementAuthorizationStartDate",
  insuranceAuthorizationEndDate: "financialCaseManagementAuthorizationEndDate",

  // Code Status
  emergencyCodeStatus: "codeStatusAdvanceDirectivesCodeStatus",
  emergencyPolstOnFile: "codeStatusAdvanceDirectivesPolstOnFile", // Converted boolean -> "Yes"/"No"
};

/**
 * Old DB column names to drop after successful migration (from Prisma @map)
 */
const OLD_COLUMNS_TO_DROP = [
  "resident_full_legal_name",
  "resident_preferred_name",
  "resident_date_of_birth",
  "resident_gender_sex",
  "resident_ssn",
  "admission_date",
  "admission_room_number",
  "admission_status",
  "resident_photo",
  "emergency_primary_contact_name",
  "emergency_primary_contact_relationship",
  "emergency_primary_contact_phone",
  "emergency_secondary_contact_name",
  "emergency_secondary_contact_phone",
  "emergency_poa_on_file",
  "emergency_advanced_directive_on_file",
  "medical_primary_care_provider_name",
  "pharmacy_name",
  "external_facility_hospital_er_most_used",
  "insurance_primary_payer",
  "resident_medicaid_dshs_id",
  "diagnosis_primary_diagnosis",
  "allergies_medication_allergies",
  "allergies_food_allergies",
  "allergies_environmental_allergies",
  "care_needs_fall_risk",
  "care_needs_mobility_aids_used",
  "care_provider_case_manager_name",
  "care_provider_case_manager_phone",
  "insurance_authorization_start_date",
  "insurance_authorization_end_date",
  "emergency_code_status",
  "emergency_polst_on_file",
];

async function dropOldColumns() {
  console.log("\n" + "=".repeat(80));
  console.log("DROPPING OLD COLUMNS");
  console.log("=".repeat(80));

  let dropped = 0;
  let errors = 0;

  for (const columnName of OLD_COLUMNS_TO_DROP) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE residents DROP COLUMN IF EXISTS "${columnName}"`
      );
      console.log(`  ✓ Dropped: ${columnName}`);
      dropped++;
    } catch (err) {
      console.error(`  ✗ Failed to drop ${columnName}:`, err.message);
      errors++;
    }
  }

  console.log(`\nDropped ${dropped} column(s), ${errors} error(s)`);
  console.log("\n⚠️  NEXT STEPS (required):");
  console.log(
    "    1. Update prisma/schema.prisma - remove the dropped columns from Resident model"
  );
  console.log(
    "    2. Remove newToOld backward-compat block from resident-creation.service.js"
  );
  console.log(
    "    3. Update resident.controller.js - photo upload should only set residentIdentificationProfilePicture"
  );
  console.log("    4. Run: npx prisma generate");
  console.log("=".repeat(80));

  return { dropped, errors };
}

async function migrateResident(resident) {
  const updates = {};
  let hasUpdates = false;

  for (const [oldField, newField] of Object.entries(fieldMappings)) {
    const oldValue = resident[oldField];
    let newValue = resident[newField];

    if (oldValue === null || oldValue === undefined || oldValue === "")
      continue;
    if (
      newValue !== null &&
      newValue !== undefined &&
      newValue !== "" &&
      !(Array.isArray(newValue) && newValue.length === 0)
    ) {
      continue; // New field already has value
    }

    // Special handling for POLST (boolean -> "Yes"/"No" string)
    if (
      oldField === "emergencyPolstOnFile" &&
      newField === "codeStatusAdvanceDirectivesPolstOnFile" &&
      typeof oldValue === "boolean"
    ) {
      updates["codeStatusAdvanceDirectivesPolstOnFile"] = oldValue
        ? "Yes"
        : "No";
      hasUpdates = true;
      continue;
    }

    // Skip allergies - handled in merge block below
    if (newField === "diagnosesHealthConditionsAllergies") continue;

    updates[newField] = oldValue;
    hasUpdates = true;
  }

  // Handle allergies merge - only if we didn't already add it
  if (
    !updates.diagnosesHealthConditionsAllergies &&
    (resident.allergiesMedicationAllergies ||
      resident.allergiesFoodAllergies ||
      resident.allergiesEnvironmentalAllergies) &&
    !resident.diagnosesHealthConditionsAllergies
  ) {
    const parts = [];
    if (resident.allergiesMedicationAllergies)
      parts.push(`Medication: ${resident.allergiesMedicationAllergies}`);
    if (resident.allergiesFoodAllergies)
      parts.push(`Food: ${resident.allergiesFoodAllergies}`);
    if (resident.allergiesEnvironmentalAllergies)
      parts.push(`Environmental: ${resident.allergiesEnvironmentalAllergies}`);
    updates.diagnosesHealthConditionsAllergies = parts.join("; ");
    hasUpdates = true;
  }

  if (!hasUpdates) {
    stats.skipped++;
    return { migrated: false };
  }

  if (isDryRun) {
    stats.migrated++;
    return { migrated: true, updates };
  }

  try {
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

async function runMigration() {
  console.log("=".repeat(80));
  console.log("RESIDENT FIELDS MIGRATION (v2 - New Schema)");
  console.log("=".repeat(80));
  console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`);
  if (tenantId) console.log(`Tenant: ${tenantId}`);
  console.log("=".repeat(80));

  const where = tenantId ? { tenantId } : {};

  const residents = await prisma.resident.findMany({ where });
  stats.total = residents.length;

  console.log(`\nProcessing ${stats.total} resident(s)...\n`);

  for (let i = 0; i < residents.length; i++) {
    const result = await migrateResident(residents[i]);
    if (result.migrated && result.updates) {
      console.log(
        `  ✓ ${residents[i].id}: ${Object.keys(result.updates).length} field(s)`
      );
    }
    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${stats.total}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log(
    `Total: ${stats.total} | Migrated: ${stats.migrated} | Skipped: ${stats.skipped} | Errors: ${stats.errors}`
  );
  if (isDryRun) {
    console.log("\nDRY RUN - No changes made. Run without --dry-run to apply.");
  }
  console.log("=".repeat(80));

  // Drop old columns after successful migration (only when not dry-run, no errors, and not tenant-scoped)
  if (!isDryRun && stats.errors === 0 && !skipDrop && !tenantId) {
    await dropOldColumns();
  } else if (!isDryRun && tenantId) {
    console.log(
      "\n⚠️  Skipping column drop (tenant-scoped run). Run without --tenant-id to drop old columns."
    );
  } else if (!isDryRun && skipDrop) {
    console.log(
      "\n⚠️  Skipping column drop (--skip-drop). Run without it to drop old columns."
    );
  } else if (!isDryRun && stats.errors > 0) {
    console.log(
      "\n⚠️  Skipping column drop due to migration errors. Fix errors and re-run."
    );
  }
}

runMigration()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
