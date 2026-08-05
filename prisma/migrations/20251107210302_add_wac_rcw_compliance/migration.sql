-- AlterEnum: Keep NOTE_DELETED in enum (it's still used in schema and code)
-- The enum already has NOTE_DELETED from previous migration, so no enum changes needed

-- AlterTable
ALTER TABLE "notes" ALTER COLUMN "currentVersion" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "tenant_form_schemas" ADD COLUMN     "adminApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminApprovedAt" TIMESTAMP(3),
ADD COLUMN     "adminApprovedBy" TEXT,
ADD COLUMN     "complianceNotes" TEXT,
ADD COLUMN     "complianceVersion" TEXT,
ADD COLUMN     "isWacRcwCompliant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastComplianceCheck" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tenant_form_schemas_isWacRcwCompliant_idx" ON "tenant_form_schemas"("isWacRcwCompliant");

-- CreateIndex
CREATE INDEX "tenant_form_schemas_adminApproved_idx" ON "tenant_form_schemas"("adminApproved");
