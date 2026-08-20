-- CreateTable
CREATE TABLE "onboarding_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'self_serve',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "currentStep" TEXT NOT NULL DEFAULT 'verify_email',
    "draftJson" JSONB NOT NULL DEFAULT '{}',
    "tenantId" TEXT,
    "startingPath" TEXT,
    "inviteSkippedAt" TIMESTAMP(3),
    "checklistJson" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_sessions_userId_key" ON "onboarding_sessions"("userId");

-- CreateIndex
CREATE INDEX "onboarding_sessions_status_idx" ON "onboarding_sessions"("status");

-- AddForeignKey
ALTER TABLE "onboarding_sessions" ADD CONSTRAINT "onboarding_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
