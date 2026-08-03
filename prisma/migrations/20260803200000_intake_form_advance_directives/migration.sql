-- AFH New Resident Intake Form §7 — Advance Directives
--
-- Only two columns are new. The form's four mutually exclusive boxes
-- (POLST on file / Full Code / DNR / Living Will on file) map onto existing
-- canonical columns rather than a fourth code-status field:
--
--   Full Code, DNR       -> code_status_advance_directives_code_status
--   POLST on file        -> code_status_advance_directives_polst_on_file
--   Living Will on file  -> code_status_advance_directives_advance_directive_on_file
--
-- code_status already carries Full Code and DNR among its options, and
-- QuestionnairePage validates POLST against polst_on_file when the code status
-- is DNR/DNI. A fourth parallel column would have broken that check and
-- deepened the duplicate-column problem this schema already has.
--
-- Additive and idempotent. Does not touch the pgvector embedding columns.

ALTER TABLE "residents"
  ADD COLUMN IF NOT EXISTS "code_status_advance_directives_review_date" DATE,
  ADD COLUMN IF NOT EXISTS "code_status_advance_directives_signed_by" TEXT;
