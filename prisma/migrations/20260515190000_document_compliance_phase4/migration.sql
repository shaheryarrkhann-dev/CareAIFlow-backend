-- Document compliance Phase 4: notifications + audit action types

ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_COMPLIANCE_EVALUATED';
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_COMPLIANCE_REPORT_EXPORTED';

CREATE TABLE "document_compliance_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "overallStatus" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_compliance_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_compliance_notifications_tenantId_idx" ON "document_compliance_notifications"("tenantId");
CREATE INDEX "document_compliance_notifications_userId_idx" ON "document_compliance_notifications"("userId");
CREATE INDEX "document_compliance_notifications_readAt_idx" ON "document_compliance_notifications"("readAt");
CREATE INDEX "document_compliance_notifications_createdAt_idx" ON "document_compliance_notifications"("createdAt");
CREATE INDEX "document_compliance_notifications_userId_readAt_idx" ON "document_compliance_notifications"("userId", "readAt");
CREATE INDEX "document_compliance_notifications_tenantId_entityType_entityId_idx" ON "document_compliance_notifications"("tenantId", "entityType", "entityId");

ALTER TABLE "document_compliance_notifications" ADD CONSTRAINT "document_compliance_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_compliance_notifications" ADD CONSTRAINT "document_compliance_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
