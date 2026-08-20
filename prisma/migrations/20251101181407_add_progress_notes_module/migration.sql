-- Progress notes module (guarded: `residents` may already exist from earlier out-of-order migrations)

-- CreateEnum
DO $$ BEGIN
 CREATE TYPE "NoteType" AS ENUM ('Care', 'Behavior', 'Incident', 'StatusUpdate');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AuditAction enum values (type may not exist until baseline migration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NOTE_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'NOTE_CREATED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NOTE_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'NOTE_UPDATED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NOTE_EXPORTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'NOTE_EXPORTED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RESIDENT_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_CREATED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RESIDENT_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_UPDATED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RESIDENT_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_DELETED';
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "residents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "notes" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "note_versions" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "oldDescription" TEXT NOT NULL,
    "newDescription" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (resident schema may already have dropped legacy name columns)
CREATE INDEX IF NOT EXISTS "residents_tenantId_idx" ON "residents"("tenantId");
DO $$
BEGIN
  IF to_regclass('public.residents') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'residents' AND column_name = 'firstName'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'residents' AND column_name = 'lastName'
  ) THEN
    CREATE INDEX IF NOT EXISTS "residents_tenantId_firstName_lastName_idx" ON "residents"("tenantId", "firstName", "lastName");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "notes_residentId_idx" ON "notes"("residentId");
CREATE INDEX IF NOT EXISTS "notes_staffId_idx" ON "notes"("staffId");
CREATE INDEX IF NOT EXISTS "notes_tenantId_idx" ON "notes"("tenantId");
CREATE INDEX IF NOT EXISTS "notes_type_idx" ON "notes"("type");
CREATE INDEX IF NOT EXISTS "notes_createdAt_idx" ON "notes"("createdAt");
CREATE INDEX IF NOT EXISTS "notes_tenantId_residentId_idx" ON "notes"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "notes_tenantId_type_idx" ON "notes"("tenantId", "type");
CREATE INDEX IF NOT EXISTS "notes_tenantId_createdAt_idx" ON "notes"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "note_versions_noteId_idx" ON "note_versions"("noteId");
CREATE INDEX IF NOT EXISTS "note_versions_editedBy_idx" ON "note_versions"("editedBy");
CREATE INDEX IF NOT EXISTS "note_versions_editedAt_idx" ON "note_versions"("editedAt");

-- AddForeignKey
DO $$
BEGIN
  IF to_regclass('public.residents') IS NULL OR to_regclass('public.tenants') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE "residents" ADD CONSTRAINT "residents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notes') IS NULL OR to_regclass('public.residents') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notes') IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notes') IS NULL OR to_regclass('public.tenants') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('public.note_versions') IS NULL OR to_regclass('public.notes') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF to_regclass('public.note_versions') IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
