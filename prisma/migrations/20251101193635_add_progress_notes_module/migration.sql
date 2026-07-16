/*
  Warnings:

  - The values [RESIDENT_CREATED,RESIDENT_UPDATED,RESIDENT_DELETED] on the enum `AuditAction` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `residents` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'TOKEN_REFRESH', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_SUCCESS', 'EMAIL_VERIFICATION', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_INVITED', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'TENANT_CREATED', 'TENANT_UPDATED', 'TENANT_DELETED', 'TENANT_ACTIVATED', 'TENANT_DEACTIVATED', 'FORM_CREATED', 'FORM_UPDATED', 'FORM_DELETED', 'FORM_SUBMITTED', 'FORM_DRAFT_SAVED', 'FORM_DRAFT_DELETED', 'PDF_UPLOADED', 'PDF_GENERATED', 'PDF_DOWNLOADED', 'PDF_DELETED', 'PDF_TEMPLATE_CREATED', 'PDF_TEMPLATE_UPDATED', 'PDF_TEMPLATE_DELETED', 'EMBEDDING_CREATED', 'EMBEDDING_DELETED', 'EMBEDDING_QUERIED', 'NOTE_CREATED', 'NOTE_UPDATED', 'NOTE_EXPORTED', 'SYSTEM_ERROR', 'ACCESS_DENIED', 'UNAUTHORIZED_ACCESS');
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_residentId_fkey";

-- DropForeignKey
ALTER TABLE "residents" DROP CONSTRAINT "residents_tenantId_fkey";

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "residentName" TEXT;

-- DropTable
DROP TABLE "residents";
