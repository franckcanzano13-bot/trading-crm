# ADR 008: Versioned Prisma migrations + DB-level audit immutability

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** Backend team (Sprint 6)

## Context

Sprint 6 was about closing the small operational gaps the v2 contre-audit
flagged for "GO pré-production retail offshore". Two of those gaps were
related and treated together here:

1. CI used `prisma db push --skip-generate`, which is fine for a prototype
   but unacceptable for a regulated deployment. There was no migration
   history, no rollback story, no review surface for schema changes.
2. The `audit_logs` table was append-only at the Prisma client layer
   (ADR-005 / Sprint 5.2) but a `$queryRawUnsafe('UPDATE audit_logs ...')`
   call or any external session would silently bypass it.

Both gaps need a migration system to fix cleanly: (1) needs migrations to
exist; (2) needs a migration to install Postgres-level guards.

## Decision

- All schema changes go through `prisma migrate`. CI now runs
  `prisma migrate deploy` against the `postgres:16-alpine` service. The
  initial baseline (`20260506000000_init`) was generated via
  `prisma migrate diff --from-empty --to-schema-datamodel`, so it is
  reproducible without a shadow DB.
- A second migration (`20260506000100_audit_logs_append_only`) installs
  Postgres `INSTEAD-OF-NOTHING` rules on `audit_logs` for `UPDATE` and
  `DELETE`, and revokes `TRUNCATE` from `PUBLIC`. Inserts and reads are
  untouched.
- A third migration (`20260506000200_tenant_lei`) adds `Tenant.lei` so
  MiFIR export can emit a real ISO 17442 LEI when one is configured.

## Alternatives considered

- **Use `REVOKE UPDATE, DELETE` instead of rules.** Cleaner at first glance,
  but the application role and the migration role are typically the same in
  our deployment topology. Revoking would also block legitimate
  `prisma migrate deploy` runs that need to alter the table later. Rules
  apply to data DML only and leave DDL alone.
- **Trigger that `RAISE EXCEPTION`.** Louder than NOTHING-rules, but a
  bypass attempt now becomes a runtime error in production callers. We
  already have the loud-throw at the Prisma-extension layer; the DB layer
  is a backstop and silent no-op is the safer default.
- **Keep `db push` and document the limitation.** Rejected — losing
  migration history is non-negotiable for a regulated broker.

## Consequences

- New developers must run `prisma migrate dev --name <descriptive>` for any
  schema change. `db push` is now reserved for sandbox/scratch work.
- The `audit_logs` immutability is now defense-in-depth: throw at the
  Prisma client layer, silently no-op at the DB layer, plus the
  `audit-immutability.test.ts` suite verifies the JS layer.
- TRUNCATE is revoked from `PUBLIC` — superusers (DBAs) can still TRUNCATE
  if absolutely necessary; an explicit grant is required for any other
  role.
- Follow-up: when we add a separate read-only role for BI, also `REVOKE
  INSERT` on `audit_logs` from that role so it cannot pollute the audit
  trail.
