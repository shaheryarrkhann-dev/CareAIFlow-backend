-- CreateTable
CREATE TABLE "lead_inquiries" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "facilities" TEXT NOT NULL,
    "population" TEXT NOT NULL,
    "phone" TEXT,
    "currentSystem" TEXT,
    "message" TEXT NOT NULL,
    "privacyAccepted" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT DEFAULT 'landing_contact',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_inquiries_createdAt_idx" ON "lead_inquiries"("createdAt");

-- CreateIndex
CREATE INDEX "lead_inquiries_email_idx" ON "lead_inquiries"("email");

-- CreateIndex
CREATE INDEX "lead_inquiries_status_idx" ON "lead_inquiries"("status");
