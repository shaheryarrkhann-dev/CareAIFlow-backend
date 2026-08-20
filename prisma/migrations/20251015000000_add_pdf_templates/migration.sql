-- CreateTable
CREATE TABLE "pdf_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "fieldMapping" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pdf_templates_tenantId_idx" ON "pdf_templates"("tenantId");

-- CreateIndex
CREATE INDEX "pdf_templates_tenantId_isActive_idx" ON "pdf_templates"("tenantId", "isActive");

-- AddForeignKey
ALTER TABLE "pdf_templates" ADD CONSTRAINT "pdf_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

