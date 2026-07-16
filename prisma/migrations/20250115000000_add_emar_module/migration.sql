-- CreateEnum: MedicationRoute (if not exists)
DO $$ BEGIN
 CREATE TYPE "MedicationRoute" AS ENUM ('Oral', 'IM', 'IV', 'Topical', 'Eye', 'Ear', 'Sublingual', 'Nasal', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ScheduleStatus (if not exists)
DO $$ BEGIN
 CREATE TYPE "ScheduleStatus" AS ENUM ('Pending', 'Given', 'Missed', 'Late', 'Skipped', 'Hold');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: MarStatus (if not exists)
DO $$ BEGIN
 CREATE TYPE "MarStatus" AS ENUM ('Given', 'Missed', 'Late', 'Skipped', 'Hold');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add new audit actions to AuditAction enum (only when type exists; created in 20251028)
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
   RETURN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MEDICATION_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_CREATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MEDICATION_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MEDICATION_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_DELETED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MEDICATION_ACTIVATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_ACTIVATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MEDICATION_DEACTIVATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MEDICATION_DEACTIVATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MAR_RECORD_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_CREATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MAR_RECORD_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MAR_RECORD_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_DELETED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MAR_RECORD_LOCKED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_LOCKED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MAR_RECORD_UNLOCKED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MAR_RECORD_UNLOCKED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PRN_RECORD_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'PRN_RECORD_CREATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PRN_RECORD_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'PRN_RECORD_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PRN_RECORD_COMPLETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'PRN_RECORD_COMPLETED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VITALS_RECORDED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'VITALS_RECORDED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VITALS_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'VITALS_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MAR_EXPORTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MAR_EXPORTED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MAR_SCHEDULE_GENERATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'MAR_SCHEDULE_GENERATED';
 END IF;
END $$;

-- CreateTable: medications (if not exists)
CREATE TABLE IF NOT EXISTS "medications" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "route" "MedicationRoute" NOT NULL,
    "frequency" TEXT NOT NULL,
    "timesPerDay" INTEGER,
    "timeSlots" JSONB,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrn" BOOLEAN NOT NULL DEFAULT false,
    "requiresVitals" BOOLEAN NOT NULL DEFAULT false,
    "vitalsType" TEXT,
    "prescriberName" TEXT,
    "prescriberPhone" TEXT,
    "pharmacyName" TEXT,
    "pharmacyPhone" TEXT,
    "specialInstructions" TEXT,
    "prescriptionPdfUrl" TEXT,
    "prescriptionS3Key" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: medication_schedules (if not exists)
CREATE TABLE IF NOT EXISTS "medication_schedules" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'Pending',
    "isMissed" BOOLEAN NOT NULL DEFAULT false,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateThreshold" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: mar_records (if not exists)
CREATE TABLE IF NOT EXISTS "mar_records" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "status" "MarStatus" NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "caregiverName" TEXT,
    "caregiverInitials" TEXT,
    "signature" TEXT,
    "signatureType" TEXT,
    "notes" TEXT,
    "residentResponse" TEXT,
    "vitalsId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,

    CONSTRAINT "mar_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: prn_records (if not exists)
CREATE TABLE IF NOT EXISTS "prn_records" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "symptom" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "caregiverName" TEXT,
    "caregiverInitials" TEXT,
    "signature" TEXT,
    "response" TEXT,
    "responseRecordedAt" TIMESTAMP(3),
    "physicianNotified" BOOLEAN NOT NULL DEFAULT false,
    "physicianNotifiedAt" TIMESTAMP(3),
    "physicianNotes" TEXT,
    "vitalsId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prn_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: vital_signs (if not exists)
CREATE TABLE IF NOT EXISTS "vital_signs" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "bloodPressureSystolic" INTEGER,
    "bloodPressureDiastolic" INTEGER,
    "pulse" INTEGER,
    "temperature" DECIMAL(4,1),
    "temperatureUnit" TEXT DEFAULT 'F',
    "oxygenSaturation" INTEGER,
    "weight" DECIMAL(5,2),
    "weightUnit" TEXT DEFAULT 'lbs',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedByName" TEXT,
    "medicationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vital_signs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: medication_prescriptions (if not exists)
CREATE TABLE IF NOT EXISTS "medication_prescriptions" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (if not exists)
CREATE INDEX IF NOT EXISTS "medications_residentId_idx" ON "medications"("residentId");
CREATE INDEX IF NOT EXISTS "medications_tenantId_idx" ON "medications"("tenantId");
CREATE INDEX IF NOT EXISTS "medications_tenantId_residentId_idx" ON "medications"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "medications_tenantId_residentId_isActive_idx" ON "medications"("tenantId", "residentId", "isActive");
CREATE INDEX IF NOT EXISTS "medications_isActive_idx" ON "medications"("isActive");

CREATE INDEX IF NOT EXISTS "medication_schedules_residentId_idx" ON "medication_schedules"("residentId");
CREATE INDEX IF NOT EXISTS "medication_schedules_tenantId_idx" ON "medication_schedules"("tenantId");
CREATE INDEX IF NOT EXISTS "medication_schedules_tenantId_residentId_idx" ON "medication_schedules"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "medication_schedules_scheduledDate_idx" ON "medication_schedules"("scheduledDate");
CREATE INDEX IF NOT EXISTS "medication_schedules_scheduledTime_idx" ON "medication_schedules"("scheduledTime");
CREATE INDEX IF NOT EXISTS "medication_schedules_status_idx" ON "medication_schedules"("status");
CREATE INDEX IF NOT EXISTS "medication_schedules_tenantId_scheduledDate_idx" ON "medication_schedules"("tenantId", "scheduledDate");

CREATE INDEX IF NOT EXISTS "mar_records_residentId_idx" ON "mar_records"("residentId");
CREATE INDEX IF NOT EXISTS "mar_records_tenantId_idx" ON "mar_records"("tenantId");
CREATE INDEX IF NOT EXISTS "mar_records_medicationId_idx" ON "mar_records"("medicationId");
CREATE INDEX IF NOT EXISTS "mar_records_caregiverId_idx" ON "mar_records"("caregiverId");
CREATE INDEX IF NOT EXISTS "mar_records_administeredAt_idx" ON "mar_records"("administeredAt");
CREATE INDEX IF NOT EXISTS "mar_records_tenantId_residentId_idx" ON "mar_records"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "mar_records_tenantId_residentId_administeredAt_idx" ON "mar_records"("tenantId", "residentId", "administeredAt");
CREATE INDEX IF NOT EXISTS "mar_records_scheduleId_idx" ON "mar_records"("scheduleId");

CREATE INDEX IF NOT EXISTS "prn_records_residentId_idx" ON "prn_records"("residentId");
CREATE INDEX IF NOT EXISTS "prn_records_tenantId_idx" ON "prn_records"("tenantId");
CREATE INDEX IF NOT EXISTS "prn_records_medicationId_idx" ON "prn_records"("medicationId");
CREATE INDEX IF NOT EXISTS "prn_records_caregiverId_idx" ON "prn_records"("caregiverId");
CREATE INDEX IF NOT EXISTS "prn_records_givenAt_idx" ON "prn_records"("givenAt");
CREATE INDEX IF NOT EXISTS "prn_records_tenantId_residentId_idx" ON "prn_records"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "prn_records_tenantId_residentId_givenAt_idx" ON "prn_records"("tenantId", "residentId", "givenAt");

CREATE INDEX IF NOT EXISTS "vital_signs_residentId_idx" ON "vital_signs"("residentId");
CREATE INDEX IF NOT EXISTS "vital_signs_tenantId_idx" ON "vital_signs"("tenantId");
CREATE INDEX IF NOT EXISTS "vital_signs_recordedAt_idx" ON "vital_signs"("recordedAt");
CREATE INDEX IF NOT EXISTS "vital_signs_tenantId_residentId_idx" ON "vital_signs"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "vital_signs_tenantId_residentId_recordedAt_idx" ON "vital_signs"("tenantId", "residentId", "recordedAt");
CREATE INDEX IF NOT EXISTS "vital_signs_medicationId_idx" ON "vital_signs"("medicationId");

CREATE INDEX IF NOT EXISTS "medication_prescriptions_medicationId_idx" ON "medication_prescriptions"("medicationId");
CREATE INDEX IF NOT EXISTS "medication_prescriptions_tenantId_idx" ON "medication_prescriptions"("tenantId");

-- CreateUniqueIndex (if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "medication_schedules_medicationId_scheduledTime_key" ON "medication_schedules"("medicationId", "scheduledTime");
CREATE UNIQUE INDEX IF NOT EXISTS "mar_records_scheduleId_key" ON "mar_records"("scheduleId");
CREATE UNIQUE INDEX IF NOT EXISTS "mar_records_vitalsId_key" ON "mar_records"("vitalsId");
CREATE UNIQUE INDEX IF NOT EXISTS "prn_records_vitalsId_key" ON "prn_records"("vitalsId");

-- AddForeignKey (if not exists)
DO $$ BEGIN
 ALTER TABLE "medications" ADD CONSTRAINT "medications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "medication_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_vitalsId_fkey" FOREIGN KEY ("vitalsId") REFERENCES "vital_signs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "prn_records" ADD CONSTRAINT "prn_records_vitalsId_fkey" FOREIGN KEY ("vitalsId") REFERENCES "vital_signs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "vital_signs" ADD CONSTRAINT "vital_signs_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "medication_prescriptions" ADD CONSTRAINT "medication_prescriptions_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "medication_prescriptions" ADD CONSTRAINT "medication_prescriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

