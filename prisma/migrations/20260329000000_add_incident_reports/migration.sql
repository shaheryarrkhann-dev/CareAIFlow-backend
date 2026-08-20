-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "incidentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "location" TEXT,
    "payload" JSONB NOT NULL,
    "staffId" TEXT,
    "staffName" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_reports_tenantId_idx" ON "incident_reports"("tenantId");
CREATE INDEX "incident_reports_residentId_idx" ON "incident_reports"("residentId");
CREATE INDEX "incident_reports_occurredAt_idx" ON "incident_reports"("occurredAt");
CREATE INDEX "incident_reports_incidentType_idx" ON "incident_reports"("incidentType");
CREATE INDEX "incident_reports_status_idx" ON "incident_reports"("status");
CREATE INDEX "incident_reports_tenantId_occurredAt_idx" ON "incident_reports"("tenantId", "occurredAt");
CREATE INDEX "incident_reports_deletedAt_idx" ON "incident_reports"("deletedAt");

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
