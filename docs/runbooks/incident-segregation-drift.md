# Incident: client funds segregation drift

`GET /api/v1/admin/reports/segregation` (per tenant) or the Prometheus alert
reports `drift_status: DRIFT_DETECTED`, i.e. `client_trust_cents` (sum of the
ledger) no longer equals the sum of `accounts.balance`.

This is a **code or data integrity incident**, not a market event. The ledger
is append-only; balances are the mutable side. Drift means some code path
changed a balance without writing a ledger row (or wrote a ledger row without
the balance change).

## Severity

- Drift on one tenant, small amount, appeared after a deploy → SEV2, fix within the day.
- Drift on several tenants or growing while you watch → SEV1: **stop deposits/withdrawals** for the affected tenants (block the admin deposit/withdraw routes by setting the tenant `is_active=false` is too blunt; instead pause staff decisions and note it) and page the on-call developer.

## Diagnose (15 minutes)

1. Freeze the numbers: save the report JSON with a timestamp.
2. Find when it started: compare `client_funds_ledger` rows and `transactions` rows since the last known-good report:
   ```sql
   -- transactions without a ledger row
   select t.* from transactions t
   left join client_funds_ledger l on l.reference = 'transaction:' || t.id
   where t.tenant_id = '<tenant>' and l.id is null order by t.created_at;
   -- closed trades without paired ledger rows
   select tr.id, tr.close_time, tr.pnl from trades tr
   left join client_funds_ledger l on l.reference = 'trade:' || tr.id
   where tr.tenant_id = '<tenant>' and tr.status = 'CLOSED' and l.id is null;
   ```
3. Cross-check with `audit_logs` for the same window (`action in ('DEPOSIT','WITHDRAW','WITHDRAWAL_APPROVED','PNL_OVERRIDE', ...)`) and with the deploy history (`git log`, image tags).
4. The orphan rows tell you which code path skipped the ledger. Known past causes: seed script and CRM conversion (fixed Sprint 8.4).

## Fix

- **Code**: the path must run inside `prisma.$transaction` and call the matching `shared/segregation` helper in the same block (ADR-010). Ship it through a PR; the smoke test asserts `drift_cents == 0`.
- **Data**: write the missing ledger rows with a migration or a one-off script that references the orphan transaction/trade ids (`reference = 'transaction:<id>'`), so the ledger explains itself. Never edit `accounts.balance` to make the numbers match: that hides the loss of an audit trail.
- Re-run the report: `drift_cents` must be exactly 0 on every tenant.

## Communicate

Regulated brokers must be told the same day: what drifted, by how much, when, the cause, the fix, and that no client balance was altered by the correction. Keep the saved report and the SQL outputs with the incident record.
