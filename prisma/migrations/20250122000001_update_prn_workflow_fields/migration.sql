-- Migration: Update PRN Workflow Fields
-- Phase 2: PRN Medications Workflow Enhancement
-- Guarded: prn_records may not exist on shadow DB until baseline EMAR is applied.

DO $$
BEGIN
  IF to_regclass('public.prn_records') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "prn_records"
    ADD COLUMN IF NOT EXISTS "whyGiven" TEXT,
    ADD COLUMN IF NOT EXISTS "symptomsNoted" TEXT,
    ADD COLUMN IF NOT EXISTS "effectiveness" TEXT;

  UPDATE "prn_records"
  SET "whyGiven" = "symptom"
  WHERE "whyGiven" IS NULL AND "symptom" IS NOT NULL;

  UPDATE "prn_records"
  SET "whyGiven" = 'Migrated from existing record'
  WHERE "whyGiven" IS NULL;

  COMMENT ON COLUMN "prn_records"."whyGiven" IS 'Why the PRN was given (reason for administration)';
  COMMENT ON COLUMN "prn_records"."symptomsNoted" IS 'Symptoms noted at time of PRN administration';
  COMMENT ON COLUMN "prn_records"."effectiveness" IS 'Effectiveness of medication (follow-up after administration)';
END $$;
