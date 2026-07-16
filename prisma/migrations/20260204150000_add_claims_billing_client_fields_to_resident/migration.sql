-- AlterTable
-- Client info (client may differ from resident - e.g. guardian who submitted resident)
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "client_id" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "client_address" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "client_city" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "client_state" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "client_zip" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "place_of_service" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "client_first_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "client_last_name" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diagnosis_code" TEXT;
