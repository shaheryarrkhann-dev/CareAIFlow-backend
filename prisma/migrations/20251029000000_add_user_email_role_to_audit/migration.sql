-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "userEmail" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "userRole" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_userEmail_idx" ON "audit_logs"("userEmail");

