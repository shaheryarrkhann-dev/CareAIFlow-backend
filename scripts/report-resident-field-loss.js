#!/usr/bin/env node
/**
 * Estimate how many residents lost field values to the edit-mode blanking bug.
 *
 * Background: several form fields never hydrated in edit mode because the API
 * column name did not map back to the form key. They rendered blank, and saving
 * the form wrote that blank over the stored value. Affected, before the fix:
 *
 *   - service_plan_ncp_most_recent_date        (a stale hard-coded date list)
 *   - 8 emergency_legal_contacts_*_poa_* fields (columns drop "Legal")
 *   - 9 medical_providers_health_coverage_*     (fixed earlier this cycle)
 *
 * The values are NOT recoverable. /residents is a PHI endpoint, so
 * audit_logs.requestData stores every field as "REDACTED". This report only
 * tells you WHICH residents need data re-collected, and from where.
 *
 * Only residents edited at least once can have been affected, so the report is
 * scoped to updatedAt > createdAt. That still overcounts: a field left
 * deliberately blank looks identical to one that was wiped. Treat the numbers
 * as an upper bound, and the corroborated counts as the confident floor.
 *
 * READ-ONLY. Runs no writes. Point DATABASE_URL at the database you want to
 * inspect and run:
 *
 *   node scripts/report-resident-field-loss.js
 *   node scripts/report-resident-field-loss.js --list   # per-resident detail
 *
 * In development the Prisma client echoes every query, which interleaves with
 * the report. Prefix with NODE_ENV=production to silence it (that only affects
 * this process's log level, not which database it talks to - DATABASE_URL
 * decides that).
 */

const prisma = require("../src/lib/prisma");

const SUSPECT_FIELDS = [
  "service_plan_ncp_most_recent_date",
  "emergency_legal_contacts_legal_guardian_poa_name",
  "emergency_legal_contacts_legal_guardian_poa_type",
  "emergency_legal_contacts_legal_guardian_poa_phone",
  "emergency_legal_contacts_legal_guardian_poa_email",
  "emergency_legal_contacts_legal_guardian_poa_contact_info",
  "medical_providers_health_coverage_health_insurance_medicaid_client_id",
  "medical_providers_health_coverage_primary_care_provider_name",
  "medical_providers_health_coverage_primary_care_provider_phone",
  "medical_providers_health_coverage_pharmacy_name",
  "medical_providers_health_coverage_pharmacy_phone",
];

/**
 * Cases where another column asserts the missing value should exist. These are
 * the confident findings - a resident flagged "POA on file" with no POA name
 * did not simply skip the field.
 */
const CORROBORATED = [
  {
    label: "NCP marked on file, but no NCP date",
    flag: "service_plan_ncp_on_file",
    missing: "service_plan_ncp_most_recent_date",
    recoverFrom: "the resident's paper NCP or the care-plan document on file",
  },
  {
    label: "POA copy on file, but no POA name",
    flag: "emergency_legal_contacts_legal_guardian_poa_copy_on_file",
    missing: "emergency_legal_contacts_legal_guardian_poa_name",
    recoverFrom: "the scanned POA document in the resident's Legal folder",
  },
  {
    label: "POA recorded as existing, but no POA phone",
    flag: "emergency_legal_contacts_legal_guardian_poa_exists",
    missing: "emergency_legal_contacts_legal_guardian_poa_phone",
    recoverFrom: "the POA document or the primary emergency contact",
  },
];

const q = (sql) => prisma.$queryRawUnsafe(sql);
const n = (v) => Number(v ?? 0);

async function main() {
  const listMode = process.argv.includes("--list");

  const [{ total, edited }] = await q(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE "updatedAt" > "createdAt") AS edited
    FROM residents WHERE "deletedAt" IS NULL
  `);

  console.log(`\n  Residents: ${n(total)} total, ${n(edited)} edited at least once`);

  if (n(edited) === 0) {
    console.log(`\n  No resident has ever been edited - no exposure.\n`);
    return;
  }

  console.log(`\n  CONFIRMED - another field contradicts the blank:\n`);

  let confirmed = 0;
  for (const c of CORROBORATED) {
    const [row] = await q(`
      SELECT count(*) AS hits FROM residents
      WHERE "deletedAt" IS NULL AND "updatedAt" > "createdAt"
        AND "${c.flag}" IS NOT NULL
        AND "${c.flag}"::text NOT IN ('false','No','')
        AND "${c.missing}" IS NULL
    `);
    confirmed += n(row.hits);
    console.log(`    ${String(n(row.hits)).padStart(5)}  ${c.label}`);
    if (n(row.hits) > 0) console.log(`           re-collect from: ${c.recoverFrom}`);
  }

  console.log(`\n  UPPER BOUND - blank on an edited record, cause unknown:\n`);

  for (const field of SUSPECT_FIELDS) {
    const [row] = await q(`
      SELECT count(*) AS hits FROM residents
      WHERE "deletedAt" IS NULL AND "updatedAt" > "createdAt" AND "${field}" IS NULL
    `);
    console.log(`    ${String(n(row.hits)).padStart(5)}  ${field}`);
  }

  if (listMode && confirmed > 0) {
    console.log(`\n  Residents needing follow-up:\n`);
    for (const c of CORROBORATED) {
      const rows = await q(`
        SELECT id, resident_identification_full_legal_name AS name, "updatedAt"
        FROM residents
        WHERE "deletedAt" IS NULL AND "updatedAt" > "createdAt"
          AND "${c.flag}" IS NOT NULL
          AND "${c.flag}"::text NOT IN ('false','No','')
          AND "${c.missing}" IS NULL
        ORDER BY "updatedAt" DESC
      `);
      if (!rows.length) continue;
      console.log(`    ${c.label}`);
      for (const r of rows) {
        const when = new Date(r.updatedAt).toISOString().split("T")[0];
        console.log(`      ${r.id}  ${when}  ${r.name ?? "(no name)"}`);
      }
      console.log();
    }
  } else if (confirmed > 0) {
    console.log(`\n  Re-run with --list for the affected resident IDs.`);
  }

  console.log(
    `\n  Values cannot be restored from audit_logs - /residents is a PHI\n` +
      `  endpoint, so requestData is stored as "REDACTED". Re-collect from\n` +
      `  the source documents named above.\n`
  );
}

main()
  .catch((e) => {
    console.error("\n  Report failed:", e.message, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
