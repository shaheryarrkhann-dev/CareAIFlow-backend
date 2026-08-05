-- CreateEnum: InvoiceStatus (if not exists)
DO $$ BEGIN
 CREATE TYPE "InvoiceStatus" AS ENUM ('Pending', 'Paid', 'Overdue');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateTable: billing_tiers (if not exists)
CREATE TABLE IF NOT EXISTS "billing_tiers" (
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

-- CreateTable: resident_billing (if not exists)
CREATE TABLE IF NOT EXISTS "resident_billing" (
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

-- CreateTable: invoices (if not exists)
CREATE TABLE IF NOT EXISTS "invoices" (
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

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "billing_tiers_tenantId_idx" ON "billing_tiers"("tenantId");
CREATE INDEX IF NOT EXISTS "billing_tiers_tenantId_isActive_idx" ON "billing_tiers"("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "resident_billing_tenantId_idx" ON "resident_billing"("tenantId");
CREATE INDEX IF NOT EXISTS "resident_billing_residentId_idx" ON "resident_billing"("residentId");
CREATE INDEX IF NOT EXISTS "resident_billing_billingTierId_idx" ON "resident_billing"("billingTierId");
CREATE INDEX IF NOT EXISTS "resident_billing_tenantId_residentId_idx" ON "resident_billing"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "resident_billing_isActive_idx" ON "resident_billing"("isActive");
CREATE INDEX IF NOT EXISTS "invoices_tenantId_idx" ON "invoices"("tenantId");
CREATE INDEX IF NOT EXISTS "invoices_residentId_idx" ON "invoices"("residentId");
CREATE INDEX IF NOT EXISTS "invoices_billingTierId_idx" ON "invoices"("billingTierId");
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices"("status");
CREATE INDEX IF NOT EXISTS "invoices_month_idx" ON "invoices"("month");
CREATE INDEX IF NOT EXISTS "invoices_tenantId_month_idx" ON "invoices"("tenantId", "month");
CREATE INDEX IF NOT EXISTS "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");

-- CreateUniqueIndex (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "resident_billing_tenantId_residentId_isActive_key" ON "resident_billing"("tenantId", "residentId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_tenantId_residentId_month_key" ON "invoices"("tenantId", "residentId", "month");

-- AddForeignKey (if not exists)
DO $$ BEGIN
 ALTER TABLE "billing_tiers" ADD CONSTRAINT "billing_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "resident_billing" ADD CONSTRAINT "resident_billing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "resident_billing" ADD CONSTRAINT "resident_billing_billingTierId_fkey" FOREIGN KEY ("billingTierId") REFERENCES "billing_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_residentBillingId_fkey" FOREIGN KEY ("residentBillingId") REFERENCES "resident_billing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billingTierId_fkey" FOREIGN KEY ("billingTierId") REFERENCES "billing_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

