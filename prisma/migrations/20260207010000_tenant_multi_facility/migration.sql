-- Drop the unique constraint on facilities.tenantId to allow multiple facilities per tenant
DROP INDEX IF EXISTS "facilities_tenantId_key";

-- Add index on tenantId for efficient queries (many facilities per tenant)
CREATE INDEX IF NOT EXISTS "facilities_tenantId_idx" ON "facilities"("tenantId");
