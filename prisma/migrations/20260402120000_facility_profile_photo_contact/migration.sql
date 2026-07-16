-- Facility profile: optional photo (URL + S3) and contact information
ALTER TABLE "facilities" ADD COLUMN "profile_photo_url" VARCHAR(2048);
ALTER TABLE "facilities" ADD COLUMN "profile_photo_s3_key" VARCHAR(1024);
ALTER TABLE "facilities" ADD COLUMN "contact_information" TEXT;
