# Release a version that ships a Prisma migration

Migrations are versioned SQL under `packages/server/prisma/migrations` (ADR-008)
and applied by the one-shot `migrate` service before the api starts
(`prisma migrate deploy`). Rules that keep this safe:

## Writing the migration (developer)

- Additive first: add columns/tables in one release, remove the old ones in a later release once no running code reads them. Never rename in place.
- New NOT NULL columns get a DEFAULT, or a backfill `UPDATE` in the same migration (see `20260923140000_user_email_verified`).
- Money tables (`accounts`, `transactions`, `client_funds_ledger`, `withdrawal_requests`, `trades`) never get destructive statements without an ADR.
- Test it twice locally: `prisma migrate reset --force` (fresh) and `prisma migrate deploy` on a database restored from yesterday's dump (real data shapes).
- CI applies every migration on a clean Postgres in the `Server` job and boots the api image against a migrated database in the `Docker` job; both must be green.

## Deploying (operator)

1. Backup first (restore-database.md, daily backup step, run by hand now).
2. `IMAGE_TAG=<sha> bash deploy.sh`. The `migrate` service runs before `api` is recreated; watch it: `docker compose logs migrate`.
3. If `migrate` fails, `api` does not start. The previous api containers are already replaced, so **roll back the code**: `IMAGE_TAG=<previous sha> bash deploy.sh`. A failed migration is not applied (Prisma wraps each in a transaction), so the old code runs against the old schema.
4. If `migrate` succeeded but the new api misbehaves, rolling back the code is only safe if the migration was additive (rule 1). Otherwise restore the backup from step 1 and roll back.
5. After every migration release, run the smoke test (`deploy.sh` does) and check the segregation report.

## Long-running migrations

Anything that rewrites a big table (backfill on `trades`, new index on `audit_logs`) is run out of band with `CREATE INDEX CONCURRENTLY` / batched updates from a maintenance window, not from `prisma migrate deploy` at boot. Document the manual step in the migration's SQL file as a comment and in the release notes.
