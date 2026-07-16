-- Update residents table to include all fields from fields.json
-- This migration updates the basic residents table to the full schema
-- NOTE: This migration handles the case where the table doesn't exist yet (runs before 20251101181407)

-- Create residents table if it doesn't exist (for cases where this migration runs first)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'residents') THEN
        CREATE TABLE "residents" (
            "id" TEXT NOT NULL,
            "tenantId" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
        );
        
        -- Add foreign key if tenants table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
            ALTER TABLE "residents" ADD CONSTRAINT "residents_tenantId_fkey" 
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- Add userId column if it doesn't exist (for cases where table exists but column doesn't)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'residents') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'residents' AND column_name = 'userId') THEN
            ALTER TABLE "residents" ADD COLUMN "userId" TEXT;
            -- If you have existing residents, you may want to set a default userId here
            -- Example: UPDATE "residents" SET "userId" = (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1) WHERE "userId" IS NULL;
        END IF;
    END IF;
END $$;

-- Drop old columns if they exist (firstName, lastName, dob)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'residents' AND column_name = 'firstName') THEN
        ALTER TABLE "residents" DROP COLUMN "firstName";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'residents' AND column_name = 'lastName') THEN
        ALTER TABLE "residents" DROP COLUMN "lastName";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'residents' AND column_name = 'dob') THEN
        ALTER TABLE "residents" DROP COLUMN "dob";
    END IF;
END $$;

-- Add Resident Information fields (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'residents') THEN
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_full_legal_name" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_preferred_name" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_date_of_birth" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_gender_sex" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_ssn" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_medicare_number" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_medicaid_dshs_id" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_va_number" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_primary_language" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_need_interpreter" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_place_of_birth" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_citizenship_status" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_religion" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_race_ethnicity" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_photo_id_on_file" BOOLEAN;
        
        -- Add Admission Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_date" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_type" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_referral_source" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_previous_living_arrangement" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_room_number" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_code_status" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_poa_on_file" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_poa_type" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "admission_agreement_signed" BOOLEAN;
        
        -- Add Emergency Contacts fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_primary_contact_name" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_primary_contact_relationship" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_primary_contact_phone" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_primary_contact_email" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_secondary_contact_name" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_secondary_contact_relationship" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_secondary_contact_phone" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_secondary_contact_email" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_decision_maker_name" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_advanced_directive_on_file" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_polst_on_file" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_guardian_appointed" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_court_orders_restrictions" BOOLEAN;
        
        -- Add Medical Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_primary_diagnosis" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_secondary_diagnoses" JSONB;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_chronic_conditions" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_allergies" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_current_pharmacy" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_primary_care_provider_name" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_primary_care_provider_phone" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_primary_care_clinic" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_specialist_providers" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_recent_hospitalization_90_days" BOOLEAN;
        
        -- Add Insurance Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_primary_payer" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_carrier" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_policy_member_number" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_authorization_claim_number" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_authorization_start_date" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_authorization_end_date" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_daily_rate_or_hours" DECIMAL(10, 2);
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "insurance_responsible_party_payment" TEXT;
        
        -- Add Preventive Care fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_primary_care_last_appt" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_primary_care_next_appt" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_dental_last_appt" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_dental_next_appt" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_optometry_last_appt" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_optometry_next_appt" DATE;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_specialists_seen_12_months" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_hospital_er_visit_12_months" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_recent_labs_imaging" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_transport_needed" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "preventive_upcoming_procedures" TEXT;
        
        -- Add Functional Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_mobility_safety_notes" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_cognitive_behavioral_notes" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_adls_notes" TEXT;
        
        -- Add Medication Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medication_list_file" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medication_list_uploaded_check" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medication_auto_extracted_meds" JSONB;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medication_prn_medications" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medication_controlled_substances" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medication_meds_requiring_vitals" BOOLEAN;
        
        -- Add Diet Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_type" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_texture_modifications" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_food_allergies" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_fluid_restrictions" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_weight_monitoring_required" BOOLEAN;
        
        -- Add Skin Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "skin_integrity_issues" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "skin_wounds_present" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "skin_pressure_injury_risk" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "skin_special_treatments_required" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "skin_isolation_precautions_needed" BOOLEAN;
        
        -- Add Mental Health Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "mental_health_diagnoses" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "mental_current_psych_meds" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "mental_behavioral_support_plan_needed" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "mental_recent_psych_hospitalization" BOOLEAN;
        
        -- Add End of Life Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "eol_hospice_enrolled" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "eol_comfort_measures_only" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "eol_cultural_religious_preferences" TEXT;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "eol_end_of_life_wishes_documented" BOOLEAN;
        
        -- Add Compliance Information fields
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "compliance_all_forms_generated" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "compliance_signatures_completed" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "compliance_disclosures_verified" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "compliance_packet_locked" BOOLEAN;
        ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "compliance_audit_trail_initialized" BOOLEAN;
        
        -- Update indexes
        DROP INDEX IF EXISTS "residents_tenantId_firstName_lastName_idx";
        CREATE INDEX IF NOT EXISTS "residents_userId_idx" ON "residents"("userId");
        CREATE INDEX IF NOT EXISTS "residents_tenantId_createdAt_idx" ON "residents"("tenantId", "createdAt");
        CREATE INDEX IF NOT EXISTS "residents_resident_full_legal_name_idx" ON "residents"("resident_full_legal_name");
    END IF;
END $$;

-- Note: Foreign key for userId should be added if users table exists
-- This will be handled by Prisma's relation management
