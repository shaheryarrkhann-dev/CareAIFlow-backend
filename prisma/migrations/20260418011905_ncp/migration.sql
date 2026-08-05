/*
  Warnings:

  - You are about to alter the column `embedding` on the `pdf_embeddings` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("vector")` to `Text`.
  - You are about to drop the column `admission_referral_source` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `compliance_all_forms_generated` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `compliance_audit_trail_initialized` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `compliance_disclosures_verified` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `compliance_packet_locked` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `compliance_signatures_completed` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `diet_fluid_restrictions` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `diet_food_allergies` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `diet_texture_modifications` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `diet_type` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `diet_weight_monitoring_required` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `eol_comfort_measures_only` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `eol_cultural_religious_preferences` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `eol_end_of_life_wishes_documented` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `eol_hospice_enrolled` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `functional_adls_notes` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `functional_cognitive_behavioral_notes` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `functional_mobility_safety_notes` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medical_providers_health_coverage_health_insurance_authorized_t` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medical_providers_health_coverage_health_insurance_medicaid_cli` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medication_auto_extracted_meds` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medication_controlled_substances` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medication_list_file` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medication_list_uploaded_check` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medication_meds_requiring_vitals` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medication_prn_medications` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `mental_behavioral_support_plan_needed` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `mental_current_psych_meds` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `mental_health_diagnoses` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `mental_recent_psych_hospitalization` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_dental_last_appt` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_dental_next_appt` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_hospital_er_visit_12_months` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_optometry_last_appt` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_optometry_next_appt` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_primary_care_last_appt` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_primary_care_next_appt` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_recent_labs_imaging` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_specialists_seen_12_months` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_transport_needed` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `preventive_upcoming_procedures` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `resident_citizenship_status` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `resident_photo_id_on_file` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `resident_place_of_birth` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `resident_race_ethnicity` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `resident_religion` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `skin_integrity_issues` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `skin_isolation_precautions_needed` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `skin_pressure_injury_risk` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `skin_special_treatments_required` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `skin_wounds_present` on the `residents` table. All the data in the column will be lost.
  - You are about to alter the column `embedding` on the `wac_rcw_regulations` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("vector")` to `Text`.

*/
-- CreateEnum
CREATE TYPE "MedicationRoute" AS ENUM ('Oral', 'IM', 'IV', 'Topical', 'Eye', 'Ear', 'Sublingual', 'Nasal', 'Other');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('Pending', 'Given', 'Missed', 'Late', 'Skipped', 'Hold');

-- CreateEnum
CREATE TYPE "MarStatus" AS ENUM ('Given', 'NotGiven', 'Refused', 'Missed', 'Late', 'Skipped', 'Hold');

-- CreateEnum
CREATE TYPE "NcpStatus" AS ENUM ('PENDING', 'EXTRACTING', 'EXTRACTED', 'REVIEWED', 'POPULATED', 'FAILED');

-- CreateEnum
CREATE TYPE "StaffEmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_LOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_UNLOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'PRN_RECORD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRN_RECORD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRN_RECORD_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'VITALS_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'VITALS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MAR_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'MAR_SCHEDULE_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_LOG_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_LOG_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_LOG_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'PHI_GENERATE_NCP_DSHS_DRAFT';
ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_NOTE_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_NOTE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BEHAVIORAL_REPORT_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_PROBLEM_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_PROBLEM_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_GOAL_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_GOAL_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_INTERVENTION_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_INTERVENTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_VERSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_LIBRARY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_LIBRARY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CARE_LIBRARY_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'BIRTHDAY_REMINDER_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'BIRTHDAY_CONFIG_UPDATED';

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_residentId_fkey";

-- DropIndex
DROP INDEX "residents_claims_billing_tier_id_idx";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "ip_geo_summary" VARCHAR(512);

-- AlterTable
ALTER TABLE "behavioral_logs" ALTER COLUMN "interventions" DROP DEFAULT;

-- AlterTable
ALTER TABLE "facility_folders" ADD COLUMN     "is_system_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 10000;

