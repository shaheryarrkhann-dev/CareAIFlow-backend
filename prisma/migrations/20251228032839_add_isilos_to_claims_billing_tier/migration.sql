-- AlterTable: Add isILOS field to claims_billing_tiers
ALTER TABLE "claims_billing_tiers" ADD COLUMN IF NOT EXISTS "isILOS" BOOLEAN NOT NULL DEFAULT false;

-- Drop existing unique constraint
DROP INDEX IF EXISTS "claims_billing_tiers_tenantId_tierNumber_key";

-- Create new unique constraint with isILOS
CREATE UNIQUE INDEX IF NOT EXISTS "claims_billing_tiers_tenantId_tierNumber_isILOS_key" ON "claims_billing_tiers"("tenantId", "tierNumber", "isILOS");

-- Create index for isILOS
CREATE INDEX IF NOT EXISTS "claims_billing_tiers_tenantId_isILOS_idx" ON "claims_billing_tiers"("tenantId", "isILOS");

