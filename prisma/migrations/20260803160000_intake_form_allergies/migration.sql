-- AFH New Resident Intake Form §5 — Allergies
--
-- The printed form is a table of Allergen / Reaction / Severity rows plus a
-- "No known allergies (NKA)" checkbox.
--
-- Stored as JSONB rather than a related ResidentAllergy table. Nothing queries
-- allergies across residents today - the NCP services use their own namespace
-- sourced from DSHS documents, and the care-plan draft modal takes manually
-- typed input - so a table would add a model, CRUD endpoints and cascade rules
-- for capability nobody consumes yet. The schema already stores repeatable
-- lists this way (diet_nutrition_food_allergies, behavioral_safety_risks_*).
--
--   allergies_list shape: [{ "allergen": "...", "reaction": "...", "severity": "..." }]
--
-- If cross-resident allergy queries are ever needed ("which residents react to
-- penicillin"), migrating JSONB rows into a table is straightforward and can be
-- done without touching the form.
--
-- The pre-existing flat allergies_* columns are deliberately left in place: they
-- split allergies by category and are still surfaced in the catch-all step.
--
-- Additive and idempotent. Does not touch the pgvector embedding columns.

ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "allergies_list" JSONB,
  ADD COLUMN IF NOT EXISTS "allergies_nka" BOOLEAN;
