-- CreateTable
CREATE TABLE "appointment_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "reminderId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_notifications_tenantId_idx" ON "appointment_notifications"("tenantId");

-- CreateIndex
CREATE INDEX "appointment_notifications_userId_idx" ON "appointment_notifications"("userId");

-- CreateIndex
CREATE INDEX "appointment_notifications_readAt_idx" ON "appointment_notifications"("readAt");

-- CreateIndex
CREATE INDEX "appointment_notifications_createdAt_idx" ON "appointment_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "appointment_notifications_userId_readAt_idx" ON "appointment_notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "appointment_notifications" ADD CONSTRAINT "appointment_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_notifications" ADD CONSTRAINT "appointment_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
