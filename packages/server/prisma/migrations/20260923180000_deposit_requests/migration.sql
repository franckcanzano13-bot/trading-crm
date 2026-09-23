-- Phase 2.5a — Client deposit declarations. The account is credited only on
-- CONFIRMED, in the same transaction as the DEPOSIT row and the ledger.
CREATE TABLE "deposit_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "credited_cents" BIGINT,
    "method" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL DEFAULT '',
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "transaction_id" TEXT,

    CONSTRAINT "deposit_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deposit_requests_tenant_id_status_declared_at_idx" ON "deposit_requests"("tenant_id", "status", "declared_at");
CREATE INDEX "deposit_requests_tenant_id_user_id_idx" ON "deposit_requests"("tenant_id", "user_id");
