-- Per-facility active resident enrollment cap (default 6; Super Admin may set 7 or 8)
ALTER TABLE "facilities" ADD COLUMN "resident_capacity_limit" INTEGER NOT NULL DEFAULT 6;

-- Link residents to the facility they are enrolled at
ALTER TABLE "residents" ADD COLUMN "facilityId" TEXT;

-- Backfill: assign each resident to the oldest facility in their tenant (when one exists)
UPDATE "residents" AS r
SET "facilityId" = (
  SELECT f."id"
  FROM "facilities" AS f
  WHERE f."tenantId" = r."tenantId"
  ORDER BY f."createdAt" ASC
  LIMIT 1
)
WHERE r."facilityId" IS NULL;

CREATE INDEX "residents_facilityId_idx" ON "residents"("facilityId");
CREATE INDEX "residents_facilityId_status_idx" ON "residents"("facilityId", "status");

ALTER TABLE "residents"
ADD CONSTRAINT "residents_facilityId_fkey"
FOREIGN KEY ("facilityId") REFERENCES "facilities"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
