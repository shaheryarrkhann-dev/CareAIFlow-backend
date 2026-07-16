-- Revert many-to-many relationship back to one-to-many
-- Add back tenantId and role columns to users table

ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'STAFF';

-- Migrate data from user_tenants back to users table
-- Take the first active membership for each user
UPDATE "users" u
SET 
    "tenantId" = ut."tenantId",
    "role" = ut."role"
FROM (
    SELECT DISTINCT ON ("userId") 
        "userId", 
        "tenantId", 
        "role"
    FROM "user_tenants"
    WHERE "isActive" = true
    ORDER BY "userId", "createdAt" ASC
) ut
WHERE u."id" = ut."userId";

-- Drop foreign key constraints from user_tenants
ALTER TABLE "user_tenants" DROP CONSTRAINT IF EXISTS "user_tenants_userId_fkey";
ALTER TABLE "user_tenants" DROP CONSTRAINT IF EXISTS "user_tenants_tenantId_fkey";

-- Drop the user_tenants table
DROP TABLE IF EXISTS "user_tenants";

-- Add foreign key constraint for tenantId on users table
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" 
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index on tenantId
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

