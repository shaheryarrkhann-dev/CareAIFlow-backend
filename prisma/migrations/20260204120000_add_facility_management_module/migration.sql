-- CreateEnum
CREATE TYPE "EvacuationDrillType" AS ENUM ('REGULAR', 'ANNUAL_FULL');

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "address" TEXT,
    "capacity" INTEGER,
    "licenseExpirationDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_folders" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_documents" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "folderId" TEXT,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evacuation_drills" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "drillType" "EvacuationDrillType" NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "completedDate" DATE,
    "completedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evacuation_drills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_logs" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "residentId" TEXT,
    "visitorName" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id")
);

-- Add Facility Management audit actions to AuditAction enum
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_PROFILE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_PROFILE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_DOCUMENT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_DOCUMENT_MODIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_DOCUMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_FOLDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_FOLDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'FACILITY_FOLDER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'EVACUATION_DRILL_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EVACUATION_DRILL_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'VISITOR_CHECK_IN';
ALTER TYPE "AuditAction" ADD VALUE 'VISITOR_CHECK_OUT';

-- CreateIndex
CREATE UNIQUE INDEX "facilities_tenantId_key" ON "facilities"("tenantId");

-- CreateIndex
CREATE INDEX "facility_folders_facilityId_idx" ON "facility_folders"("facilityId");

-- CreateIndex
CREATE INDEX "facility_folders_parentId_idx" ON "facility_folders"("parentId");

-- CreateIndex
CREATE INDEX "facility_documents_facilityId_idx" ON "facility_documents"("facilityId");

-- CreateIndex
CREATE INDEX "facility_documents_folderId_idx" ON "facility_documents"("folderId");

-- CreateIndex
CREATE INDEX "evacuation_drills_facilityId_idx" ON "evacuation_drills"("facilityId");

-- CreateIndex
CREATE INDEX "evacuation_drills_scheduledDate_idx" ON "evacuation_drills"("scheduledDate");

-- CreateIndex
CREATE INDEX "evacuation_drills_completedDate_idx" ON "evacuation_drills"("completedDate");

-- CreateIndex
CREATE INDEX "visitor_logs_facilityId_idx" ON "visitor_logs"("facilityId");

-- CreateIndex
CREATE INDEX "visitor_logs_residentId_idx" ON "visitor_logs"("residentId");

-- CreateIndex
CREATE INDEX "visitor_logs_checkInAt_idx" ON "visitor_logs"("checkInAt");

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_folders" ADD CONSTRAINT "facility_folders_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_folders" ADD CONSTRAINT "facility_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "facility_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_documents" ADD CONSTRAINT "facility_documents_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_documents" ADD CONSTRAINT "facility_documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "facility_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evacuation_drills" ADD CONSTRAINT "evacuation_drills_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_logs" ADD CONSTRAINT "visitor_logs_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
