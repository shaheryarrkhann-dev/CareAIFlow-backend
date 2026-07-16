-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('Care', 'Behavior', 'Incident', 'StatusUpdate');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'NOTE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'NOTE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'NOTE_EXPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'RESIDENT_DELETED';

-- CreateTable
CREATE TABLE "residents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_versions" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "oldDescription" TEXT NOT NULL,
    "newDescription" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "residents_tenantId_idx" ON "residents"("tenantId");

-- CreateIndex
CREATE INDEX "residents_tenantId_firstName_lastName_idx" ON "residents"("tenantId", "firstName", "lastName");

-- CreateIndex
CREATE INDEX "notes_residentId_idx" ON "notes"("residentId");

-- CreateIndex
CREATE INDEX "notes_staffId_idx" ON "notes"("staffId");

-- CreateIndex
CREATE INDEX "notes_tenantId_idx" ON "notes"("tenantId");

-- CreateIndex
CREATE INDEX "notes_type_idx" ON "notes"("type");

-- CreateIndex
CREATE INDEX "notes_createdAt_idx" ON "notes"("createdAt");

-- CreateIndex
CREATE INDEX "notes_tenantId_residentId_idx" ON "notes"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "notes_tenantId_type_idx" ON "notes"("tenantId", "type");

-- CreateIndex
CREATE INDEX "notes_tenantId_createdAt_idx" ON "notes"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "note_versions_noteId_idx" ON "note_versions"("noteId");

-- CreateIndex
CREATE INDEX "note_versions_editedBy_idx" ON "note_versions"("editedBy");

-- CreateIndex
CREATE INDEX "note_versions_editedAt_idx" ON "note_versions"("editedAt");

-- AddForeignKey
ALTER TABLE "residents" ADD CONSTRAINT "residents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "residents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
