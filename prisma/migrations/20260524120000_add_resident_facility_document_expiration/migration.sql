-- Track expiration dates on resident and facility documents (document compliance).
ALTER TABLE "resident_documents" ADD COLUMN "expiration_date" DATE;
ALTER TABLE "facility_documents" ADD COLUMN "expiration_date" DATE;

CREATE INDEX "resident_documents_expiration_date_idx" ON "resident_documents"("expiration_date");
CREATE INDEX "facility_documents_expiration_date_idx" ON "facility_documents"("expiration_date");
