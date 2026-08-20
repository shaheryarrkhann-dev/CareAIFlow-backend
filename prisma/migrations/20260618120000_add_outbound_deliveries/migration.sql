-- CreateTable
CREATE TABLE "outbound_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT,
    "filename" TEXT,
    "recipient_name" TEXT,
    "sender_name" TEXT,
    "source_module" TEXT,
    "job_id" TEXT,
    "error_message" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbound_deliveries_tenant_id_idx" ON "outbound_deliveries"("tenant_id");

-- CreateIndex
CREATE INDEX "outbound_deliveries_tenant_id_type_idx" ON "outbound_deliveries"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "outbound_deliveries_tenant_id_created_at_idx" ON "outbound_deliveries"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "outbound_deliveries_created_by_idx" ON "outbound_deliveries"("created_by");

-- AddForeignKey
ALTER TABLE "outbound_deliveries" ADD CONSTRAINT "outbound_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
