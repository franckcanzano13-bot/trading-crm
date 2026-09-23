# Staging — runbook (Phase 0.4)

One VPS, Docker Compose, Traefik with Let's Encrypt, images from GHCR.
Everything below is done once; afterwards every green CI run on `main`
redeploys automatically (`.github/workflows/deploy-staging.yml`).

## 1. Host

- Ubuntu 24.04, 2 vCPU, 4 GB RAM, 40 GB disk. Any provider.
- Open inbound 22, 80, 443 only.
- Install Docker Engine + Compose plugin (`https://docs.docker.com/engine/install/ubuntu/`).
- Create a `deploy` user in the `docker` group; put the CI public key in `~deploy/.ssh/authorized_keys`.

## 2. DNS

Two A records pointing at the host:

```
staging.tradexlabel.com       A  <host ip>
api.staging.tradexlabel.com   A  <host ip>
```

Traefik obtains certificates on first request; DNS must resolve before the first `deploy.sh`.

### White-label broker domains (Phase 1.4)

A broker served on its own domain needs two records pointing at the same
host, and `tenant.domain` set to the bare domain (`trade.acme.com`):

```
trade.acme.com       CNAME  staging.tradexlabel.com
api.trade.acme.com   CNAME  api.staging.tradexlabel.com
```

Traefik must know the extra hosts: add them to the `traefik.http.routers.*.rule`
labels in docker-compose.yml (`Host(\`staging.tradexlabel.com\`) || Host(\`trade.acme.com\`)`),
and build the web image with `NEXT_PUBLIC_API_URL` empty so the browser calls
`/api` on the broker domain and Next's rewrites forward to the api container.
The API resolves the tenant from `X-Forwarded-Host`.

## 3. Files on the host

```bash
sudo mkdir -p /opt/tradexlabel && sudo chown deploy:deploy /opt/tradexlabel
# from the repo, on your machine:
scp -r deploy/staging/docker-compose.yml deploy/staging/deploy.sh deploy/staging/backup.sh deploy/staging/.env.example deploy/staging/monitoring \
    scripts/smoke-api.mjs deploy@<host>:/opt/tradexlabel/
ssh deploy@<host> 'cd /opt/tradexlabel && cp .env.example .env && chmod 600 .env && chmod +x deploy.sh'
```

Edit `/opt/tradexlabel/.env`: domain, ACME email, and one `openssl rand -hex 32` per secret. `ENCRYPTION_KEY` must be 64 hex characters.

GHCR packages are private by default: `docker login ghcr.io` on the host once with a token that has `read:packages`.

## 4. GitHub configuration

Repository → Settings:

- **Secrets → Actions**: `STAGING_SSH_HOST`, `STAGING_SSH_USER` (`deploy`), `STAGING_SSH_KEY` (private key).
- **Variables → Actions**: `STAGING_API_URL` = `https://api.staging.tradexlabel.com`, `STAGING_WEB_URL` = `https://staging.tradexlabel.com`.
- **Environments**: create `staging` (optionally with a required reviewer).
- **Branches → main → protection**: require a pull request, require status checks `Server (typecheck + tests on PostgreSQL)`, `Web (typecheck + build)`, `Docker (api full + regulated, web)`; require branches up to date; include administrators.
- **Code security**: enable Dependabot alerts and security updates (`.github/dependabot.yml` is already in the repo).

## 5. First deploy

```bash
ssh deploy@<host>
cd /opt/tradexlabel
IMAGE_TAG=main bash deploy.sh
```

Then seed the demo data from a dev machine (the runtime image has no dev tooling):

```bash
# on your machine, tunnel to the host's Postgres
ssh -L 5432:localhost:5432 deploy@<host> -N &
cd packages/server
DATABASE_URL=postgresql://tradexlabel:<POSTGRES_PASSWORD>@localhost:5432/tradexlabel npx tsx src/seed.ts
```

Copy the two tenant ids the seed prints into `/opt/tradexlabel/.env` (`SMOKE_TENANT_ID`, `SMOKE_OTHER_TENANT_ID`) and run `bash deploy.sh` again: the smoke test runs at the end of every deploy from now on.

## 6. Day-two operations

| Task | Command |
|------|---------|
| Redeploy current main | `bash deploy.sh` |
| Roll back | `IMAGE_TAG=<12-char sha from GHCR> bash deploy.sh` |
| Logs | `docker compose logs -f api position-monitor web` |
| Database backup | automatic: the `backup` sidecar writes `db-<date>.dump.gz` to `$BACKUP_DIR` daily (see section 9); on demand: `docker compose exec backup sh -c 'pg_dump -Fc $PGDATABASE | gzip > /backups/manual-$(date +%F-%H%M).dump.gz'` |
| Restore | `gunzip -c backup.sql.gz \| docker compose exec -T postgres psql -U tradexlabel tradexlabel` |
| Metrics | `curl -H "Authorization: Bearer $METRICS_AUTH_TOKEN" https://api.<domain>/metrics` |
| API docs | `https://api.<domain>/api/docs` (EXPOSE_API_DOCS=1 on staging only) |

Backups are manual on staging. Production uses a managed Postgres with point-in-time recovery (roadmap Phase 1.6).

## 7. Monitoring (Phase 1.7)

Add a third A record, `grafana.<domain>`, and set `GRAFANA_ADMIN_PASSWORD` and
`ALERT_WEBHOOK_URL` in `.env`. `deploy.sh` writes `monitoring/metrics_token`
from `METRICS_AUTH_TOKEN` so Prometheus can scrape every api replica.

- Grafana: `https://grafana.<domain>` — dashboard "TradeXLabel — Overview" is provisioned.
- Prometheus and Alertmanager are internal only (no Traefik route); `docker compose exec prometheus wget -qO- localhost:9090/api/v1/alerts` to inspect.
- Alerts (`monitoring/alerts.yml`): API down, 5xx > 2%, order p95 > 1s, position monitor stale, **segregation drift ≠ 0**, price source down or silent. Each carries the runbook to open.

Not yet covered: the position-monitor worker has no /metrics endpoint of its own; `PositionMonitorStale` only fires when the monitor runs inside the api process (RUN_AS_API_ONLY unset). Roadmap item.

## 8. Logs (Phase 1.8)

Promtail tails every container of the compose project through the Docker
socket and ships to Loki (30 days). The api's pino JSON lines are parsed:
Grafana → Explore → Loki, e.g. `{service="api", level_name="error"}` or
`{service="api"} |= "tenantId\":\"<id>"`. Loki is internal only.

## 9. Backups (Phase 1.6)

The `backup` sidecar (postgres:16-alpine + `backup.sh`) runs `pg_dump -Fc`
every 24 h into `BACKUP_DIR` on the host (default `/var/backups/tradexlabel`)
and prunes dumps older than `BACKUP_KEEP_DAYS`. A local copy is not a backup:
set `RCLONE_REMOTE` (and bake rclone into the image, or run rclone from a host
cron) to push each dump to object storage with versioning. Restore and the
quarterly drill: `docs/runbooks/restore-database.md`.
