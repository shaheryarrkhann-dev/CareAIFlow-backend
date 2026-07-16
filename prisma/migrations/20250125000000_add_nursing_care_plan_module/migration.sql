-- CreateEnum: CarePlanStatus
DO $$ BEGIN
 CREATE TYPE "CarePlanStatus" AS ENUM ('Active', 'Archived', 'Draft', 'PendingReview');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ProblemCategory
DO $$ BEGIN
 CREATE TYPE "ProblemCategory" AS ENUM ('Medical', 'Behavioral', 'Functional', 'Social', 'Other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: GoalStatus
DO $$ BEGIN
 CREATE TYPE "GoalStatus" AS ENUM ('InProgress', 'Achieved', 'NotAchieved', 'Discontinued');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: InterventionFrequency
DO $$ BEGIN
 CREATE TYPE "InterventionFrequency" AS ENUM ('Daily', 'TwiceDaily', 'Weekly', 'PRN', 'AsNeeded', 'Custom');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: AlertType
DO $$ BEGIN
 CREATE TYPE "AlertType" AS ENUM ('ReviewDue', 'NewDiagnosis', 'GoalNotMet', 'InterventionOverdue');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add new audit actions to AuditAction enum
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_CREATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_ARCHIVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_ARCHIVED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_APPROVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_APPROVED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_PROBLEM_ADDED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_PROBLEM_ADDED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_PROBLEM_REMOVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_PROBLEM_REMOVED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_GOAL_ADDED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_GOAL_ADDED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_GOAL_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_GOAL_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_INTERVENTION_ADDED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_INTERVENTION_ADDED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_INTERVENTION_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_INTERVENTION_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_VERSION_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_VERSION_CREATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_PLAN_EXPORTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_PLAN_EXPORTED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_LIBRARY_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_LIBRARY_CREATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_LIBRARY_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_LIBRARY_UPDATED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CARE_LIBRARY_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
   ALTER TYPE "AuditAction" ADD VALUE 'CARE_LIBRARY_DELETED';
 END IF;
END $$;

-- CreateTable: care_plans
CREATE TABLE IF NOT EXISTS "care_plans" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "status" "CarePlanStatus" NOT NULL DEFAULT 'Draft',
    "title" TEXT,
    "description" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "reviewIntervalDays" INTEGER DEFAULT 30,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByName" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "currentVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable: care_plan_problems
CREATE TABLE IF NOT EXISTS "care_plan_problems" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ProblemCategory" NOT NULL DEFAULT 'Medical',
    "description" TEXT,
    "diagnosisCode" TEXT,
    "onsetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "care_plan_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable: care_plan_goals
CREATE TABLE IF NOT EXISTS "care_plan_goals" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'InProgress',
    "targetDate" TIMESTAMP(3),
    "achievedDate" TIMESTAMP(3),
    "evaluationNotes" TEXT,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "care_plan_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable: care_plan_interventions
CREATE TABLE IF NOT EXISTS "care_plan_interventions" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frequency" "InterventionFrequency" NOT NULL DEFAULT 'Daily',
    "customFrequency" TEXT,
    "timesPerDay" INTEGER,
    "timeSlots" JSONB,
    "responsibleRole" TEXT,
    "responsibleStaffId" TEXT,
    "medicationId" TEXT,
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "care_plan_interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: care_plan_versions
CREATE TABLE IF NOT EXISTS "care_plan_versions" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "residentId" TEXT NOT NULL,
    "residentName" TEXT,
    "tenantId" TEXT NOT NULL,
    "status" "CarePlanStatus" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "reviewIntervalDays" INTEGER,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByName" TEXT,
    "problemsSnapshot" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: care_library
CREATE TABLE IF NOT EXISTS "care_library" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProblemCategory" NOT NULL DEFAULT 'Medical',
    "description" TEXT,
    "templateData" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "care_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable: care_plan_alerts
CREATE TABLE IF NOT EXISTS "care_plan_alerts" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "alertType" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "dismissedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "care_plan_alerts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: care_plans -> tenants
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: care_plans -> users (creator)
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: care_plan_problems -> care_plans
ALTER TABLE "care_plan_problems" ADD CONSTRAINT "care_plan_problems_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "care_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: care_plan_goals -> care_plan_problems
ALTER TABLE "care_plan_goals" ADD CONSTRAINT "care_plan_goals_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "care_plan_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: care_plan_interventions -> care_plan_goals
ALTER TABLE "care_plan_interventions" ADD CONSTRAINT "care_plan_interventions_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "care_plan_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: care_plan_versions -> care_plans
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "care_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: care_plan_versions -> users (creator)
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: care_library -> tenants
ALTER TABLE "care_library" ADD CONSTRAINT "care_library_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: care_library -> users (creator)
ALTER TABLE "care_library" ADD CONSTRAINT "care_library_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: care_plan_alerts -> care_plans
ALTER TABLE "care_plan_alerts" ADD CONSTRAINT "care_plan_alerts_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "care_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: care_plans indexes
CREATE INDEX IF NOT EXISTS "care_plans_residentId_idx" ON "care_plans"("residentId");
CREATE INDEX IF NOT EXISTS "care_plans_tenantId_idx" ON "care_plans"("tenantId");
CREATE INDEX IF NOT EXISTS "care_plans_status_idx" ON "care_plans"("status");
CREATE INDEX IF NOT EXISTS "care_plans_createdBy_idx" ON "care_plans"("createdBy");
CREATE INDEX IF NOT EXISTS "care_plans_tenantId_residentId_idx" ON "care_plans"("tenantId", "residentId");
CREATE INDEX IF NOT EXISTS "care_plans_tenantId_residentId_status_idx" ON "care_plans"("tenantId", "residentId", "status");
CREATE INDEX IF NOT EXISTS "care_plans_nextReviewDate_idx" ON "care_plans"("nextReviewDate");
CREATE INDEX IF NOT EXISTS "care_plans_deletedAt_idx" ON "care_plans"("deletedAt");

-- CreateIndex: care_plan_problems indexes
CREATE INDEX IF NOT EXISTS "care_plan_problems_carePlanId_idx" ON "care_plan_problems"("carePlanId");
CREATE INDEX IF NOT EXISTS "care_plan_problems_category_idx" ON "care_plan_problems"("category");
CREATE INDEX IF NOT EXISTS "care_plan_problems_deletedAt_idx" ON "care_plan_problems"("deletedAt");

-- CreateIndex: care_plan_goals indexes
CREATE INDEX IF NOT EXISTS "care_plan_goals_problemId_idx" ON "care_plan_goals"("problemId");
CREATE INDEX IF NOT EXISTS "care_plan_goals_status_idx" ON "care_plan_goals"("status");
CREATE INDEX IF NOT EXISTS "care_plan_goals_targetDate_idx" ON "care_plan_goals"("targetDate");
CREATE INDEX IF NOT EXISTS "care_plan_goals_deletedAt_idx" ON "care_plan_goals"("deletedAt");

-- CreateIndex: care_plan_interventions indexes
CREATE INDEX IF NOT EXISTS "care_plan_interventions_goalId_idx" ON "care_plan_interventions"("goalId");
CREATE INDEX IF NOT EXISTS "care_plan_interventions_frequency_idx" ON "care_plan_interventions"("frequency");
CREATE INDEX IF NOT EXISTS "care_plan_interventions_responsibleStaffId_idx" ON "care_plan_interventions"("responsibleStaffId");
CREATE INDEX IF NOT EXISTS "care_plan_interventions_medicationId_idx" ON "care_plan_interventions"("medicationId");
CREATE INDEX IF NOT EXISTS "care_plan_interventions_deletedAt_idx" ON "care_plan_interventions"("deletedAt");

-- CreateIndex: care_plan_versions indexes
CREATE UNIQUE INDEX IF NOT EXISTS "care_plan_versions_carePlanId_version_key" ON "care_plan_versions"("carePlanId", "version");
CREATE INDEX IF NOT EXISTS "care_plan_versions_carePlanId_idx" ON "care_plan_versions"("carePlanId");
CREATE INDEX IF NOT EXISTS "care_plan_versions_carePlanId_version_idx" ON "care_plan_versions"("carePlanId", "version");
CREATE INDEX IF NOT EXISTS "care_plan_versions_createdBy_idx" ON "care_plan_versions"("createdBy");
CREATE INDEX IF NOT EXISTS "care_plan_versions_createdAt_idx" ON "care_plan_versions"("createdAt");

-- CreateIndex: care_library indexes
CREATE INDEX IF NOT EXISTS "care_library_tenantId_idx" ON "care_library"("tenantId");
CREATE INDEX IF NOT EXISTS "care_library_category_idx" ON "care_library"("category");
CREATE INDEX IF NOT EXISTS "care_library_isActive_idx" ON "care_library"("isActive");
CREATE INDEX IF NOT EXISTS "care_library_deletedAt_idx" ON "care_library"("deletedAt");

-- CreateIndex: care_plan_alerts indexes
CREATE INDEX IF NOT EXISTS "care_plan_alerts_carePlanId_idx" ON "care_plan_alerts"("carePlanId");
CREATE INDEX IF NOT EXISTS "care_plan_alerts_alertType_idx" ON "care_plan_alerts"("alertType");
CREATE INDEX IF NOT EXISTS "care_plan_alerts_isDismissed_idx" ON "care_plan_alerts"("isDismissed");
CREATE INDEX IF NOT EXISTS "care_plan_alerts_createdAt_idx" ON "care_plan_alerts"("createdAt");

