# ADR 004: Atomic financial flows via `prisma.$transaction`

- **Status:** Accepted
- **Date:** 2026-04-27
- **Context tag:** EXEC-001 from external audit

## Context

The audit found zero `prisma.$transaction` calls in the codebase. Every
financial flow (open trade, close trade, deposit, withdraw, liquidation,
dealer create-trade) was a sequence of independent `prisma.x.create/update`
calls. A crash between steps left the system inconsistent. Concurrent
operations on the same account caused balance drift.

## Decision

Every flow that touches `account.balance`, `account.margin_used`, or
`account.equity` runs inside `prisma.$transaction(async (tx) => { ... })`.
Inside the transaction:

1. **Re-read** the account by primary key + `tenant_id` — even if the route
   handler already loaded it, we re-read inside the tx to avoid TOCTOU.
2. **Validate** invariants (sufficient margin, account exists, trade still
   OPEN).
3. **Apply** all writes via `tx.x.update/create` — never the global `prisma`.
4. **Clamp** balance/equity/margin to ≥ 0 (ESMA Negative Balance Protection).
5. **Return** state values the caller may need (new balance, new margin)
   so cascade flows like liquidation don't need to re-query.

## Alternatives considered

- **Pessimistic row locks (`FOR UPDATE`)** — Prisma doesn't expose this
  natively. Available via raw SQL but adds DB-specific code and is overkill
  for our concurrency profile.
- **Application-level locks (Redis lock per account)** — additional
  infrastructure. The DB transaction already provides the isolation we need
  for our SQLite/Postgres targets.

## Consequences

- Clean boundary: financial flow = one transaction. Easy to audit: grep for
  `prisma.$transaction` finds them all.
- Idempotent close: every close uses
  `tx.trade.updateMany({ where: { id, status: 'OPEN' } })`. Two concurrent
  closers see one succeeds, one becomes a no-op.
- Slight latency increase (one extra round-trip per flow for the re-read).
  Acceptable for trading volume targets.
- All future financial flows must follow this pattern. Captured as a code
  review checklist item.
