-- Sprint 6.8 — Revoke TRUNCATE on audit_logs from the application role.
--
-- Sprint 6.5 revoked TRUNCATE from PUBLIC, but the owner / app role retains
-- TRUNCATE by default. A compromise of the application credentials could
-- still wipe the audit trail in a single statement (TRUNCATE bypasses the
-- INSTEAD-OF-NOTHING rules from 20260506000100).
--
-- Approach: revoke TRUNCATE from CURRENT_USER — i.e. the role applying this
-- migration, which is typically the same role the application runs under.
-- A separate DBA / superuser session retains TRUNCATE for emergencies.
--
-- This is intentionally conservative: if the deployer wants a different
-- role to keep TRUNCATE (e.g. a dedicated audit_owner), they can re-grant
-- it manually after migrate deploy. We default to safest.

DO $$
BEGIN
  EXECUTE format('REVOKE TRUNCATE ON audit_logs FROM %I', CURRENT_USER);
EXCEPTION WHEN insufficient_privilege THEN
  -- Running as a superuser that doesn't itself need TRUNCATE revoked.
  NULL;
END $$;
