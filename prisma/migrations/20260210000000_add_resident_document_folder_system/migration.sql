-- CreateEnum
CREATE TYPE "ResidentDocumentCategory" AS ENUM ('LEGAL', 'MEDICAL', 'EXTERNAL_REPORT', 'OTHER');

-- CreateTable
CREATE TABLE "resident_folders" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resident_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resident_documents" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "folderId" TEXT,
    "category" "ResidentDocumentCategory",
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resident_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resident_folders_residentId_idx" ON "resident_folders"("residentId");

-- CreateIndex
CREATE INDEX "resident_folders_parentId_idx" ON "resident_folders"("parentId");

-- CreateIndex
CREATE INDEX "resident_documents_residentId_idx" ON "resident_documents"("residentId");

-- CreateIndex
CREATE INDEX "resident_documents_folderId_idx" ON "resident_documents"("folderId");

-- CreateIndex
CREATE INDEX "resident_documents_category_idx" ON "resident_documents"("category");

-- CreateIndex
CREATE INDEX "resident_documents_isPinned_idx" ON "resident_documents"("isPinned");

-- AddForeignKey
ALTER TABLE "resident_folders" ADD CONSTRAINT "resident_folders_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_folders" ADD CONSTRAINT "resident_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "resident_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_documents" ADD CONSTRAINT "resident_documents_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_documents" ADD CONSTRAINT "resident_documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "resident_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add AuditAction enum values
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_FOLDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_FOLDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_FOLDER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_DOCUMENT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_DOCUMENT_MODIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_DOCUMENT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_DOCUMENT_PINNED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_DOCUMENT_UNPINNED';
