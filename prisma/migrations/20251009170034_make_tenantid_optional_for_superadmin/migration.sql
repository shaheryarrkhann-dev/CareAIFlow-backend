-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tenantId" DROP NOT NULL;
