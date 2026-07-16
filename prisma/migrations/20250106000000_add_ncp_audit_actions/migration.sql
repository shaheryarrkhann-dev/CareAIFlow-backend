-- Add NCP (Negotiated Care Plan) PHI audit actions to AuditAction enum
-- This migration is safe to run multiple times
-- HIPAA compliance: These actions track access to Protected Health Information (PHI) for NCP extractions

DO $$
BEGIN
  -- NCP PHI Extract action (extracting data from PDF)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_EXTRACT_NCP' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_EXTRACT_NCP';
  END IF;

  -- NCP PHI Update action (updating extracted data)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_UPDATE_NCP' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_UPDATE_NCP';
  END IF;

  -- NCP PHI Generate DOCX action (generating DOCX from extracted data)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_GENERATE_NCP_DOCX' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_GENERATE_NCP_DOCX';
  END IF;

  -- NCP PHI Download DOCX action (downloading generated DOCX)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PHI_DOWNLOAD_NCP_DOCX' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
    ALTER TYPE "AuditAction" ADD VALUE 'PHI_DOWNLOAD_NCP_DOCX';
  END IF;
END $$;
