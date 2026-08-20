-- Add VISITOR_QR_SIGN_IN to AuditAction enum (safe to run multiple times)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VISITOR_QR_SIGN_IN' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'VISITOR_QR_SIGN_IN';
  END IF;
END $$;
