# ADR 002: Multi-tenant isolation via `tenant_id` column

- **Status:** Accepted
- **Date:** 2026-04-27

## Context

Each broker is a tenant with isolated users, trades, leads, and configuration.
The audit found two failures in the original implementation:
1. `tenant_id` filtering was applied inconsistently — many `prisma.x.update()`
   calls had only `where: { id }`, exposing cross-tenant writes.
2. `requireAdmin` middleware never compared the JWT's `tenantId` to the
   request's resolved `tenantId`. An admin of tenant A could send
   `X-Tenant-ID: B` and operate on tenant B data.

## Decision

Defense in depth at three layers:

1. **Auth middleware** (`shared/middleware/auth.ts`): `requireAuth` and
   `requireAdmin` reject with `403 TENANT_MISMATCH` if `decoded.tenantId !==
   request.tenantId`. SuperAdmin bypasses (their JWT carries no tenantId by
   design).

2. **TenantQuery class** (`shared/database/tenant-queries.ts`): every
   `update*` and `closeTrade` method uses `prisma.x.updateMany({ where:
   { id, tenant_id: this.tenantId, ... } })`. If the row doesn't match the
   tenant, the operation is a no-op and the helper returns `null`.

3. **Schema indexes**: every tenant-scoped table includes `(tenant_id, ...)`
   composite indexes for hot paths (Trade, Transaction, Lead).

## Alternatives considered

- **Postgres schema-per-tenant** — rejected, see ADR 001.
- **Row-level security (Postgres RLS)** — would push enforcement to the DB
  layer. Considered for a future iteration; deferred because Prisma doesn't
  yet support setting session variables ergonomically.

## Consequences

- All cross-tenant access requires the JWT to be reissued for the target
  tenant — there is no header-based override.
- Tests `tenant-isolation.test.ts` lock in the regression: 4 cases (admin A→A
  passes, admin A→B fails, trader A→A passes, trader A→B fails).
- Risk: a developer adding a new admin route must remember to route through
  TenantQuery (which enforces the column filter) and use `requireAdmin`. The
  ESLint config does not yet enforce this — captured as a follow-up.
