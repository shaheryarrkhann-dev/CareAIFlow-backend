-- Add deletedAt column to notes table for soft delete
-- This migration is safe - it only adds a nullable column
-- All existing notes will have deletedAt = NULL (not deleted)

-- AlterEnum: Add NOTE_DELETED to AuditAction enum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'TOKEN_REFRESH', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_SUCCESS', 'EMAIL_VERIFICATION', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_INVITED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'TENANT_CREATED', 'TENANT_UPDATED', 'TENANT_DELETED', 'TENANT_ACTIVATED', 'TENANT_DEACTIVATED', 'FORM_CREATED', 'FORM_UPDATED', 'FORM_DELETED', 'FORM_SUBMITTED', 'FORM_DRAFT_SAVED', 'FORM_DRAFT_DELETED', 'PDF_UPLOADED', 'PDF_GENERATED', 'PDF_DOWNLOADED', 'PDF_DELETED', 'PDF_TEMPLATE_CREATED', 'PDF_TEMPLATE_UPDATED', 'PDF_TEMPLATE_DELETED', 'EMBEDDING_CREATED', 'EMBEDDING_DELETED', 'EMBEDDING_QUERIED', 'NOTE_CREATED', 'NOTE_UPDATED', 'NOTE_DELETED', 'NOTE_EXPORTED', 'SYSTEM_ERROR', 'ACCESS_DENIED', 'UNAUTHORIZED_ACCESS');
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";
COMMIT;

-- AlterTable: Add deletedAt column to notes table (nullable - existing rows will have NULL)
ALTER TABLE "notes" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex: Add index on deletedAt for better query performance
CREATE INDEX "notes_deletedAt_idx" ON "notes"("deletedAt");

