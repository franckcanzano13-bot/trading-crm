# ADR 010: Client funds segregation ledger

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** Backend team (Sprint 7.6)

## Context

MiFID II / FCA CASS / ASIC client-money rules require brokers to hold
client funds separately from operating funds. The previous data model
mixed both: every `Account.balance` value contained client deposits, but
nothing tracked the broker's own P&L from B-Book activity, and no report
could demonstrate to a regulator that "client X's money is here, broker's
money is there".

The audit's contre-audit v2/v5 explicitly flagged this as a remaining
blocker for an EU pilot.

## Decision

Add a `client_funds_ledger` table that mirrors every movement of client
money via two virtual pools:

- `CLIENT_TRUST` — sums to the broker's liability to clients
- `BROKER_OPERATING` — sums to the broker's net operational P&L

Every existing `prisma.$transaction` block that touches `Account.balance`
also writes one or two ledger rows in the same atomic transaction:

| Event | CLIENT_TRUST | BROKER_OPERATING |
|---|---|---|
| Deposit $100 | +100 | (no row) |
| Withdrawal $100 | −100 | (no row) |
| Trade close, client wins $100 | +100 | −100 |
| Trade close, client loses $100 | −100 | +100 |
| Liquidation P&L (client side) | ±pnl | ∓pnl |

The pair always nets to zero — money is conserved across pools, which is
the regulatory invariant we want to demonstrate.

The ledger is append-only at both layers (Prisma client extension would
need to be added if needed, and the Postgres `INSTEAD-OF-NOTHING` rules
plus `REVOKE TRUNCATE` are installed by the same migration —
`20260506000400_client_funds_ledger`).

A new admin endpoint `GET /api/v1/admin/reports/segregation` returns:

```json
{
  "as_of": "2026-05-06T...",
  "client_trust_cents": "...",
  "broker_operating_cents": "...",
  "account_balance_total_cents": "...",
  "drift_cents": "...",
  "drift_status": "OK" | "DRIFT_DETECTED"
}
```

`drift_cents = client_trust - sum(account.balance)` should always be zero.
A non-zero drift signals a code path that updated balances without
writing the ledger — i.e. a regression.

## Alternatives considered

- **Track only the CLIENT_TRUST pool, derive broker P&L by subtraction.**
  Less explicit; harder to audit. Rejected — paired entries are the
  textbook double-entry approach and make the regulator happy.
- **Use a separate `client_funds_account` table per user instead of a
  ledger.** Doubles the write volume on every trade and forces
  reconciliation against `Account.balance` (same rows in two places).
  The ledger model is simpler and idempotent.
- **Compute the report on demand from `transactions` + `trades`.** Was
  the v2 baseline. Trades and transactions are already join-heavy and the
  table doesn't have the explicit "which pool moved" semantics — the
  ledger surfaces it directly.

## Consequences

- New migration `20260506000400_client_funds_ledger` — must be applied
  before deploying this code (CI runs `prisma migrate deploy` so this is
  automatic on production deploys that follow the migration order).
- Every existing financial flow now does one extra `INSERT` (deposit /
  withdrawal) or one `createMany` of two rows (trade pnl) inside its
  `$transaction`. Negligible overhead.
- The `drift_cents` field is the canary. Any code path that ships a
  balance update without a ledger write will surface there. Ops should
  alert on `drift_status != 'OK'`.
- Follow-up: when commission is split off from trade P&L, add a
  `COMMISSION` kind to the ledger so the regulator can see how much of
  `BROKER_OPERATING` came from spread markup vs B-Book wins.
- Follow-up: when the dealer module makes scheduled-close adjustments,
  the segregation ledger already records them via the
  `closeDealerTrade` path; no extra work needed.
