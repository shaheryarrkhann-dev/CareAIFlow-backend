-- AlterEnum: Add billing actions to AuditAction enum
BEGIN;

CREATE TYPE "AuditAction_new" AS ENUM (
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
  'NOTE_CREATED',
  'NOTE_UPDATED',
  'NOTE_DELETED',
  'NOTE_EXPORTED',
  'BILLING_TIER_CREATED',
  'BILLING_TIER_UPDATED',
  'BILLING_TIER_DELETED',
  'RESIDENT_TIER_ASSIGNED',
  'RESIDENT_TIER_UPDATED',
  'INVOICE_GENERATED',
  'INVOICE_UPDATED',
  'INVOICE_STATUS_CHANGED',
  'INVOICE_EXPORTED',
  'SYSTEM_ERROR',
  'ACCESS_DENIED',
  'UNAUTHORIZED_ACCESS'
);

ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";

COMMIT;

-- CreateEnum: InvoiceStatus
CREATE TYPE "InvoiceStatus" AS ENUM ('Pending', 'Paid', 'Overdue');

-- CreateTable: billing_tiers
CREATE TABLE "billing_tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyRate" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: resident_billing
CREATE TABLE "resident_billing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "billingTierId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "resident_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invoices
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "residentBillingId" TEXT,
    "billingTierId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Pending',
    "dueDate" TIMESTAMP(3),
    "generatedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_tiers_tenantId_idx" ON "billing_tiers"("tenantId");

-- CreateIndex
CREATE INDEX "billing_tiers_tenantId_isActive_idx" ON "billing_tiers"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "resident_billing_tenantId_idx" ON "resident_billing"("tenantId");

-- CreateIndex
CREATE INDEX "resident_billing_residentId_idx" ON "resident_billing"("residentId");

-- CreateIndex
CREATE INDEX "resident_billing_billingTierId_idx" ON "resident_billing"("billingTierId");

-- CreateIndex
CREATE INDEX "resident_billing_tenantId_residentId_idx" ON "resident_billing"("tenantId", "residentId");

-- CreateIndex
CREATE INDEX "resident_billing_isActive_idx" ON "resident_billing"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "resident_billing_tenantId_residentId_isActive_key" ON "resident_billing"("tenantId", "residentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE INDEX "invoices_residentId_idx" ON "invoices"("residentId");

-- CreateIndex
CREATE INDEX "invoices_billingTierId_idx" ON "invoices"("billingTierId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_month_idx" ON "invoices"("month");

-- CreateIndex
CREATE INDEX "invoices_tenantId_month_idx" ON "invoices"("tenantId", "month");

-- CreateIndex
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_residentId_month_key" ON "invoices"("tenantId", "residentId", "month");

-- AddForeignKey
ALTER TABLE "billing_tiers" ADD CONSTRAINT "billing_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_billing" ADD CONSTRAINT "resident_billing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resident_billing" ADD CONSTRAINT "resident_billing_billingTierId_fkey" FOREIGN KEY ("billingTierId") REFERENCES "billing_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_residentBillingId_fkey" FOREIGN KEY ("residentBillingId") REFERENCES "resident_billing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billingTierId_fkey" FOREIGN KEY ("billingTierId") REFERENCES "billing_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

