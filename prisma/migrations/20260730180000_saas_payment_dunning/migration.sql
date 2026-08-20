-- AlterTable
ALTER TABLE "saas_subscriptions" ADD COLUMN IF NOT EXISTS "last_payment_failed_at" TIMESTAMP(3);
ALTER TABLE "saas_subscriptions" ADD COLUMN IF NOT EXISTS "last_dunning_email_at" TIMESTAMP(3);
