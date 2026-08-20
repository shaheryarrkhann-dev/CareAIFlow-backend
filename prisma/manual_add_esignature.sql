-- Add e-signature columns to residents (run manually if not using db push)
-- Run this against your database if you prefer not to use prisma db push

ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "e_signature_url" TEXT,
  ADD COLUMN IF NOT EXISTS "e_signature_s3_key" TEXT,
  ADD COLUMN IF NOT EXISTS "e_signature_signed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "e_signature_legal_text" TEXT;
