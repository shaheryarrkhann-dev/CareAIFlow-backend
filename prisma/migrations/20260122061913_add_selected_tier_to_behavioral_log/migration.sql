-- AlterTable: Add selectedTier field to behavioral_logs
-- This field stores the selected tier (e.g., "Tier 1 (.5-2)", "Tier 2 (2.1-6)", etc.)
-- It's optional and allows the tier to be saved with each behavior log entry

ALTER TABLE "behavioral_logs" ADD COLUMN IF NOT EXISTS "selectedTier" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "behavioral_logs"."selectedTier" IS 'Selected tier (e.g., "Tier 1 (.5-2)", "Tier 2 (2.1-6)", etc.) - saved with behavior log for PDF export';


