-- Migration: Update MAR Status Enum and Add Reason Fields
-- Phase 1: Medication Administration Status Options
-- Guarded: mar_records / MarStatus may not exist on shadow DB until baseline EMAR is applied.

-- Add NotGiven if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarStatus') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NotGiven' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MarStatus')) THEN
    ALTER TYPE "MarStatus" ADD VALUE 'NotGiven';
  END IF;
END $$;

-- Add Refused if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarStatus') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Refused' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MarStatus')) THEN
    ALTER TYPE "MarStatus" ADD VALUE 'Refused';
  END IF;
END $$;

-- Step 2: Add new columns to mar_records table (only if table exists)
DO $$
BEGIN
  IF to_regclass('public.mar_records') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "mar_records"
    ADD COLUMN IF NOT EXISTS "notGivenReason" TEXT,
    ADD COLUMN IF NOT EXISTS "refusedReason" TEXT;
END $$;

-- Step 3: Migrate existing data (only if table exists)
DO $$
BEGIN
  IF to_regclass('public.mar_records') IS NULL THEN
    RETURN;
  END IF;
  UPDATE "mar_records"
  SET "status" = 'Given'::"MarStatus"
  WHERE "status"::text = 'Late';
END $$;

-- Step 4: Add comments for documentation
DO $$
BEGIN
  IF to_regclass('public.mar_records') IS NULL THEN
    RETURN;
  END IF;
  COMMENT ON COLUMN "mar_records"."notGivenReason" IS 'Reason when medication status is NotGiven (e.g., "out of stock", "held due to vitals")';
  COMMENT ON COLUMN "mar_records"."refusedReason" IS 'Reason when medication status is Refused (e.g., "refused by resident")';
END $$;
