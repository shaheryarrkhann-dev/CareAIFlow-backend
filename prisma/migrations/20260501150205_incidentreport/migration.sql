/*
  Warnings:

  - You are about to drop the column `medical_providers_health_coverage_health_insurance_authorized_t` on the `residents` table. All the data in the column will be lost.
  - You are about to drop the column `medical_providers_health_coverage_health_insurance_medicaid_cli` on the `residents` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "facilities" ADD COLUMN     "letterhead_config" JSONB;

-- AlterTable
ALTER TABLE "residents" DROP COLUMN "medical_providers_health_coverage_health_insurance_authorized_t",
DROP COLUMN "medical_providers_health_coverage_health_insurance_medicaid_cli",
ADD COLUMN     "medical_providers_health_coverage_health_insurance_authorized_tier" BOOLEAN,
ADD COLUMN     "medical_providers_health_coverage_health_insurance_medicaid_client_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_s3_key" VARCHAR(1024),
ADD COLUMN     "avatar_url" VARCHAR(2048),
ADD COLUMN     "phone" VARCHAR(30);
