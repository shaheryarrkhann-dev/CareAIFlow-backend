-- AlterTable: Make behaviorType optional in behavioral_logs
-- This allows behavioral logs to be created without specifying a behavior type

ALTER TABLE "behavioral_logs" ALTER COLUMN "behaviorType" DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN "behavioral_logs"."behaviorType" IS 'Type of behavior (optional)';
