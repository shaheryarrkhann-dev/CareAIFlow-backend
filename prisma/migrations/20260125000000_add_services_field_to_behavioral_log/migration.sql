-- AlterTable: Add services field to behavioral_logs
-- This field stores an array of services for batch records (only populated for batch submissions)
-- It's optional and allows multiple services to be stored in a single behavioral log record

ALTER TABLE "behavioral_logs" ADD COLUMN IF NOT EXISTS "services" JSONB;

-- Add comment for documentation
COMMENT ON COLUMN "behavioral_logs"."services" IS 'Array of services for batch records (only populated for batch submissions)';
