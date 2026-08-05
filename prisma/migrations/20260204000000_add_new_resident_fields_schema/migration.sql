-- Add new resident fields from updated_resident_fields.json schema
-- New fields use resident_identification_*, emergency_legal_contacts_*, etc. naming
-- Data migration will copy from old columns in a separate script

-- Resident Identification
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_full_legal_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_profile_picture" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_preferred_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_date_of_birth" DATE;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_gender" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_ssn" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_admission_date" DATE;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_room_number" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "resident_identification_resident_status" TEXT;

-- Emergency / Legal Contacts
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_primary_emergency_contact_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_primary_emergency_contact_relationship" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_primary_emergency_contact_phone" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_secondary_emergency_contact_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_secondary_emergency_contact_phone" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_exists" BOOLEAN;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_legal_guardian_poa_name_contact" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "emergency_legal_contacts_copy_of_guardianship_poa_on_file" BOOLEAN;

-- Medical Providers / Health Coverage
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_primary_care_provider_name_phone" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_mental_health_provider" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_preferred_hospital_er" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_pharmacy_name_phone" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_health_insurance_payor_type" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_medicaid_id_client_id" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_authorized_tier" BOOLEAN;

-- Diagnoses / Health Conditions
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diagnoses_health_conditions_diagnoses" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diagnoses_health_conditions_communicable_diseases" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diagnoses_health_conditions_allergies_food_medication_environmental" TEXT;

-- Functional Status / ADLs
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_mobility_status" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_bathing_assistance_level" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_dressing_assistance_level" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_toileting_continence_status" JSONB;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_eating_feeding_assistance" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_communication_ability" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_cognitive_status" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "functional_status_adls_requires_cueing_for_adls" BOOLEAN;

-- Service Plan / NCP
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "service_plan_ncp_ncp_service_plan_on_file" BOOLEAN;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "service_plan_ncp_date_of_most_recent_ncp" DATE;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "service_plan_ncp_services_authorized" TEXT;

-- Medications / Treatments
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medications_treatments_treatment_orders" JSONB;

-- Behavioral / Safety Risks
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_behavioral_concerns" JSONB;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_known_triggers" JSONB;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_de_escalation_techniques" JSONB;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_fall_risk" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_elopement_risk" TEXT;

-- Diet / Nutrition
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_nutrition_prescribed_diet_type" JSONB;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_nutrition_fluid_restrictions" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_nutrition_food_allergies" JSONB;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_nutrition_weight_monitoring_required" TEXT;

-- Code Status / Advance Directives
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "code_status_advance_directives_code_status" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "code_status_advance_directives_polst_on_file" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "code_status_advance_directives_advance_directive_on_file" TEXT;

-- Financial / Case Management
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "financial_case_management_case_manager_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "financial_case_management_case_manager_phone_email" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "financial_case_management_authorization_start_date" DATE;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "financial_case_management_authorization_end_date" DATE;
