-- Phase 2.2 — Stripe billing: plans map to Stripe prices, subscriptions and
-- invoices carry their Stripe ids, past-due tracking for the grace period.
ALTER TABLE "plans" ADD COLUMN "stripe_price_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "stripe_subscription_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "past_due_since" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "stripe_invoice_id" TEXT;
ALTER TABLE "invoices" ADD COLUMN "hosted_invoice_url" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");
CREATE INDEX "subscriptions_status_past_due_since_idx" ON "subscriptions"("status", "past_due_since");
