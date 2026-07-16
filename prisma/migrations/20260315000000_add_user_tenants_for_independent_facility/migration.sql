-- CreateTable: user_tenants for many-to-many User-Tenant (one login, multiple facilities/accounts)
CREATE TABLE "user_tenants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tenants_pkey" PRIMARY KEY ("id")
);

-- Migrate existing users: each user with tenantId gets one UserTenant row (isPrimary = true)
INSERT INTO "user_tenants" ("id", "userId", "tenantId", "role", "isPrimary", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    "id",
    "tenantId",
    COALESCE("role", 'STAFF'),
    true,
    NOW(),
    NOW()
FROM "users"
WHERE "tenantId" IS NOT NULL;

-- Indexes
CREATE UNIQUE INDEX "user_tenants_userId_tenantId_key" ON "user_tenants"("userId", "tenantId");
CREATE INDEX "user_tenants_userId_idx" ON "user_tenants"("userId");
CREATE INDEX "user_tenants_tenantId_idx" ON "user_tenants"("tenantId");

-- Foreign keys
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
