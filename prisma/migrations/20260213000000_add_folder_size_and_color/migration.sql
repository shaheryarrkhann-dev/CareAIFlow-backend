-- CreateEnum
CREATE TYPE "FolderSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable facility_folders: add size (default MEDIUM) and color
ALTER TABLE "facility_folders" ADD COLUMN "size" "FolderSize" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "facility_folders" ADD COLUMN "color" TEXT;

-- AlterTable staff_folders: add size (default MEDIUM) and color
ALTER TABLE "staff_folders" ADD COLUMN "size" "FolderSize" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "staff_folders" ADD COLUMN "color" TEXT;
