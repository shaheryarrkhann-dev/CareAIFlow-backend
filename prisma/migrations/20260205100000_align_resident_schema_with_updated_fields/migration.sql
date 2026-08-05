-- Align resident schema with updated resident_fields.json
-- Renames and adds columns to match the new field structure
-- Uses DO blocks for idempotent renames (PostgreSQL has no RENAME COLUMN IF EXISTS)

-- Emergency / Legal Contacts: Rename primary/secondary contact columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='emergency_legal_contacts_primary_emergency_contact_name') THEN
    ALTER TABLE "residents" RENAME COLUMN "emergency_legal_contacts_primary_emergency_contact_name" TO "emergency_legal_contacts_primary_contact_name";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='emergency_legal_contacts_primary_emergency_contact_relationship') THEN
    ALTER TABLE "residents" RENAME COLUMN "emergency_legal_contacts_primary_emergency_contact_relationship" TO "emergency_legal_contacts_primary_contact_relationship";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='emergency_legal_contacts_primary_emergency_contact_phone') THEN
    ALTER TABLE "residents" RENAME COLUMN "emergency_legal_contacts_primary_emergency_contact_phone" TO "emergency_legal_contacts_primary_contact_phone";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='emergency_legal_contacts_secondary_emergency_contact_name') THEN
    ALTER TABLE "residents" RENAME COLUMN "emergency_legal_contacts_secondary_emergency_contact_name" TO "emergency_legal_contacts_secondary_contact_name";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='emergency_legal_contacts_secondary_emergency_contact_phone') THEN
    ALTER TABLE "residents" RENAME COLUMN "emergency_legal_contacts_secondary_emergency_contact_phone" TO "emergency_legal_contacts_secondary_contact_phone";
  END IF;
END $$;

-- Legal Guardian POA: Add new columns, migrate data, drop old
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_contact_info" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_copy_on_file" BOOLEAN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='emergency_legal_contacts_legal_guardian_poa_name_contact') THEN
    UPDATE "residents" SET "emergency_legal_contacts_legal_guardian_poa_name" = "emergency_legal_contacts_legal_guardian_poa_name_contact" WHERE "emergency_legal_contacts_legal_guardian_poa_name_contact" IS NOT NULL;
    ALTER TABLE "residents" DROP COLUMN "emergency_legal_contacts_legal_guardian_poa_name_contact";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='emergency_legal_contacts_copy_of_guardianship_poa_on_file') THEN
    UPDATE "residents" SET "emergency_legal_contacts_legal_guardian_poa_copy_on_file" = "emergency_legal_contacts_copy_of_guardianship_poa_on_file" WHERE "emergency_legal_contacts_copy_of_guardianship_poa_on_file" IS NOT NULL;
    ALTER TABLE "residents" DROP COLUMN "emergency_legal_contacts_copy_of_guardianship_poa_on_file";
  END IF;
END $$;

-- Medical Providers: Add split columns, migrate data, drop old
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_primary_care_provider_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_primary_care_provider_phone" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_pharmacy_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_pharmacy_phone" TEXT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='medical_providers_health_coverage_primary_care_provider_name_phone') THEN
    UPDATE "residents" SET "medical_providers_health_coverage_primary_care_provider_name" = "medical_providers_health_coverage_primary_care_provider_name_phone" WHERE "medical_providers_health_coverage_primary_care_provider_name_phone" IS NOT NULL;
    ALTER TABLE "residents" DROP COLUMN "medical_providers_health_coverage_primary_care_provider_name_phone";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='medical_providers_health_coverage_pharmacy_name_phone') THEN
    UPDATE "residents" SET "medical_providers_health_coverage_pharmacy_name" = "medical_providers_health_coverage_pharmacy_name_phone" WHERE "medical_providers_health_coverage_pharmacy_name_phone" IS NOT NULL;
    ALTER TABLE "residents" DROP COLUMN "medical_providers_health_coverage_pharmacy_name_phone";
  END IF;
END $$;

-- Health Insurance: Rename columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='medical_providers_health_coverage_medicaid_id_client_id') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='medical_providers_health_coverage_health_insurance_medicaid_client_id') THEN
    ALTER TABLE "residents" RENAME COLUMN "medical_providers_health_coverage_medicaid_id_client_id" TO "medical_providers_health_coverage_health_insurance_medicaid_client_id";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='medical_providers_health_coverage_authorized_tier') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='medical_providers_health_coverage_health_insurance_authorized_tier') THEN
    ALTER TABLE "residents" RENAME COLUMN "medical_providers_health_coverage_authorized_tier" TO "medical_providers_health_coverage_health_insurance_authorized_tier";
  END IF;
END $$;

-- Diagnoses: Rename allergies column
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='diagnoses_health_conditions_allergies_food_medication_environmental') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='diagnoses_health_conditions_allergies') THEN
    ALTER TABLE "residents" RENAME COLUMN "diagnoses_health_conditions_allergies_food_medication_environmental" TO "diagnoses_health_conditions_allergies";
  END IF;
END $$;

-- Functional Status ADLs: Rename columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='functional_status_adls_bathing_assistance_level') THEN
    ALTER TABLE "residents" RENAME COLUMN "functional_status_adls_bathing_assistance_level" TO "functional_status_adls_bathing_assistance";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='functional_status_adls_dressing_assistance_level') THEN
    ALTER TABLE "residents" RENAME COLUMN "functional_status_adls_dressing_assistance_level" TO "functional_status_adls_dressing_assistance";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='functional_status_adls_toileting_continence_status') THEN
    ALTER TABLE "residents" RENAME COLUMN "functional_status_adls_toileting_continence_status" TO "functional_status_adls_toileting_status";
  END IF;
END $$;

-- Service Plan NCP: Rename columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='service_plan_ncp_ncp_service_plan_on_file') THEN
    ALTER TABLE "residents" RENAME COLUMN "service_plan_ncp_ncp_service_plan_on_file" TO "service_plan_ncp_on_file";
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='service_plan_ncp_date_of_most_recent_ncp') THEN
    ALTER TABLE "residents" RENAME COLUMN "service_plan_ncp_date_of_most_recent_ncp" TO "service_plan_ncp_most_recent_date";
  END IF;
END $$;

-- Financial Case Management: Split phone_email into phone + email
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "financial_case_management_case_manager_phone" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "financial_case_management_case_manager_email" TEXT;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='residents' AND column_name='financial_case_management_case_manager_phone_email') THEN
    UPDATE "residents" SET "financial_case_management_case_manager_phone" = "financial_case_management_case_manager_phone_email" WHERE "financial_case_management_case_manager_phone_email" IS NOT NULL;
    ALTER TABLE "residents" DROP COLUMN "financial_case_management_case_manager_phone_email";
  END IF;
END $$;