-- AlterTable
ALTER TABLE "incident_reports" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pdf_embeddings" ALTER COLUMN "embedding" DROP NOT NULL,
ALTER COLUMN "embedding" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "pdf_templates" ADD COLUMN     "fileHash" TEXT;

-- AlterTable
ALTER TABLE "residents" DROP COLUMN "admission_referral_source",
DROP COLUMN "compliance_all_forms_generated",
DROP COLUMN "compliance_audit_trail_initialized",
DROP COLUMN "compliance_disclosures_verified",
DROP COLUMN "compliance_packet_locked",
DROP COLUMN "compliance_signatures_completed",
DROP COLUMN "diet_fluid_restrictions",
DROP COLUMN "diet_food_allergies",
DROP COLUMN "diet_texture_modifications",
DROP COLUMN "diet_type",
DROP COLUMN "diet_weight_monitoring_required",
DROP COLUMN "eol_comfort_measures_only",
DROP COLUMN "eol_cultural_religious_preferences",
DROP COLUMN "eol_end_of_life_wishes_documented",
DROP COLUMN "eol_hospice_enrolled",
DROP COLUMN "functional_adls_notes",
DROP COLUMN "functional_cognitive_behavioral_notes",
DROP COLUMN "functional_mobility_safety_notes",
DROP COLUMN "medical_providers_health_coverage_health_insurance_authorized_t",
DROP COLUMN "medical_providers_health_coverage_health_insurance_medicaid_cli",
DROP COLUMN "medication_auto_extracted_meds",
DROP COLUMN "medication_controlled_substances",
DROP COLUMN "medication_list_file",
DROP COLUMN "medication_list_uploaded_check",
DROP COLUMN "medication_meds_requiring_vitals",
DROP COLUMN "medication_prn_medications",
DROP COLUMN "mental_behavioral_support_plan_needed",
DROP COLUMN "mental_current_psych_meds",
DROP COLUMN "mental_health_diagnoses",
DROP COLUMN "mental_recent_psych_hospitalization",
DROP COLUMN "preventive_dental_last_appt",
DROP COLUMN "preventive_dental_next_appt",
DROP COLUMN "preventive_hospital_er_visit_12_months",
DROP COLUMN "preventive_optometry_last_appt",
DROP COLUMN "preventive_optometry_next_appt",
DROP COLUMN "preventive_primary_care_last_appt",
DROP COLUMN "preventive_primary_care_next_appt",
DROP COLUMN "preventive_recent_labs_imaging",
DROP COLUMN "preventive_specialists_seen_12_months",
DROP COLUMN "preventive_transport_needed",
DROP COLUMN "preventive_upcoming_procedures",
DROP COLUMN "resident_citizenship_status",
DROP COLUMN "resident_photo_id_on_file",
DROP COLUMN "resident_place_of_birth",
DROP COLUMN "resident_race_ethnicity",
DROP COLUMN "resident_religion",
DROP COLUMN "skin_integrity_issues",
DROP COLUMN "skin_isolation_precautions_needed",
DROP COLUMN "skin_pressure_injury_risk",
DROP COLUMN "skin_special_treatments_required",
DROP COLUMN "skin_wounds_present",
ADD COLUMN     "admission_status" TEXT,
ADD COLUMN     "allergies_allergy_severity" TEXT,
ADD COLUMN     "allergies_environmental_allergies" TEXT,
ADD COLUMN     "allergies_food_allergies" TEXT,
ADD COLUMN     "allergies_medication_allergies" TEXT,
ADD COLUMN     "allergies_reaction_notes" TEXT,
ADD COLUMN     "care_needs_behavioral_triggers" TEXT,
ADD COLUMN     "care_needs_fall_risk" TEXT,
ADD COLUMN     "care_needs_mobility_aids_used" TEXT,
ADD COLUMN     "care_needs_special_precautions" TEXT,
ADD COLUMN     "care_provider_behavioral_health_name" TEXT,
ADD COLUMN     "care_provider_behavioral_health_phone" TEXT,
ADD COLUMN     "care_provider_case_manager_agency" TEXT,
ADD COLUMN     "care_provider_case_manager_name" TEXT,
ADD COLUMN     "care_provider_case_manager_phone" TEXT,
ADD COLUMN     "care_provider_primary_care_fax" TEXT,
ADD COLUMN     "care_provider_specialist_cardiology" TEXT,
ADD COLUMN     "care_provider_specialist_neurology" TEXT,
ADD COLUMN     "care_provider_specialist_other" TEXT,
ADD COLUMN     "care_provider_specialist_psychiatry" TEXT,
ADD COLUMN     "diagnosis_behavioral_diagnoses" TEXT,
ADD COLUMN     "diagnosis_chronic_conditions" TEXT,
ADD COLUMN     "diagnosis_cognitive_status" TEXT,
ADD COLUMN     "diagnosis_dementia_diagnosis" BOOLEAN,
ADD COLUMN     "diagnosis_last_review_date" DATE,
ADD COLUMN     "diagnosis_mental_health_diagnoses" TEXT,
ADD COLUMN     "diagnosis_primary_diagnosis" TEXT,
ADD COLUMN     "diagnosis_secondary_diagnoses" JSONB,
ADD COLUMN     "e_signature_legal_text" TEXT,
ADD COLUMN     "e_signature_s3_key" TEXT,
ADD COLUMN     "e_signature_signed_at" TIMESTAMP(3),
ADD COLUMN     "e_signature_url" TEXT,
ADD COLUMN     "emergency_code_status" TEXT,
ADD COLUMN     "emergency_poa_on_file" BOOLEAN,
ADD COLUMN     "emergency_poa_type" TEXT,
ADD COLUMN     "external_facility_dialysis_center" TEXT,
ADD COLUMN     "external_facility_hospital_er_most_used" TEXT,
ADD COLUMN     "external_facility_other" TEXT,
ADD COLUMN     "external_facility_previous_living" TEXT,
ADD COLUMN     "external_facility_referring_facility" TEXT,
ADD COLUMN     "external_facility_skilled_nursing" TEXT,
ADD COLUMN     "medical_providers_health_coverage_health_insurance_authorized_tier" BOOLEAN,
ADD COLUMN     "medical_providers_health_coverage_health_insurance_medicaid_client_id" TEXT,
ADD COLUMN     "payer_approved_hours" DECIMAL(10,2),
ADD COLUMN     "payer_approved_tier_daily_rate" TEXT,
ADD COLUMN     "payer_billing_notes" TEXT,
ADD COLUMN     "payer_secondary_payer" TEXT,
ADD COLUMN     "pharmacy_account_number" TEXT,
ADD COLUMN     "pharmacy_address" TEXT,
ADD COLUMN     "pharmacy_delivery_schedule" TEXT,
ADD COLUMN     "pharmacy_fax" TEXT,
ADD COLUMN     "pharmacy_name" TEXT,
ADD COLUMN     "pharmacy_notes" TEXT,
ADD COLUMN     "pharmacy_phone" TEXT;

