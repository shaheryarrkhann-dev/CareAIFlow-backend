-- Optional facility contact fields for PDF letterhead
ALTER TABLE "facilities" ADD COLUMN "contact_email" VARCHAR(255);
ALTER TABLE "facilities" ADD COLUMN "website" VARCHAR(2048);
