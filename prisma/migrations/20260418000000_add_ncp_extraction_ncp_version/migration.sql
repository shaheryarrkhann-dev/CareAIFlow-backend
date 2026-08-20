-- ncpVersion tracks DOCX regeneration. Table may be created via `db push` or a future migration on some DBs.
DO $$
BEGIN
  IF to_regclass('public.ncp_extractions') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE "ncp_extractions" ADD COLUMN IF NOT EXISTS "ncpVersion" INTEGER NOT NULL DEFAULT 1;
END $$;
