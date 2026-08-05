-- CreateTable: user_tenants junction table for many-to-many relationship
CREATE TABLE "user_tenants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_tenants_userId_tenantId_key" ON "user_tenants"("userId", "tenantId");
CREATE INDEX "user_tenants_userId_idx" ON "user_tenants"("userId");
CREATE INDEX "user_tenants_tenantId_idx" ON "user_tenants"("tenantId");
CREATE INDEX "user_tenants_role_idx" ON "user_tenants"("role");

-- AddForeignKey
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data: Copy user-tenant relationships from users table to user_tenants junction table
-- Only migrate users that have a tenantId (SUPER_ADMIN users with NULL tenantId are excluded)
INSERT INTO "user_tenants" ("id", "userId", "tenantId", "role", "isActive", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    "id" as "userId",
    "tenantId",
    "role",
    "isActive",
    "createdAt",
    "updatedAt"
FROM "users"
WHERE "tenantId" IS NOT NULL;

-- AlterTable: Remove old columns from users table
ALTER TABLE "users" DROP COLUMN "role";
ALTER TABLE "users" DROP COLUMN "tenantId";

