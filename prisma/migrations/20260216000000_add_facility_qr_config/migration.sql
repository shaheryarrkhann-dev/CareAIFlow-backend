-- CreateTable
CREATE TABLE "facility_qr_configs" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "instruction_text" VARCHAR(500),
    "disclaimer_text" VARCHAR(1000),
    "layout_option" VARCHAR(50),
    "facility_display_name" VARCHAR(255),
    "logo_url" VARCHAR(2048),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_qr_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facility_qr_configs_facilityId_key" ON "facility_qr_configs"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "facility_qr_configs_token_key" ON "facility_qr_configs"("token");

-- CreateIndex
CREATE INDEX "facility_qr_configs_token_idx" ON "facility_qr_configs"("token");

-- AddForeignKey
ALTER TABLE "facility_qr_configs" ADD CONSTRAINT "facility_qr_configs_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
