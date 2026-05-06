# ADR 007: MiFIR/EMIR trade-export format

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** Backend team (Sprint 5.5)

## Context

The contre-audit listed "Reporting MiFIR/EMIR transactionnel — non implémenté"
under the moyens backlog. Regulated brokers must report transactions to their
NCA (or via a delegated reporting partner like Cappitech / UnaVista). We do
**not** want to be a direct ARM, but we must give operators a clean export
they can hand to their reporting partner.

Forces:
- Field names need to be intelligible by anyone who has read MiFIR RTS 22.
- Numbers are stored as `BigInt` cents (P&L) and 5-decimal scaled prices.
  The export must turn them into stable decimal strings — no IEEE-754 drift,
  no locale-specific separators.
- Export pulls trade history → must be tenant-scoped and audit-logged.
- Datasets can be large; we cap at 50 000 rows / 366 days per request to keep
  responses bounded.

## Decision

Two endpoints, both behind `requireAdmin` + `tenantResolver`:

- `GET /api/v1/admin/reports/trades-mifir.csv?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/v1/admin/reports/trades-mifir.json?from=…&to=…`

CSV uses RFC 4180 escaping with CRLF line endings (Windows tooling friendly).
The 18 columns are documented in `MIFIR_CSV_HEADER` (see
`packages/server/src/modules/reports/mifir-export.ts`):

```
txn_ref, executing_lei, trading_dt, close_dt, side, trading_capacity,
quantity, quantity_ccy, price, close_price, price_ccy,
buyer_id, seller_id, instrument, instrument_type, status, pnl, commission
```

`executing_lei` is currently the tenant slug — production MUST replace it
with a real LEI before filing. Buyer / seller flip with side; broker sits as
counterparty (we are B-Book). Price formatting divides BigInt by 100 000 with
zero-padded fractional preservation so `1n` round-trips as `0.00001`.

Every export call produces an `audit_logs` row with `action =
REGULATORY_EXPORT` and the row count, range and format in `details`.

## Alternatives considered

- **Stream the CSV with `reply.send(stream)`** — would scale to millions of
  rows but adds connection-management complexity. With the 50 000 row cap,
  in-memory build is fine and simpler to reason about.
- **Generate ESMA's full XML schema (ISO 20022 / RTS 22)** — accurate but
  brittle: schema versions move, and most NCAs delegate via partners that
  already convert from CSV. Stay at the CSV layer for now.
- **Expose the same data via the existing `/api/v1/trades/history`** — that
  endpoint is per-trader and returns Prisma JSON; reformatting on the client
  would re-implement the BigInt math. Centralising the formatter avoids
  divergence.

## Consequences

- Operators get a deterministic, regulator-shaped export without ETL work.
- The format is now a **contract**: changing column order or names is a
  breaking change for downstream reporting partners. The unit test in
  `tests/mifir-export.test.ts` locks header order and field positions.
- Follow-up: when LEIs are stored on tenants and ISINs on instruments,
  swap `tenant.slug` → `tenant.lei` and `instrument.symbol` →
  `instrument.isin ?? instrument.symbol` in the formatter.
- Follow-up: a streaming variant if we cross the 50 000-row cap for any
  reasonable lookback window.
