-- CreateTable
CREATE TABLE "tenant_form_schemas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formName" TEXT NOT NULL,
    "description" TEXT,
    "schemaJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_form_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_form_schemas_tenantId_idx" ON "tenant_form_schemas"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_form_schemas_tenantId_isActive_idx" ON "tenant_form_schemas"("tenantId", "isActive");

-- AddForeignKey
ALTER TABLE "tenant_form_schemas" ADD CONSTRAINT "tenant_form_schemas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
