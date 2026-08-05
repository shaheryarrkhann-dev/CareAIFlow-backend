-- AlterTable: Add observedBehaviors field to behavioral_logs
-- This field stores an array of behavior names (string[]) as JSON
-- It's optional and allows multiple behaviors to be associated with a single log entry

ALTER TABLE "behavioral_logs" ADD COLUMN IF NOT EXISTS "observedBehaviors" JSONB;

-- Add comment for documentation
COMMENT ON COLUMN "behavioral_logs"."observedBehaviors" IS 'Array of behavior names (string[]) - allows multiple behaviors per log entry';
