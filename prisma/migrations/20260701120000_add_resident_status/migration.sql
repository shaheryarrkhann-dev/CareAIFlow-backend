-- Add Active/Inactive status for residents (inactive records are retained, not deleted)
CREATE TYPE "ResidentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "residents"
ADD COLUMN "status" "ResidentStatus" NOT NULL DEFAULT 'ACTIVE';

-- Legacy soft-deleted residents become inactive
UPDATE "residents"
SET "status" = 'INACTIVE'
WHERE "deletedAt" IS NOT NULL;

CREATE INDEX "residents_status_idx" ON "residents"("status");
CREATE INDEX "residents_tenantId_status_idx" ON "residents"("tenantId", "status");
