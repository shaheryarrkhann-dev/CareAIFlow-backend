-- CreateTable: claims_billing_records
CREATE TABLE IF NOT EXISTS "claims_billing_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "billingMonth" TIMESTAMP(3) NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "excelSheetName" TEXT NOT NULL,

    -- Provider Fields
    "providerName" TEXT,
    "providerId" TEXT,
    "tinSsnEin" TEXT,
    "billingProviderNpi" TEXT,
    "billingProviderTaxonomy" TEXT,
    "billingProviderStreet" TEXT,
    "billingProviderCity" TEXT,
    "billingProviderState" TEXT,
    "billingProviderZip" TEXT,

    -- Service Fields
    "tierId" TEXT,
    "tierUnitCost" DECIMAL(10,2),
    "serviceCode" TEXT,
    "modifier1" TEXT,
    "modifier2" TEXT,
    "units" INTEGER,
    "claimBilledAmount" DECIMAL(10,2),

    -- Client Fields
    "clientAddress" TEXT,
    "clientCity" TEXT,
    "clientState" TEXT,
    "clientZip" TEXT,
    "placeOfService" TEXT,
    "clientId" TEXT,
    "clientLastName" TEXT,
    "clientFirstName" TEXT,
    "clientGender" TEXT,
    "clientDob" TIMESTAMP(3),
    "diagnosisCode" TEXT,

    -- Service Dates
    "serviceFromDate" TIMESTAMP(3),
    "serviceToDate" TIMESTAMP(3),

    -- MCO Fields
    "originalClaimId" TEXT,
    "frequencyCode" TEXT,

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "claims_billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: claims_billing_tiers
CREATE TABLE IF NOT EXISTS "claims_billing_tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tierNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "modifier1" TEXT,
    "modifier2" TEXT,
    "serviceCode" TEXT NOT NULL DEFAULT 'S5126',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_billing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: claims_provider_settings
CREATE TABLE IF NOT EXISTS "claims_provider_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerId" TEXT,
    "tinSsnEin" TEXT NOT NULL,
    "billingProviderNpi" TEXT NOT NULL,
    "billingProviderTaxonomy" TEXT NOT NULL,
    "billingProviderStreet" TEXT NOT NULL,
    "billingProviderCity" TEXT NOT NULL,
    "billingProviderState" TEXT NOT NULL,
    "billingProviderZip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_provider_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "claims_billing_records_tenantId_idx" ON "claims_billing_records"("tenantId");
CREATE INDEX IF NOT EXISTS "claims_billing_records_residentId_idx" ON "claims_billing_records"("residentId");
CREATE INDEX IF NOT EXISTS "claims_billing_records_billingMonth_idx" ON "claims_billing_records"("billingMonth");
CREATE INDEX IF NOT EXISTS "claims_billing_records_tenantId_residentId_idx" ON "claims_billing_records"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "claims_billing_records_tierId_idx" ON "claims_billing_records"("tierId");

CREATE INDEX IF NOT EXISTS "claims_billing_tiers_tenantId_idx" ON "claims_billing_tiers"("tenantId");
CREATE INDEX IF NOT EXISTS "claims_billing_tiers_tenantId_isActive_idx" ON "claims_billing_tiers"("tenantId", "isActive");

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "claims_billing_records_tenantId_residentId_billingMonth_key" ON "claims_billing_records"("tenantId", "residentId", "billingMonth");
CREATE UNIQUE INDEX IF NOT EXISTS "claims_billing_tiers_tenantId_tierNumber_key" ON "claims_billing_tiers"("tenantId", "tierNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "claims_provider_settings_tenantId_key" ON "claims_provider_settings"("tenantId");

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "claims_billing_records" ADD CONSTRAINT "claims_billing_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "claims_billing_records" ADD CONSTRAINT "claims_billing_records_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "claims_billing_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "claims_billing_tiers" ADD CONSTRAINT "claims_billing_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "claims_provider_settings" ADD CONSTRAINT "claims_provider_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

