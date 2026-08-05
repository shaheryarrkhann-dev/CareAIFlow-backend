-- Safe script to create ONLY the residents table
-- This will NOT affect any other tables or data

-- Create residents table if it doesn't exist
CREATE TABLE IF NOT EXISTS "residents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    
    -- Resident Information
    "resident_full_legal_name" TEXT,
    "resident_preferred_name" TEXT,
    "resident_date_of_birth" DATE,
    "resident_gender_sex" TEXT,
    "resident_ssn" TEXT,
    "resident_medicare_number" TEXT,
    "resident_medicaid_dshs_id" TEXT,
    "resident_va_number" TEXT,
    "resident_primary_language" TEXT,
    "resident_need_interpreter" BOOLEAN,
    "resident_place_of_birth" TEXT,
    "resident_citizenship_status" TEXT,
    "resident_religion" TEXT,
    "resident_race_ethnicity" TEXT,
    "resident_photo_id_on_file" BOOLEAN,
    
    -- Admission Information
    "admission_date" DATE,
    "admission_type" TEXT,
    "admission_referral_source" TEXT,
    "admission_previous_living_arrangement" TEXT,
    "admission_room_number" TEXT,
    "admission_code_status" TEXT,
    "admission_poa_on_file" BOOLEAN,
    "admission_poa_type" TEXT,
    "admission_agreement_signed" BOOLEAN,
    
    -- Emergency Contacts
    "emergency_primary_contact_name" TEXT,
    "emergency_primary_contact_relationship" TEXT,
    "emergency_primary_contact_phone" TEXT,
    "emergency_primary_contact_email" TEXT,
    "emergency_secondary_contact_name" TEXT,
    "emergency_secondary_contact_relationship" TEXT,
    "emergency_secondary_contact_phone" TEXT,
    "emergency_secondary_contact_email" TEXT,
    "emergency_legal_decision_maker_name" TEXT,
    "emergency_advanced_directive_on_file" BOOLEAN,
    "emergency_polst_on_file" BOOLEAN,
    "emergency_guardian_appointed" BOOLEAN,
    "emergency_court_orders_restrictions" BOOLEAN,
    
    -- Medical Information
    "medical_primary_diagnosis" TEXT,
    "medical_secondary_diagnoses" JSONB,
    "medical_chronic_conditions" TEXT,
    "medical_allergies" TEXT,
    "medical_current_pharmacy" TEXT,
    "medical_primary_care_provider_name" TEXT,
    "medical_primary_care_provider_phone" TEXT,
    "medical_primary_care_clinic" TEXT,
    "medical_specialist_providers" TEXT,
    "medical_recent_hospitalization_90_days" BOOLEAN,
    
    -- Insurance Information
    "insurance_primary_payer" TEXT,
    "insurance_carrier" TEXT,
    "insurance_policy_member_number" TEXT,
    "insurance_authorization_claim_number" TEXT,
    "insurance_authorization_start_date" DATE,
    "insurance_authorization_end_date" DATE,
    "insurance_daily_rate_or_hours" DECIMAL(10,2),
    "insurance_responsible_party_payment" TEXT,
    
    -- Preventive Care
    "preventive_primary_care_last_appt" DATE,
    "preventive_primary_care_next_appt" DATE,
    "preventive_dental_last_appt" DATE,
    "preventive_dental_next_appt" DATE,
    "preventive_optometry_last_appt" DATE,
    "preventive_optometry_next_appt" DATE,
    "preventive_specialists_seen_12_months" BOOLEAN,
    "preventive_hospital_er_visit_12_months" BOOLEAN,
    "preventive_recent_labs_imaging" TEXT,
    "preventive_transport_needed" BOOLEAN,
    "preventive_upcoming_procedures" TEXT,
    
    -- Functional Information
    "functional_mobility_safety_notes" TEXT,
    "functional_cognitive_behavioral_notes" TEXT,
    "functional_adls_notes" TEXT,
    
    -- Medication Information
    "medication_list_file" TEXT,
    "medication_list_uploaded_check" BOOLEAN,
    "medication_auto_extracted_meds" JSONB,
    "medication_prn_medications" TEXT,
    "medication_controlled_substances" TEXT,
    "medication_meds_requiring_vitals" BOOLEAN,
    
    -- Diet Information
    "diet_type" TEXT,
    "diet_texture_modifications" TEXT,
    "diet_food_allergies" TEXT,
    "diet_fluid_restrictions" TEXT,
    "diet_weight_monitoring_required" BOOLEAN,
    
    -- Skin Information
    "skin_integrity_issues" BOOLEAN,
    "skin_wounds_present" BOOLEAN,
    "skin_pressure_injury_risk" TEXT,
    "skin_special_treatments_required" TEXT,
    "skin_isolation_precautions_needed" BOOLEAN,
    
    -- Mental Health Information
    "mental_health_diagnoses" TEXT,
    "mental_current_psych_meds" TEXT,
    "mental_behavioral_support_plan_needed" BOOLEAN,
    "mental_recent_psych_hospitalization" BOOLEAN,
    
    -- End of Life Information
    "eol_hospice_enrolled" BOOLEAN,
    "eol_comfort_measures_only" BOOLEAN,
    "eol_cultural_religious_preferences" TEXT,
    "eol_end_of_life_wishes_documented" BOOLEAN,
    
    -- Compliance Information
    "compliance_all_forms_generated" BOOLEAN,
    "compliance_signatures_completed" BOOLEAN,
    "compliance_disclosures_verified" BOOLEAN,
    "compliance_packet_locked" BOOLEAN,
    "compliance_audit_trail_initialized" BOOLEAN,
    
    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "residents_userId_idx" ON "residents"("userId");
CREATE INDEX IF NOT EXISTS "residents_tenantId_createdAt_idx" ON "residents"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "residents_resident_full_legal_name_idx" ON "residents"("resident_full_legal_name");

-- Add foreign key constraint if tenants table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
        ALTER TABLE "residents" ADD CONSTRAINT "residents_tenantId_fkey" 
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;
    END IF;
END $$;

