-- AFH New Resident Intake Form — Sections 1 & 2
--
-- Adds the fields required by "AFH New Resident Intake Form.docx":
--   §1 General Information            — name parts, height, weight, about me, facility
--   §2 Emergency Contacts & Responsible Party — contact detail + legal representative
--
-- Every column is nullable and additive. No existing column is dropped, renamed
-- or retyped, so this is safe to apply to a populated production database.
--
-- NOTE ON EMBEDDING COLUMNS: this migration deliberately does not touch
-- pdf_embeddings.embedding or wac_rcw_regulations.embedding. Those are
-- vector(1536) (see 20250120000000_fix_embedding_vector_type) while
-- schema.prisma declares them as String?, so `prisma db push` reverts them to
-- text. Applying schema changes through migrations avoids that.

-- ---------------------------------------------------------------------------
-- §1 General Information
-- ---------------------------------------------------------------------------

-- Name parts. resident_identification_full_legal_name is retained and composed
-- from these, so existing consumers (NCP extraction, care plans, billing,
-- PDF reports) continue to read a single full name.
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_first_name"  TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_middle_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_last_name"   TEXT;

ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_height"   TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_weight"   TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_about_me" TEXT;

-- Facility the resident lives in ("Facility Name *" on the intake form).
-- Previously residents were scoped to tenant only, which left the resident
-- roster export unable to filter by facility and made occupancy reporting
-- impossible. Distinct from the external_facility_* columns, which describe
-- referring/external facilities rather than the resident's own home.
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "facility_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'residents_facility_id_fkey'
  ) THEN
    ALTER TABLE "residents"
      ADD CONSTRAINT "residents_facility_id_fkey"
      FOREIGN KEY ("facility_id") REFERENCES "facilities"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "residents_facility_id_idx"          ON "residents"("facility_id");
CREATE INDEX IF NOT EXISTS "residents_tenantId_facility_id_idx" ON "residents"("tenantId", "facility_id");

-- ---------------------------------------------------------------------------
-- §2 Emergency Contacts & Responsible Party
-- ---------------------------------------------------------------------------

-- Primary emergency contact: alternate phone, address and email.
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_primary_contact_phone_alternate" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_primary_contact_address"         TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_primary_contact_email"           TEXT;

-- Legal representative: explicit type, phone and email. The older generic
-- ..._legal_guardian_poa_contact_info column is left untouched for existing rows.
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_type"          TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_phone"         TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_email"         TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_copy_attached" BOOLEAN;
