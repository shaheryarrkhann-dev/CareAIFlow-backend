-- AlterTable
ALTER TABLE "ncp_extractions" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "archivedBy" TEXT;

-- CreateIndex
CREATE INDEX "ncp_extractions_deletedAt_idx" ON "ncp_extractions"("deletedAt");

-- AddForeignKey
ALTER TABLE "ncp_extractions" ADD CONSTRAINT "ncp_extractions_archivedBy_fkey" FOREIGN KEY ("archivedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
