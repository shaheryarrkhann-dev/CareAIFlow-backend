-- Add deletedAt and photo-related fields to residents table
-- These fields are defined in the Prisma schema but were missing from the database

-- Add deletedAt column for soft delete functionality
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Add resident photo fields (from resident_fields.json)
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_photo" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_photo_verified" BOOLEAN;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_photo_date_taken" DATE;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_photo_notes" TEXT;

-- Create index on deletedAt for better query performance
CREATE INDEX IF NOT EXISTS "residents_deletedAt_idx" ON "residents"("deletedAt");


