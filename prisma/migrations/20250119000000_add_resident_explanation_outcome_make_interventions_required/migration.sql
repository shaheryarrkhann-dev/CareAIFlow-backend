-- AlterTable: Add new fields and make interventions required
-- First, add the new optional fields
ALTER TABLE "behavioral_logs" ADD COLUMN "resident_explanation" TEXT;
ALTER TABLE "behavioral_logs" ADD COLUMN "outcome" TEXT;

-- Update existing records to have empty array for interventions if null
UPDATE "behavioral_logs" SET "interventions" = '[]'::json WHERE "interventions" IS NULL;

-- Make interventions required (NOT NULL)
ALTER TABLE "behavioral_logs" ALTER COLUMN "interventions" SET NOT NULL;
ALTER TABLE "behavioral_logs" ALTER COLUMN "interventions" SET DEFAULT '[]'::json;