-- AlterTable
ALTER TABLE "staff_folders" ADD COLUMN     "is_system_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 10000;

-- AlterTable
ALTER TABLE "staff_members" ADD COLUMN     "address" TEXT,
ADD COLUMN     "emergency_contact" TEXT,
ADD COLUMN     "employment_status" "StaffEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "fullLegalName" TEXT,
ADD COLUMN     "hire_date" DATE,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "profilePhotoS3Key" TEXT,
ADD COLUMN     "profilePhotoUrl" TEXT,
ADD COLUMN     "profile_email" TEXT,
ADD COLUMN     "profile_phone" TEXT,
ADD COLUMN     "separation_archived_personnel_note" TEXT,
ADD COLUMN     "separation_exit_notes" TEXT,
ADD COLUMN     "separation_termination_date" DATE,
ADD COLUMN     "separation_termination_record" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "date_of_birth" DATE;

-- AlterTable
ALTER TABLE "wac_rcw_regulations" ALTER COLUMN "embedding" DROP NOT NULL,
ALTER COLUMN "embedding" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "route" "MedicationRoute" NOT NULL,
    "frequency" TEXT NOT NULL,
    "timesPerDay" INTEGER,
    "timeSlots" JSONB,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrn" BOOLEAN NOT NULL DEFAULT false,
    "requiresVitals" BOOLEAN NOT NULL DEFAULT false,
    "vitalsType" TEXT,
    "prescriberName" TEXT,
    "prescriberPhone" TEXT,
    "pharmacyName" TEXT,
    "pharmacyPhone" TEXT,
    "specialInstructions" TEXT,
    "prescriptionPdfUrl" TEXT,
    "prescriptionS3Key" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_schedules" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'Pending',
    "isMissed" BOOLEAN NOT NULL DEFAULT false,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateThreshold" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mar_records" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "residentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "status" "MarStatus" NOT NULL,
    "caregiverId" TEXT,
    "caregiverName" TEXT,
    "caregiverInitials" TEXT,
    "signature" TEXT,
    "signatureType" TEXT,
    "notes" TEXT,
    "residentResponse" TEXT,
    "notGivenReason" TEXT,
    "refusedReason" TEXT,
    "vitalsId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,

    CONSTRAINT "mar_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prn_records" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "whyGiven" TEXT NOT NULL,
    "symptomsNoted" TEXT,
    "symptom" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL,
    "caregiverId" TEXT,
    "caregiverName" TEXT,
    "caregiverInitials" TEXT,
    "signature" TEXT,
    "response" TEXT,
    "effectiveness" TEXT,
    "responseRecordedAt" TIMESTAMP(3),
    "physicianNotified" BOOLEAN NOT NULL DEFAULT false,
    "physicianNotifiedAt" TIMESTAMP(3),
    "physicianNotes" TEXT,
    "vitalsId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prn_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vital_signs" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bloodPressureSystolic" INTEGER,
    "bloodPressureDiastolic" INTEGER,
    "pulse" INTEGER,
    "temperature" DECIMAL(4,1),
    "temperatureUnit" TEXT DEFAULT 'F',
    "oxygenSaturation" INTEGER,
    "weight" DECIMAL(5,2),
    "weightUnit" TEXT DEFAULT 'lbs',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "recordedByName" TEXT,
    "medicationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_prescriptions" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ncp_extractions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "residentId" TEXT,
    "sourcePdfS3Key" TEXT NOT NULL,
    "sourcePdfFileName" TEXT NOT NULL,
    "sourcePdfSize" INTEGER,
    "extractedData" JSONB NOT NULL,
    "requiresCbhs" BOOLEAN NOT NULL DEFAULT false,
    "cbhsNotes" TEXT,
    "layer1Draft" JSONB,
    "layer2Final" JSONB,
    "status" "NcpStatus" NOT NULL DEFAULT 'PENDING',
    "extractionMethod" TEXT,
    "extractionModel" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" INTEGER,
    "bullJobId" TEXT,
    "populatedDocxS3Key" TEXT,
    "populatedDocxUrl" TEXT,
    "ncpVersion" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "extractedAt" TIMESTAMP(3),
    "populatedAt" TIMESTAMP(3),

    CONSTRAINT "ncp_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birthday_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personType" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "birthdayDate" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "birthday_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_fcm_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_fcm_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeId" TEXT,
    "assigneeRole" TEXT,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "medications_residentId_idx" ON "medications"("residentId");

