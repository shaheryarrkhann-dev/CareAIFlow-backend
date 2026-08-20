-- AlterTable: add visitor contact info, free-text person visited, expected duration, and reminder tracking
ALTER TABLE "visitor_logs" ADD COLUMN "person_visited_name" VARCHAR(255);
ALTER TABLE "visitor_logs" ADD COLUMN "visitor_email" VARCHAR(255);
ALTER TABLE "visitor_logs" ADD COLUMN "visitor_phone" VARCHAR(50);
ALTER TABLE "visitor_logs" ADD COLUMN "expected_duration_minutes" INTEGER;
ALTER TABLE "visitor_logs" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);

CREATE INDEX "visitor_logs_checkOutAt_idx" ON "visitor_logs"("checkOutAt");
