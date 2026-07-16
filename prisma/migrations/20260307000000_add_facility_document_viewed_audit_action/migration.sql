-- Add FACILITY_DOCUMENT_VIEWED to AuditAction enum (safe to run if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'FACILITY_DOCUMENT_VIEWED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')
  ) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_DOCUMENT_VIEWED';
  END IF;
END
$$;
