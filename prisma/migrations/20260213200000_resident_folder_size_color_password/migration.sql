-- AlterTable resident_folders: add size (default MEDIUM), color, passwordHash (FolderSize enum already exists)
ALTER TABLE "resident_folders" ADD COLUMN IF NOT EXISTS "size" "FolderSize" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "resident_folders" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "resident_folders" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
