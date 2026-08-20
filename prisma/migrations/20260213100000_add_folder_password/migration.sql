-- AlterTable facility_folders: add passwordHash
ALTER TABLE "facility_folders" ADD COLUMN "passwordHash" TEXT;

-- AlterTable staff_folders: add passwordHash
ALTER TABLE "staff_folders" ADD COLUMN "passwordHash" TEXT;
