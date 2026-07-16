-- CreateEnum
CREATE TYPE "StaffDocumentType" AS ENUM ('LICENSE', 'CERTIFICATION', 'TRAINING');

-- CreateTable
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_facility_assignments" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_facility_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_folders" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "documentType" "StaffDocumentType" NOT NULL,
    "folderId" TEXT,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "expirationDate" DATE,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_userId_key" ON "staff_members"("userId");

-- CreateIndex
CREATE INDEX "staff_members_tenantId_idx" ON "staff_members"("tenantId");

-- CreateIndex
CREATE INDEX "staff_members_userId_idx" ON "staff_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_facility_assignments_staffId_facilityId_key" ON "staff_facility_assignments"("staffId", "facilityId");

-- CreateIndex
CREATE INDEX "staff_facility_assignments_staffId_idx" ON "staff_facility_assignments"("staffId");

-- CreateIndex
CREATE INDEX "staff_facility_assignments_facilityId_idx" ON "staff_facility_assignments"("facilityId");

-- CreateIndex
CREATE INDEX "staff_folders_staffId_idx" ON "staff_folders"("staffId");

-- CreateIndex
CREATE INDEX "staff_folders_parentId_idx" ON "staff_folders"("parentId");

-- CreateIndex
CREATE INDEX "staff_documents_staffId_idx" ON "staff_documents"("staffId");

-- CreateIndex
CREATE INDEX "staff_documents_folderId_idx" ON "staff_documents"("folderId");

-- CreateIndex
CREATE INDEX "staff_documents_documentType_idx" ON "staff_documents"("documentType");

-- CreateIndex
CREATE INDEX "staff_documents_expirationDate_idx" ON "staff_documents"("expirationDate");

-- CreateIndex
CREATE INDEX "staff_documents_staffId_documentType_idx" ON "staff_documents"("staffId", "documentType");

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_facility_assignments" ADD CONSTRAINT "staff_facility_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_facility_assignments" ADD CONSTRAINT "staff_facility_assignments_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_folders" ADD CONSTRAINT "staff_folders_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_folders" ADD CONSTRAINT "staff_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "staff_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "staff_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add AuditAction enum values
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_MEMBER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_MEMBER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_MEMBER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_FACILITY_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_FACILITY_UNASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_FOLDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_FOLDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_FOLDER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_DOCUMENT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_DOCUMENT_MODIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_DOCUMENT_DELETED';
