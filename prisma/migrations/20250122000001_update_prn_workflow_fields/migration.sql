-- Migration: Update PRN Workflow Fields
-- Phase 2: PRN Medications Workflow Enhancement

-- Step 1: Add new columns to prn_records table (nullable initially)
ALTER TABLE "prn_records"
  ADD COLUMN IF NOT EXISTS "whyGiven" TEXT,
  ADD COLUMN IF NOT EXISTS "symptomsNoted" TEXT,
  ADD COLUMN IF NOT EXISTS "effectiveness" TEXT;

-- Step 2: Migrate existing data
-- Copy symptom field to whyGiven for backward compatibility
UPDATE "prn_records"
SET "whyGiven" = "symptom"
WHERE "whyGiven" IS NULL AND "symptom" IS NOT NULL;

-- Set default for whyGiven if still null (for existing records)
UPDATE "prn_records"
SET "whyGiven" = 'Migrated from existing record'
WHERE "whyGiven" IS NULL;

-- Step 3: Add comments for documentation
COMMENT ON COLUMN "prn_records"."whyGiven" IS 'Why the PRN was given (reason for administration)';
COMMENT ON COLUMN "prn_records"."symptomsNoted" IS 'Symptoms noted at time of PRN administration';
COMMENT ON COLUMN "prn_records"."effectiveness" IS 'Effectiveness of medication (follow-up after administration)';

