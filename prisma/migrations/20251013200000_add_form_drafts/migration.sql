-- CreateTable
CREATE TABLE "form_drafts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "draftData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_drafts_userId_idx" ON "form_drafts"("userId");

-- CreateIndex
CREATE INDEX "form_drafts_formId_idx" ON "form_drafts"("formId");

-- CreateIndex
CREATE INDEX "form_drafts_tenantId_userId_idx" ON "form_drafts"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "form_drafts_formId_userId_idx" ON "form_drafts"("formId", "userId");

-- AddForeignKey
ALTER TABLE "form_drafts" ADD CONSTRAINT "form_drafts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_drafts" ADD CONSTRAINT "form_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_drafts" ADD CONSTRAINT "form_drafts_formId_fkey" FOREIGN KEY ("formId") REFERENCES "tenant_form_schemas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

