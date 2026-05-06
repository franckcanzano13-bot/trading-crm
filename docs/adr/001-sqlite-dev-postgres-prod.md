# ADR 001: SQLite for development, PostgreSQL for production

- **Status:** Accepted
- **Date:** 2026-04-27
- **Context tag:** DB-001 from external audit

## Context

The original CLAUDE.md promised PostgreSQL multi-schema isolation. The audit
found `provider = "sqlite"` in `schema.prisma`. SQLite is single-writer,
file-locked, and unsuitable for production. PostgreSQL is required for
multi-tenant trading workloads.

We need a migration path that doesn't break the dev experience (zero-config
local DB) but produces a production-ready Postgres setup.

## Decision

Two schemas, one provider switch:
- `schema.prisma` stays on `provider = "sqlite"` for local dev
- `scripts/use-postgres.sh` flips the provider to `postgresql` for prod
  builds. Run `npx prisma migrate dev --name init` after switching.
- The schema is portable: no SQLite-only or Postgres-only attributes.
- Prisma client is generated against whichever provider the working tree has.

The cutover for an environment is a documented runbook step, not a code change.

## Alternatives considered

- **Single Postgres for dev too** — rejected: requires Docker on every dev box,
  slows onboarding. Defer to when we have a real ops team.
- **Multi-schema Postgres (one schema per tenant)** — promised in CLAUDE.md
  but rejected post-audit: drastically harder to query across tenants, requires
  manual `SET search_path` plumbing through Prisma, and the audit confirmed our
  tenant_id column-level isolation works once VULN-001 is fixed.
- **Use Drizzle / Knex instead of Prisma** — rejected: too much rewrite cost
  for marginal benefit.

## Consequences

- Clear migration path; no surprise schema divergence between dev and prod.
- The provider switch is one command, but data migration from SQLite → Postgres
  (when devs want their dev data in prod for testing) requires `pg_dump`-style
  workflow we haven't yet automated.
- Multi-tenant isolation now relies entirely on `tenant_id` filtering in code.
  See ADR 002.