-- CreateIndex
CREATE INDEX "medications_tenantId_idx" ON "medications"("tenantId");

-- CreateIndex
CREATE INDEX "medications_tenantId_residentId_idx" ON "medications"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "medications_tenantId_residentId_isActive_idx" ON "medications"("tenantId", "residentId", "isActive");

-- CreateIndex
CREATE INDEX "medications_isActive_idx" ON "medications"("isActive");

-- CreateIndex
CREATE INDEX "medication_schedules_residentId_idx" ON "medication_schedules"("residentId");

-- CreateIndex
CREATE INDEX "medication_schedules_tenantId_idx" ON "medication_schedules"("tenantId");

-- CreateIndex
CREATE INDEX "medication_schedules_tenantId_residentId_idx" ON "medication_schedules"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "medication_schedules_scheduledDate_idx" ON "medication_schedules"("scheduledDate");

-- CreateIndex
CREATE INDEX "medication_schedules_scheduledTime_idx" ON "medication_schedules"("scheduledTime");

-- CreateIndex
CREATE INDEX "medication_schedules_status_idx" ON "medication_schedules"("status");

-- CreateIndex
CREATE INDEX "medication_schedules_tenantId_scheduledDate_idx" ON "medication_schedules"("tenantId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "medication_schedules_medicationId_scheduledTime_key" ON "medication_schedules"("medicationId", "scheduledTime");

-- CreateIndex
CREATE UNIQUE INDEX "mar_records_scheduleId_key" ON "mar_records"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "mar_records_vitalsId_key" ON "mar_records"("vitalsId");

-- CreateIndex
CREATE INDEX "mar_records_residentId_idx" ON "mar_records"("residentId");

-- CreateIndex
CREATE INDEX "mar_records_tenantId_idx" ON "mar_records"("tenantId");

-- CreateIndex
CREATE INDEX "mar_records_medicationId_idx" ON "mar_records"("medicationId");

-- CreateIndex
CREATE INDEX "mar_records_caregiverId_idx" ON "mar_records"("caregiverId");

-- CreateIndex
CREATE INDEX "mar_records_administeredAt_idx" ON "mar_records"("administeredAt");

-- CreateIndex
CREATE INDEX "mar_records_tenantId_residentId_idx" ON "mar_records"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "mar_records_tenantId_residentId_administeredAt_idx" ON "mar_records"("tenantId", "residentId", "administeredAt");

-- CreateIndex
CREATE INDEX "mar_records_scheduleId_idx" ON "mar_records"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "prn_records_vitalsId_key" ON "prn_records"("vitalsId");

-- CreateIndex
CREATE INDEX "prn_records_residentId_idx" ON "prn_records"("residentId");

-- CreateIndex
CREATE INDEX "prn_records_tenantId_idx" ON "prn_records"("tenantId");

-- CreateIndex
CREATE INDEX "prn_records_medicationId_idx" ON "prn_records"("medicationId");

-- CreateIndex
CREATE INDEX "prn_records_caregiverId_idx" ON "prn_records"("caregiverId");

-- CreateIndex
CREATE INDEX "prn_records_givenAt_idx" ON "prn_records"("givenAt");

-- CreateIndex
CREATE INDEX "prn_records_tenantId_residentId_idx" ON "prn_records"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "prn_records_tenantId_residentId_givenAt_idx" ON "prn_records"("tenantId", "residentId", "givenAt");

-- CreateIndex
CREATE INDEX "vital_signs_residentId_idx" ON "vital_signs"("residentId");

-- CreateIndex
CREATE INDEX "vital_signs_tenantId_idx" ON "vital_signs"("tenantId");

-- CreateIndex
CREATE INDEX "vital_signs_recordedAt_idx" ON "vital_signs"("recordedAt");

-- CreateIndex
CREATE INDEX "vital_signs_tenantId_residentId_idx" ON "vital_signs"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "vital_signs_tenantId_residentId_recordedAt_idx" ON "vital_signs"("tenantId", "residentId", "recordedAt");

-- CreateIndex
CREATE INDEX "vital_signs_medicationId_idx" ON "vital_signs"("medicationId");

-- CreateIndex
CREATE INDEX "medication_prescriptions_medicationId_idx" ON "medication_prescriptions"("medicationId");

-- CreateIndex
CREATE INDEX "medication_prescriptions_tenantId_idx" ON "medication_prescriptions"("tenantId");

-- CreateIndex
CREATE INDEX "ncp_extractions_tenantId_idx" ON "ncp_extractions"("tenantId");

-- CreateIndex
CREATE INDEX "ncp_extractions_userId_idx" ON "ncp_extractions"("userId");

-- CreateIndex
CREATE INDEX "ncp_extractions_residentId_idx" ON "ncp_extractions"("residentId");

-- CreateIndex
CREATE INDEX "ncp_extractions_status_idx" ON "ncp_extractions"("status");

-- CreateIndex
CREATE INDEX "ncp_extractions_tenantId_status_idx" ON "ncp_extractions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ncp_extractions_tenantId_residentId_idx" ON "ncp_extractions"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "ncp_extractions_createdAt_idx" ON "ncp_extractions"("createdAt");

-- CreateIndex
CREATE INDEX "birthday_notifications_tenantId_idx" ON "birthday_notifications"("tenantId");

-- CreateIndex
CREATE INDEX "birthday_notifications_userId_idx" ON "birthday_notifications"("userId");

-- CreateIndex
CREATE INDEX "birthday_notifications_readAt_idx" ON "birthday_notifications"("readAt");

-- CreateIndex
CREATE INDEX "birthday_notifications_createdAt_idx" ON "birthday_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "birthday_notifications_userId_readAt_idx" ON "birthday_notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "birthday_notifications_tenantId_birthdayDate_idx" ON "birthday_notifications"("tenantId", "birthdayDate");

-- CreateIndex
CREATE INDEX "user_fcm_tokens_userId_idx" ON "user_fcm_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_fcm_tokens_userId_token_key" ON "user_fcm_tokens"("userId", "token");

-- CreateIndex
CREATE INDEX "tasks_tenantId_idx" ON "tasks"("tenantId");

-- CreateIndex
CREATE INDEX "tasks_tenantId_status_idx" ON "tasks"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tasks_tenantId_dueDate_idx" ON "tasks"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_idx" ON "tasks"("assigneeId");

-- CreateIndex
CREATE INDEX "tasks_createdById_idx" ON "tasks"("createdById");

-- CreateIndex
CREATE INDEX "tasks_deletedAt_idx" ON "tasks"("deletedAt");

-- CreateIndex
CREATE INDEX "facility_folders_facilityId_parentId_sort_order_idx" ON "facility_folders"("facilityId", "parentId", "sort_order");

-- CreateIndex
CREATE INDEX "pdf_templates_tenantId_fileHash_idx" ON "pdf_templates"("tenantId", "fileHash");

-- CreateIndex
CREATE INDEX "staff_folders_staffId_parentId_sort_order_idx" ON "staff_folders"("staffId", "parentId", "sort_order");

-- CreateIndex
CREATE INDEX "staff_members_employment_status_idx" ON "staff_members"("employment_status");

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "medication_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_vitalsId_fkey" FOREIGN KEY ("vitalsId") REFERENCES "vital_signs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_vitalsId_fkey" FOREIGN KEY ("vitalsId") REFERENCES "vital_signs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_prescriptions" ADD CONSTRAINT "medication_prescriptions_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_prescriptions" ADD CONSTRAINT "medication_prescriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_logs" ADD CONSTRAINT "behavioral_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_logs" ADD CONSTRAINT "behavioral_logs_prnRecordId_fkey" FOREIGN KEY ("prnRecordId") REFERENCES "prn_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_notes" ADD CONSTRAINT "behavioral_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_library" ADD CONSTRAINT "care_library_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncp_extractions" ADD CONSTRAINT "ncp_extractions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncp_extractions" ADD CONSTRAINT "ncp_extractions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncp_extractions" ADD CONSTRAINT "ncp_extractions_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncp_extractions" ADD CONSTRAINT "ncp_extractions_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_notifications" ADD CONSTRAINT "birthday_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_notifications" ADD CONSTRAINT "birthday_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fcm_tokens" ADD CONSTRAINT "user_fcm_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
