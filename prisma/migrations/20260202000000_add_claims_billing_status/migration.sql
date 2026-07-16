-- CreateEnum: ClaimsBillingStatus (billing status for claims billing records; system-only, not in Excel export)
CREATE TYPE "ClaimsBillingStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'OVERDUE');

-- AlterTable: add billing status columns to claims_billing_records
ALTER TABLE "claims_billing_records" ADD COLUMN IF NOT EXISTS "billingStatus" "ClaimsBillingStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "claims_billing_records" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(10,2);
ALTER TABLE "claims_billing_records" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "claims_billing_records_billingStatus_idx" ON "claims_billing_records"("billingStatus");
