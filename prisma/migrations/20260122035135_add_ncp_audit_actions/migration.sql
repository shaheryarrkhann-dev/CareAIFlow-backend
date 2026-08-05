-- Add NCP (Negotiated Care Plan) PHI audit actions to AuditAction enum
-- This migration is safe to run multiple times. Runs only when AuditAction type exists.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_EXTRACT_NCP' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_EXTRACT_NCP';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_UPDATE_NCP' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_UPDATE_NCP';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_GENERATE_NCP_DOCX' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_GENERATE_NCP_DOCX';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_DOWNLOAD_NCP_DOCX' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_DOWNLOAD_NCP_DOCX';
  END IF;
END $$;
