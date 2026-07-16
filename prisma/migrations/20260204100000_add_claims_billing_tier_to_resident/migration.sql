-- AlterTable: Add claims_billing_tier_id to residents
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "claims_billing_tier_id" TEXT;

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_claims_billing_tier_id_fkey"
  FOREIGN KEY ("claims_billing_tier_id") REFERENCES "claims_billing_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "residents_claims_billing_tier_id_idx" ON "residents"("claims_billing_tier_id");
