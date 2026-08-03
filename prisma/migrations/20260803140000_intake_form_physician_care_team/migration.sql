-- AFH New Resident Intake Form §3 — Physician & Care Team
--
-- Adds the two visit-date columns the section needs. The section's other six
-- fields reuse columns that already exist:
--   Primary Care Physician  -> medical_providers_health_coverage_primary_care_provider_name
--   Physician Phone         -> medical_providers_health_coverage_primary_care_provider_phone
--   Preferred Hospital      -> medical_providers_health_coverage_preferred_hospital_er
--   Case Manager            -> financial_case_management_case_manager_name
--   Clinic / Practice Name  -> medical_primary_care_clinic      (re-wired, see below)
--   Physician Fax           -> care_provider_primary_care_fax   (re-wired, see below)
--
-- Clinic and Fax are pre-existing columns that were orphaned by the v2 field
-- migration: scripts/migrate-resident-fields-v2.js moved the resident form onto
-- the medical_providers_health_coverage_* naming but had no target for these
-- two, so their form keys were dropped while the columns remained. This section
-- re-attaches them rather than adding a third generation of duplicate columns.
-- No DDL is needed for that — only the form key and mapping change.
--
-- Additive and idempotent. Does not touch the pgvector embedding columns.

ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_last_doctor_visit" DATE,
  ADD COLUMN IF NOT EXISTS "medical_providers_health_coverage_last_dental_visit" DATE;
