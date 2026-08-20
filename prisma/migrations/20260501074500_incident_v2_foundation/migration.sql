-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('Low', 'Medium', 'High');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('PENDING', 'PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "IncidentActivityAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'INTERNAL_NOTE_UPDATED', 'COMPLIANCE_CHECKED');

-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE 'INCIDENT_REPORT_CREATED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE 'INCIDENT_REPORT_UPDATED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE 'INCIDENT_STATUS_CHANGED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE 'INCIDENT_COMPLIANCE_CHECKED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "incident_reports"
ADD COLUMN "incidentTypeOtherText" TEXT,
ADD COLUMN "severity" "IncidentSeverity",
ADD COLUMN "severityReason" TEXT,
ADD COLUMN "complianceStatus" "ComplianceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "complianceCheckedAt" TIMESTAMP(3),
ADD COLUMN "aiMeta" JSONB;

-- CreateTable
CREATE TABLE "incident_activities" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "action" "IncidentActivityAction" NOT NULL,
  "actorUserId" TEXT,
  "actorUserName" TEXT,
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "incident_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_activities_incidentId_idx" ON "incident_activities"("incidentId");
CREATE INDEX "incident_activities_tenantId_idx" ON "incident_activities"("tenantId");
CREATE INDEX "incident_activities_action_idx" ON "incident_activities"("action");
CREATE INDEX "incident_activities_createdAt_idx" ON "incident_activities"("createdAt");
CREATE INDEX "incident_activities_incidentId_createdAt_idx" ON "incident_activities"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "incident_activities" ADD CONSTRAINT "incident_activities_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_activities" ADD CONSTRAINT "incident_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_activities" ADD CONSTRAINT "incident_activities_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
