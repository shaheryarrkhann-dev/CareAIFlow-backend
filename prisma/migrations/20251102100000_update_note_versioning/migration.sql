-- Update Note Versioning System
-- Changes:
-- 1. Rename 'version' to 'currentVersion' in notes table
-- 2. Refactor note_versions to store full note snapshots (not just old/new descriptions)
-- 3. Versions start at 0 (creation), then 1, 2, 3... on edits

BEGIN;

-- Step 1: Rename 'version' column to 'currentVersion' in notes table
ALTER TABLE "notes" RENAME COLUMN "version" TO "currentVersion";

-- Step 2: Drop old columns from note_versions table
ALTER TABLE "note_versions"
  DROP COLUMN IF EXISTS "oldDescription",
  DROP COLUMN IF EXISTS "newDescription",
  DROP COLUMN IF EXISTS "editedBy",
  DROP COLUMN IF EXISTS "editedAt";

-- Step 3: Drop old foreign key constraint if exists (editedBy -> users)
-- Note: This might fail if the constraint doesn't exist, that's okay
ALTER TABLE "note_versions" DROP CONSTRAINT IF EXISTS "note_versions_editedBy_fkey";

-- Step 4: Add new columns to note_versions table
ALTER TABLE "note_versions"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "residentId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "residentName" TEXT,
  ADD COLUMN IF NOT EXISTS "staffId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "type" "NoteType" NOT NULL DEFAULT 'Care',
  ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 5: Backfill existing note_versions with data from notes table
-- This handles existing version records by populating them with note data
UPDATE "note_versions" nv
SET
  "version" = COALESCE((SELECT MAX(nv2."version") FROM "note_versions" nv2 WHERE nv2."noteId" = nv."noteId"), -1) + 1,
  "residentId" = n."residentId",
  "residentName" = n."residentName",
  "staffId" = n."staffId",
  "tenantId" = n."tenantId",
  "type" = n."type",
  "description" = n."description",
  "createdBy" = n."staffId", -- Use original creator as fallback
  "createdAt" = COALESCE(n."createdAt", CURRENT_TIMESTAMP)
FROM "notes" n
WHERE nv."noteId" = n."id";

-- Step 6: For existing notes without version records, create version 0
-- This ensures all notes have at least a version 0 record
INSERT INTO "note_versions" (
  "id",
  "noteId",
  "version",
  "residentId",
  "residentName",
  "staffId",
  "tenantId",
  "type",
  "description",
  "createdBy",
  "createdAt"
)
SELECT
  gen_random_uuid(),
  n."id",
  0,
  n."residentId",
  n."residentName",
  n."staffId",
  n."tenantId",
  n."type",
  n."description",
  n."staffId",
  n."createdAt"
FROM "notes" n
WHERE NOT EXISTS (
  SELECT 1 FROM "note_versions" nv
  WHERE nv."noteId" = n."id" AND nv."version" = 0
);

-- Step 7: Update currentVersion to 0 for notes that don't have versions yet
UPDATE "notes" n
SET "currentVersion" = 0
WHERE NOT EXISTS (
  SELECT 1 FROM "note_versions" nv WHERE nv."noteId" = n."id"
);

-- Step 8: Add foreign key constraints
ALTER TABLE "note_versions"
  ADD CONSTRAINT "note_versions_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "note_versions_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 9: Add indexes
CREATE INDEX IF NOT EXISTS "note_versions_noteId_version_idx" ON "note_versions"("noteId", "version");
CREATE INDEX IF NOT EXISTS "note_versions_createdBy_idx" ON "note_versions"("createdBy");
CREATE INDEX IF NOT EXISTS "note_versions_createdAt_idx" ON "note_versions"("createdAt");

-- Step 10: Add unique constraint on (noteId, version)
ALTER TABLE "note_versions"
  ADD CONSTRAINT "note_versions_noteId_version_key" UNIQUE ("noteId", "version");

-- Step 11: Remove default values from columns (they're now populated)
ALTER TABLE "note_versions"
  ALTER COLUMN "version" DROP DEFAULT,
  ALTER COLUMN "residentId" DROP DEFAULT,
  ALTER COLUMN "staffId" DROP DEFAULT,
  ALTER COLUMN "tenantId" DROP DEFAULT,
  ALTER COLUMN "type" DROP DEFAULT,
  ALTER COLUMN "description" DROP DEFAULT,
  ALTER COLUMN "createdBy" DROP DEFAULT;

COMMIT;

