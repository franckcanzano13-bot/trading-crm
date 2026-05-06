-- Sprint 6.5 — DB-level enforcement of audit_logs immutability.
--
-- Defense-in-depth: the Prisma client extension in shared/database/prisma.ts
-- already throws on update/delete via the typed client, but $queryRawUnsafe
-- and any tool connecting outside the app (psql, BI, a future microservice)
-- would bypass it. This migration makes the table truly append-only at the
-- Postgres level using INSTEAD-OF-NOTHING rules.
--
-- We use rules (not REVOKE) because:
--   - The app role and the Prisma migration role are usually the same in our
--     deployment topology, so REVOKE-ing UPDATE/DELETE would also block
--     legitimate Prisma migrations that ALTER the table later. Rules apply
--     to data-modification statements but leave DDL alone.
--   - Rules return cleanly (zero rows affected) instead of raising — apps
--     that mistakenly attempt an UPDATE simply find their change never
--     persisted, which the upper-layer Prisma extension also catches loudly.
--
-- TRUNCATE bypasses rules; we additionally REVOKE TRUNCATE via the public
-- role since no caller has a legitimate need to truncate audit history.

CREATE OR REPLACE RULE audit_logs_no_update AS
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_logs_no_delete AS
  ON DELETE TO audit_logs DO INSTEAD NOTHING;

REVOKE TRUNCATE ON audit_logs FROM PUBLIC;
