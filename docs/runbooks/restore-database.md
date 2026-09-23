# Back up and restore PostgreSQL

Money lives in this database. A backup that was never restored is not a backup:
the restore drill below is run once a quarter and its date is written in the
ops journal.

## Daily backup (staging: cron on the host; production: managed PITR + this as a second copy)

```bash
# /etc/cron.d/tradexlabel-backup
15 2 * * * deploy cd /opt/tradexlabel && docker compose exec -T postgres pg_dump -U tradexlabel -Fc tradexlabel | gzip > /var/backups/tradexlabel/db-$(date +\%F).dump.gz && find /var/backups/tradexlabel -name 'db-*.dump.gz' -mtime +30 -delete
```

Copy the folder off-host (object storage with versioning) every day. Verify
with `gzip -t` and by listing the archive: `gunzip -c db-<date>.dump.gz | pg_restore -l | head`.

## Restore (full)

1. Stop writers: `docker compose stop api position-monitor web`. Brokers see the maintenance page (Traefik 502); tell them.
2. Take a safety dump of the current state even if it is corrupt: `docker compose exec -T postgres pg_dump -U tradexlabel -Fc tradexlabel > /var/backups/tradexlabel/pre-restore-$(date +%F-%H%M).dump`.
3. Recreate the database:
   ```bash
   docker compose exec -T postgres psql -U tradexlabel -d postgres -c "DROP DATABASE tradexlabel;" -c "CREATE DATABASE tradexlabel OWNER tradexlabel;"
   gunzip -c /var/backups/tradexlabel/db-<date>.dump.gz | docker compose exec -T postgres pg_restore -U tradexlabel -d tradexlabel --no-owner
   ```
4. Migrations: the dump contains `_prisma_migrations`. If the code deployed is newer than the dump, run `docker compose run --rm migrate` to apply what is missing.
5. Start: `docker compose up -d`. Wait for `/api/v1/health`.
6. **Check the money**: `GET /api/v1/admin/reports/segregation` for each active tenant must say `drift_status: OK`. If not, follow incident-segregation-drift.md before reopening.
7. Tell brokers which window of activity was lost (dump time → incident time). Trades in that window are gone from the platform; their P&L must be reconciled manually with the audit log export if one exists off-host.

## Restore drill (quarterly, 30 minutes)

On a throwaway container, not the live one:

```bash
docker run -d --name drill -e POSTGRES_USER=tradexlabel -e POSTGRES_PASSWORD=x -e POSTGRES_DB=tradexlabel postgres:16-alpine
sleep 5
gunzip -c db-<yesterday>.dump.gz | docker exec -i drill pg_restore -U tradexlabel -d tradexlabel --no-owner
docker exec drill psql -U tradexlabel -d tradexlabel -c "select count(*) from users;" -c "select pool, sum(amount_cents) from client_funds_ledger group by pool;"
docker rm -f drill
```

Record: dump size, restore duration, row counts, who ran it.

## Point-in-time (production, managed Postgres)

Use the provider's PITR to the minute before the incident, then steps 4 to 7 above against the restored instance's `DATABASE_URL`.
