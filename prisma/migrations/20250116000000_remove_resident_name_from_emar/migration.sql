-- Remove residentName column from eMAR models (when those tables already exist).
-- Resident names are now fetched dynamically from form submissions.
-- Guarded: EMAR DDL was moved out of-order; shadow DB may not have these tables yet.

DO $$
BEGIN
  IF to_regclass('public.medications') IS NOT NULL THEN
    ALTER TABLE "medications" DROP COLUMN IF EXISTS "residentName";
  END IF;
  IF to_regclass('public.mar_records') IS NOT NULL THEN
    ALTER TABLE "mar_records" DROP COLUMN IF EXISTS "residentName";
  END IF;
  IF to_regclass('public.prn_records') IS NOT NULL THEN
    ALTER TABLE "prn_records" DROP COLUMN IF EXISTS "residentName";
  END IF;
  IF to_regclass('public.vital_signs') IS NOT NULL THEN
    ALTER TABLE "vital_signs" DROP COLUMN IF EXISTS "residentName";
  END IF;
END $$;
