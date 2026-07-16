-- AlterTable
ALTER TABLE "pdf_templates" ADD COLUMN "fileHash" TEXT;

-- CreateIndex
CREATE INDEX "pdf_templates_tenantId_fileHash_idx" ON "pdf_templates"("tenantId", "fileHash");

