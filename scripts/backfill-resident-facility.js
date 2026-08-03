/**
 * Data Backfill Script: Assign residents to a facility
 *
 * Residents historically had no facility link — they were scoped to the tenant
 * only. `Resident.facilityId` was added for the AFH New Resident Intake Form §1
 * ("Facility Name"), and is also required for occupancy reporting and for the
 * resident roster export to be facility-accurate.
 *
 * This script assigns every resident with a null facilityId to their tenant's
 * primary facility — the oldest by createdAt, matching how the platform already
 * defines "primary facility" elsewhere.
 *
 * Safe to re-run: only touches residents where facilityId IS NULL.
 * Tenants with no facility are reported and skipped.
 *
 * Usage:
 *   node scripts/backfill-resident-facility.js            # dry run (default)
 *   node scripts/backfill-resident-facility.js --apply    # write changes
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(
    `\nResident → facility backfill (${APPLY ? "APPLY" : "DRY RUN"})\n`
  );

  const pending = await prisma.resident.findMany({
    where: { facilityId: null, deletedAt: null },
    select: { id: true, tenantId: true, residentFullLegalName: true },
  });

  if (pending.length === 0) {
    console.log("Nothing to do — every active resident already has a facility.");
    return;
  }

  const tenantIds = [...new Set(pending.map((r) => r.tenantId))];
  console.log(
    `${pending.length} resident(s) without a facility across ${tenantIds.length} tenant(s).\n`
  );

  let updated = 0;
  let skipped = 0;

  for (const tenantId of tenantIds) {
    // Primary facility = oldest by createdAt (platform-wide convention)
    const facility = await prisma.facility.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });

    const residents = pending.filter((r) => r.tenantId === tenantId);

    if (!facility) {
      console.log(
        `  ⚠ tenant ${tenantId}: no facility exists — skipping ${residents.length} resident(s).`
      );
      console.log(
        `    Create a facility for this organization, then re-run this script.`
      );
      skipped += residents.length;
      continue;
    }

    console.log(
      `  tenant ${tenantId} → "${facility.name}" (${residents.length} resident(s))`
    );

    if (APPLY) {
      const result = await prisma.resident.updateMany({
        where: { tenantId, facilityId: null, deletedAt: null },
        data: { facilityId: facility.id },
      });
      updated += result.count;
    } else {
      updated += residents.length;
    }
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"}: ${updated} · Skipped: ${skipped}`
  );
  if (!APPLY && updated > 0) {
    console.log("Re-run with --apply to write these changes.");
  }
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
