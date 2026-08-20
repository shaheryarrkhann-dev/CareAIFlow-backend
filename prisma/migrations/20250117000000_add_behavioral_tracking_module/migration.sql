-- CreateEnum: BehaviorType
DO $$ BEGIN
 CREATE TYPE "BehaviorType" AS ENUM ('Aggression', 'SelfHarm', 'Withdrawal', 'NonCompliance', 'MoodChanges', 'Anxiety', 'Agitation', 'VerbalAbuse', 'PhysicalAbuse', 'PropertyDamage', 'Wandering', 'InappropriateBehavior', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: SeverityLevel
DO $$ BEGIN
 CREATE TYPE "SeverityLevel" AS ENUM ('Low', 'Moderate', 'High');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: InterventionType
DO $$ BEGIN
 CREATE TYPE "InterventionType" AS ENUM ('Redirect', 'Counseling', 'PrnMedication', 'TimeOut', 'DeEscalation', 'EnvironmentalModification', 'StaffSupport', 'FamilyNotification', 'PhysicianNotification', 'EmergencyResponse', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add new audit actions to AuditAction enum (type is created in a later baseline migration in this repo)
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
   RETURN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BEHAVIORAL_LOG_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_LOG_CREATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BEHAVIORAL_LOG_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_LOG_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BEHAVIORAL_LOG_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_LOG_DELETED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BEHAVIORAL_NOTE_GENERATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_NOTE_GENERATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BEHAVIORAL_NOTE_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_NOTE_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BEHAVIORAL_REPORT_EXPORTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_REPORT_EXPORTED';
 END IF;
END $$;

-- CreateTable: behavioral_logs
CREATE TABLE IF NOT EXISTS "behavioral_logs" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "behaviorType" "BehaviorType" NOT NULL,
    "severity" "SeverityLevel" NOT NULL,
    "trigger" TEXT,
    "staffNotes" TEXT,
    "interventions" JSONB,
    "interventionDetails" TEXT,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT,
    "prnRecordId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,

    CONSTRAINT "behavioral_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: behavioral_notes
CREATE TABLE IF NOT EXISTS "behavioral_notes" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "narrative" TEXT NOT NULL,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "generatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "behavioral_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: behavioral_note_versions
CREATE TABLE IF NOT EXISTS "behavioral_note_versions" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "narrative" TEXT NOT NULL,
    "isAiGenerated" BOOLEAN NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavioral_note_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "behavioral_logs_residentId_idx" ON "behavioral_logs"("residentId");
CREATE INDEX IF NOT EXISTS "behavioral_logs_tenantId_idx" ON "behavioral_logs"("tenantId");
CREATE INDEX IF NOT EXISTS "behavioral_logs_staffId_idx" ON "behavioral_logs"("staffId");
CREATE INDEX IF NOT EXISTS "behavioral_logs_dateTime_idx" ON "behavioral_logs"("dateTime");
CREATE INDEX IF NOT EXISTS "behavioral_logs_behaviorType_idx" ON "behavioral_logs"("behaviorType");
CREATE INDEX IF NOT EXISTS "behavioral_logs_severity_idx" ON "behavioral_logs"("severity");
CREATE INDEX IF NOT EXISTS "behavioral_logs_tenantId_residentId_idx" ON "behavioral_logs"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "behavioral_logs_tenantId_residentId_dateTime_idx" ON "behavioral_logs"("tenantId", "residentId", "dateTime");
CREATE INDEX IF NOT EXISTS "behavioral_logs_tenantId_dateTime_idx" ON "behavioral_logs"("tenantId", "dateTime");
CREATE INDEX IF NOT EXISTS "behavioral_logs_deletedAt_idx" ON "behavioral_logs"("deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "behavioral_notes_residentId_idx" ON "behavioral_notes"("residentId");
CREATE INDEX IF NOT EXISTS "behavioral_notes_tenantId_idx" ON "behavioral_notes"("tenantId");
CREATE INDEX IF NOT EXISTS "behavioral_notes_startDate_idx" ON "behavioral_notes"("startDate");
CREATE INDEX IF NOT EXISTS "behavioral_notes_endDate_idx" ON "behavioral_notes"("endDate");
CREATE INDEX IF NOT EXISTS "behavioral_notes_tenantId_residentId_idx" ON "behavioral_notes"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "behavioral_notes_tenantId_residentId_startDate_endDate_idx" ON "behavioral_notes"("tenantId", "residentId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "behavioral_notes_deletedAt_idx" ON "behavioral_notes"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "behavioral_note_versions_noteId_version_key" ON "behavioral_note_versions"("noteId", "version");
CREATE INDEX IF NOT EXISTS "behavioral_note_versions_noteId_idx" ON "behavioral_note_versions"("noteId");
CREATE INDEX IF NOT EXISTS "behavioral_note_versions_noteId_version_idx" ON "behavioral_note_versions"("noteId", "version");
CREATE INDEX IF NOT EXISTS "behavioral_note_versions_createdBy_idx" ON "behavioral_note_versions"("createdBy");
CREATE INDEX IF NOT EXISTS "behavioral_note_versions_createdAt_idx" ON "behavioral_note_versions"("createdAt");

-- AddForeignKey (guarded: baseline `tenants`/`users`/`prn_records` migrations run later in this repo)
DO $$
BEGIN
  IF to_regclass('public.behavioral_logs') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.tenants') IS NOT NULL THEN
    BEGIN
      ALTER TABLE "behavioral_logs" ADD CONSTRAINT "behavioral_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
  IF to_regclass('public.users') IS NOT NULL THEN
    BEGIN
      ALTER TABLE "behavioral_logs" ADD CONSTRAINT "behavioral_logs_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
  IF to_regclass('public.prn_records') IS NOT NULL THEN
    BEGIN
      ALTER TABLE "behavioral_logs" ADD CONSTRAINT "behavioral_logs_prnRecordId_fkey" FOREIGN KEY ("prnRecordId") REFERENCES "prn_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.behavioral_notes') IS NULL OR to_regclass('public.tenants') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE "behavioral_notes" ADD CONSTRAINT "behavioral_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('public.behavioral_note_versions') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.behavioral_notes') IS NOT NULL THEN
    BEGIN
      ALTER TABLE "behavioral_note_versions" ADD CONSTRAINT "behavioral_note_versions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "behavioral_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
  IF to_regclass('public.users') IS NOT NULL THEN
    BEGIN
      ALTER TABLE "behavioral_note_versions" ADD CONSTRAINT "behavioral_note_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

