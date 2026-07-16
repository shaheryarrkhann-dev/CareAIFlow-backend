-- Remove residentName column from eMAR models
-- Resident names are now fetched dynamically from form submissions

-- Remove residentName from medications table
ALTER TABLE "medications" DROP COLUMN IF EXISTS "residentName";

-- Remove residentName from mar_records table
ALTER TABLE "mar_records" DROP COLUMN IF EXISTS "residentName";

-- Remove residentName from prn_records table
ALTER TABLE "prn_records" DROP COLUMN IF EXISTS "residentName";

-- Remove residentName from vital_signs table
ALTER TABLE "vital_signs" DROP COLUMN IF EXISTS "residentName";

