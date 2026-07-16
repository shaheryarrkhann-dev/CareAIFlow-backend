-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'TOKEN_REFRESH',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_SUCCESS',
  'EMAIL_VERIFICATION',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'USER_INVITED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'TENANT_CREATED',
  'TENANT_UPDATED',
  'TENANT_DELETED',
  'TENANT_ACTIVATED',
  'TENANT_DEACTIVATED',
  'FORM_CREATED',
  'FORM_UPDATED',
  'FORM_DELETED',
  'FORM_SUBMITTED',
  'FORM_DRAFT_SAVED',
  'FORM_DRAFT_DELETED',
  'PDF_UPLOADED',
  'PDF_GENERATED',
  'PDF_DOWNLOADED',
  'PDF_DELETED',
  'PDF_TEMPLATE_CREATED',
  'PDF_TEMPLATE_UPDATED',
  'PDF_TEMPLATE_DELETED',
  'EMBEDDING_CREATED',
  'EMBEDDING_DELETED',
  'EMBEDDING_QUERIED',
  'SYSTEM_ERROR',
  'ACCESS_DENIED',
  'UNAUTHORIZED_ACCESS'
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "method" TEXT,
    "endpoint" TEXT,
    "statusCode" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestData" JSONB,
    "responseData" JSONB,
    "errorMessage" TEXT,
    "duration" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

