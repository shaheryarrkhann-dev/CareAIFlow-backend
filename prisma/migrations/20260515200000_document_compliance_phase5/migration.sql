-- Phase 5: evaluation cache + tenant compliance settings

CREATE TABLE "document_compliance_cache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "evaluation" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_compliance_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_compliance_cache_tenantId_entityType_entityId_key" ON "document_compliance_cache"("tenantId", "entityType", "entityId");
CREATE INDEX "document_compliance_cache_tenantId_idx" ON "document_compliance_cache"("tenantId");
CREATE INDEX "document_compliance_cache_evaluatedAt_idx" ON "document_compliance_cache"("evaluatedAt");

ALTER TABLE "document_compliance_cache" ADD CONSTRAINT "document_compliance_cache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tenant_document_compliance_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogOverrides" JSONB,
    "emailDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastEmailDigestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_document_compliance_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_document_compliance_settings_tenantId_key" ON "tenant_document_compliance_settings"("tenantId");

ALTER TABLE "tenant_document_compliance_settings" ADD CONSTRAINT "tenant_document_compliance_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
