-- Allow user delete by setting user FKs to ON DELETE SET NULL and making columns nullable.
-- Preserves audit/history records while allowing user deletion.

-- notes.staffId
ALTER TABLE "notes" DROP CONSTRAINT IF EXISTS "notes_staffId_fkey";
ALTER TABLE "notes" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "notes" ADD CONSTRAINT "notes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- note_versions.staffId
ALTER TABLE "note_versions" DROP CONSTRAINT IF EXISTS "note_versions_staffId_fkey";
ALTER TABLE "note_versions" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- note_versions.createdBy
ALTER TABLE "note_versions" DROP CONSTRAINT IF EXISTS "note_versions_createdBy_fkey";
ALTER TABLE "note_versions" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- mar_records.caregiverId (table may be missing on shadow DB if EMAR baseline was never applied)
DO $$
BEGIN
  IF to_regclass('public.mar_records') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "mar_records" DROP CONSTRAINT IF EXISTS "mar_records_caregiverId_fkey";
  ALTER TABLE "mar_records" ALTER COLUMN "caregiverId" DROP NOT NULL;
  ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;

-- prn_records.caregiverId
DO $$
BEGIN
  IF to_regclass('public.prn_records') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "prn_records" DROP CONSTRAINT IF EXISTS "prn_records_caregiverId_fkey";
  ALTER TABLE "prn_records" ALTER COLUMN "caregiverId" DROP NOT NULL;
  ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;

-- vital_signs.recordedBy
DO $$
BEGIN
  IF to_regclass('public.vital_signs') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "vital_signs" DROP CONSTRAINT IF EXISTS "vital_signs_recordedBy_fkey";
  ALTER TABLE "vital_signs" ALTER COLUMN "recordedBy" DROP NOT NULL;
  ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;

-- behavioral_logs.staffId
DO $$
BEGIN
  IF to_regclass('public.behavioral_logs') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "behavioral_logs" DROP CONSTRAINT IF EXISTS "behavioral_logs_staffId_fkey";
  ALTER TABLE "behavioral_logs" ALTER COLUMN "staffId" DROP NOT NULL;
  ALTER TABLE "behavioral_logs" ADD CONSTRAINT "behavioral_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;

-- behavioral_note_versions.createdBy
DO $$
BEGIN
  IF to_regclass('public.behavioral_note_versions') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "behavioral_note_versions" DROP CONSTRAINT IF EXISTS "behavioral_note_versions_createdBy_fkey";
  ALTER TABLE "behavioral_note_versions" ALTER COLUMN "createdBy" DROP NOT NULL;
  ALTER TABLE "behavioral_note_versions" ADD CONSTRAINT "behavioral_note_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;

-- care_plans.createdBy
ALTER TABLE "care_plans" DROP CONSTRAINT IF EXISTS "care_plans_createdBy_fkey";
ALTER TABLE "care_plans" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- care_plan_versions.createdBy
ALTER TABLE "care_plan_versions" DROP CONSTRAINT IF EXISTS "care_plan_versions_createdBy_fkey";
ALTER TABLE "care_plan_versions" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- care_library.createdBy
ALTER TABLE "care_library" DROP CONSTRAINT IF EXISTS "care_library_createdBy_fkey";
ALTER TABLE "care_library" ALTER COLUMN "createdBy" DROP NOT NULL;
ALTER TABLE "care_library" ADD CONSTRAINT "care_library_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
