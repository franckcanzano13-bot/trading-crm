# Runbooks

Operational procedures for TradeXLabel (roadmap Phase 1.9). Each one is
written to be followed at 3 a.m. by someone who did not write the code.

| Runbook | When |
|---------|------|
| [phase0-github-setup.md](phase0-github-setup.md) | One-off repository setup (done 2026-09-23) |
| [rotate-secrets.md](rotate-secrets.md) | Scheduled rotation, suspected leak, staff departure |
| [restore-database.md](restore-database.md) | Data loss, failed migration, ransomware, "just test it" quarterly |
| [release-with-migration.md](release-with-migration.md) | Every deploy that ships a Prisma migration |
| [incident-segregation-drift.md](incident-segregation-drift.md) | `drift_status != OK` on the segregation report or alert |
| [staff-2fa-reset.md](staff-2fa-reset.md) | A broker admin lost their authenticator device |
| [price-feed-outage.md](price-feed-outage.md) | A price source is down, geo-blocked or rate-limited |

Conventions: commands assume the staging layout (`/opt/tradexlabel`,
docker compose, service names from `deploy/staging/docker-compose.yml`).
Production differs only by the hosts and the managed database.
