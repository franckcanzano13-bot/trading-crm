-- Sprint 7.6 — Client Funds Segregation Ledger.
-- Double-entry append-only table for tracking client-money movements
-- separately from broker operating funds. See schema.prisma comment for
-- the ledger semantics; ADR-010 for the design rationale.

CREATE TABLE "client_funds_ledger" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_funds_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_funds_ledger_tenant_id_pool_created_at_idx"
  ON "client_funds_ledger"("tenant_id", "pool", "created_at");

CREATE INDEX "client_funds_ledger_tenant_id_account_id_created_at_idx"
  ON "client_funds_ledger"("tenant_id", "account_id", "created_at");

CREATE INDEX "client_funds_ledger_reference_idx"
  ON "client_funds_ledger"("reference");

-- Defense-in-depth: the ledger is append-only at the application layer.
-- Mirror the audit_logs immutability rules at the DB layer so even raw
-- $queryRawUnsafe / external psql sessions can't mutate history.
CREATE OR REPLACE RULE client_funds_ledger_no_update AS
  ON UPDATE TO client_funds_ledger DO INSTEAD NOTHING;
CREATE OR REPLACE RULE client_funds_ledger_no_delete AS
  ON DELETE TO client_funds_ledger DO INSTEAD NOTHING;

REVOKE TRUNCATE ON client_funds_ledger FROM PUBLIC;
DO $$
BEGIN
  EXECUTE format('REVOKE TRUNCATE ON client_funds_ledger FROM %I', CURRENT_USER);
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
