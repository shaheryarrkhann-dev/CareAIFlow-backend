-- Migration: Update MAR Status Enum and Add Reason Fields
-- Phase 1: Medication Administration Status Options

-- Step 1: Add new enum values to MarStatus
-- Note: PostgreSQL requires enum values to be committed before use
-- We'll add them first, then update data in application layer if needed

-- Add NotGiven if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NotGiven' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MarStatus')) THEN
    ALTER TYPE "MarStatus" ADD VALUE 'NotGiven';
  END IF;
END $$;

-- Add Refused if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Refused' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MarStatus')) THEN
    ALTER TYPE "MarStatus" ADD VALUE 'Refused';
  END IF;
END $$;

-- Step 2: Add new columns to mar_records table
ALTER TABLE "mar_records"
  ADD COLUMN IF NOT EXISTS "notGivenReason" TEXT,
  ADD COLUMN IF NOT EXISTS "refusedReason" TEXT;

-- Step 3: Migrate existing data
-- Note: Due to PostgreSQL enum transaction limitations, we'll update Late first (uses existing enum)
-- The application layer will handle mapping Missed/Skipped/Hold to NotGiven when records are accessed
UPDATE "mar_records"
SET "status" = 'Given'::"MarStatus"
WHERE "status"::text = 'Late';

-- For Missed, Skipped, Hold -> we'll let the application handle the mapping
-- since we can't safely use the new enum value in the same transaction
-- The application code already handles this mapping in mar.service.js

-- Step 4: Add comments for documentation
COMMENT ON COLUMN "mar_records"."notGivenReason" IS 'Reason when medication status is NotGiven (e.g., "out of stock", "held due to vitals")';
COMMENT ON COLUMN "mar_records"."refusedReason" IS 'Reason when medication status is Refused (e.g., "refused by resident")';

