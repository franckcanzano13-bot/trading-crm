-- Phase 1.5 — Client withdrawal requests. Money moves only when a request is
-- APPROVED (same transaction as the WITHDRAWAL row and the segregation ledger).

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "method" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL DEFAULT '',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "transaction_id" TEXT,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "withdrawal_requests_tenant_id_status_requested_at_idx" ON "withdrawal_requests"("tenant_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_tenant_id_user_id_idx" ON "withdrawal_requests"("tenant_id", "user_id");
