-- AFH New Resident Intake Form §6 — Diagnoses & Medical History
--
-- Table of Diagnosis (ICD-10 or description) / Date Diagnosed / Notes.
-- Shape: [{ "diagnosis": "...", "dateDiagnosed": "YYYY-MM-DD", "notes": "..." }]
--
-- JSONB for the same reasons as allergies_list (see 20260803160000).
--
-- Unlike allergies, diagnoses ARE consumed downstream:
-- claims-mapping.service.js resolves the billing diagnosis code through
--   diagnosisCode
--     -> medicalPrimaryDiagnosis || diagnosisPrimaryDiagnosis
--        || diagnosesHealthConditionsDiagnoses
--     -> legacy snake_case fields
-- Staff filling the new table would otherwise skip the flat field that chain
-- depends on, and claims would silently lose the diagnosis. The create/update
-- service therefore mirrors row 1's diagnosis into
-- diagnoses_health_conditions_diagnoses when that column is not set directly.
--
-- Additive and idempotent. Does not touch the pgvector embedding columns.

ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "diagnoses_list" JSONB;
