-- AlterTable (pdf_templates is created in a later migration in this repo)
DO $$
BEGIN
  IF to_regclass('public.pdf_templates') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "pdf_templates" ADD COLUMN IF NOT EXISTS "fileHash" TEXT;
END $$;

-- CreateIndex
DO $$
BEGIN
  IF to_regclass('public.pdf_templates') IS NULL THEN
    RETURN;
  END IF;
  CREATE INDEX IF NOT EXISTS "pdf_templates_tenantId_fileHash_idx" ON "pdf_templates"("tenantId", "fileHash");
END $$;
