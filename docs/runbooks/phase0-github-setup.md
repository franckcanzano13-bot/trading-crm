# Phase 0 — GitHub setup (to do by the repository owner)

These steps need owner rights on `franckcanzano13-bot/trading-crm` and cannot
be done from a developer machine. Estimated time: 20 minutes.

## 0.1 Push and protect

1. On a machine logged in as `franckcanzano13-bot` (or a collaborator with
   write access), pull this repository's local `main` and push:
   `git push origin main`.
   The dev VM used for Sprints 8 and 9 is authenticated as another GitHub
   account (`juliengpt`) that has no write access, so its 15 commits are
   local until this is done. Alternative: add `juliengpt` as a collaborator
   with write access, then push from the VM.
2. Settings → Branches → Add rule for `main`:
   - Require a pull request before merging (1 approval; CODEOWNERS is in place).
   - Require status checks: `Server (typecheck + tests on PostgreSQL)`,
     `Web (typecheck + build)`, `Docker (api full + regulated, web)`.
   - Require branches to be up to date.
   - Include administrators.
   - Block force pushes and deletions.

## 0.2 First run of the Docker job

The push triggers CI, including the new `docker-images` job that builds the
API (full and regulated) and web images and boots them. If the web image
fails to build, the usual suspects are the standalone output path
(`.next/standalone/packages/web/server.js`) and the per-Dockerfile ignore
file (`packages/web/Dockerfile.dockerignore`, needs BuildKit, default on
GitHub runners).

## 0.3 Dependabot

Settings → Code security and analysis:
- Dependabot alerts: enable.
- Dependabot security updates: enable.
- Version updates use the committed `.github/dependabot.yml` (weekly, grouped
  by fastify / nextjs / prisma / dev tooling).

## 0.4 Staging

Follow `deploy/staging/README.md`. Secrets and variables to create are
listed there in section 4. Once `STAGING_SSH_HOST` exists, every green CI
run on `main` publishes images to GHCR and redeploys staging.

## Exit criteria

- [ ] `main` protected, direct pushes refused.
- [ ] CI green on GitHub including the `docker-images` job.
- [ ] Dependabot has opened its first PRs.
- [ ] `https://staging.<domain>` serves the web app and `https://api.staging.<domain>/api/v1/health` returns `{"status":"ok"}`.
- [ ] `deploy.sh` ends with `21 passed, 0 failed`.
