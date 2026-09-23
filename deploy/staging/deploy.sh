#!/usr/bin/env bash
# Phase 0.4 — Pull the requested image tag, restart the stack, run migrations,
# wait for health, run the smoke test. Idempotent; safe to re-run.
#
#   cd /opt/tradexlabel && IMAGE_TAG=main bash deploy.sh
#   IMAGE_TAG=<sha> bash deploy.sh        # roll back to an earlier image
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy.sh: .env missing (copy .env.example)"; exit 1; }
set -a; . ./.env; set +a
export IMAGE_TAG="${IMAGE_TAG:-main}"

echo "[deploy] tag=${IMAGE_TAG} domain=${STAGING_DOMAIN}"
# Phase 1.7: Prometheus reads the bearer token from a file (never from the compose file).
mkdir -p monitoring && printf "%s" "$METRICS_AUTH_TOKEN" > monitoring/metrics_token && chmod 600 monitoring/metrics_token
docker compose pull --quiet
# `up` re-runs the one-shot migrate service (prisma migrate deploy) before api
# starts, thanks to service_completed_successfully.
docker compose up -d --remove-orphans

echo "[deploy] waiting for api health..."
for i in $(seq 1 60); do
  if curl -fsS "https://api.${STAGING_DOMAIN}/api/v1/health" >/dev/null 2>&1; then
    echo "[deploy] api healthy"; break
  fi
  if [ "$i" = "60" ]; then
    echo "[deploy] api not healthy after 60s"; docker compose logs --tail=50 api; exit 1
  fi
  sleep 1
done

# Demo data is seeded once from a dev machine (README section 5): the runtime
# image ships no dev tooling on purpose.

if [ -n "${SMOKE_TENANT_ID:-}" ]; then
  echo "[deploy] smoke test"
  # scripts/smoke-api.mjs is shipped next to this file by the README procedure.
  SMOKE_TENANT_ID="$SMOKE_TENANT_ID" SMOKE_OTHER_TENANT_ID="${SMOKE_OTHER_TENANT_ID:-}" \
  SMOKE_METRICS_TOKEN="$METRICS_AUTH_TOKEN" node smoke-api.mjs "https://api.${STAGING_DOMAIN}"
else
  echo "[deploy] SMOKE_TENANT_ID empty — smoke test skipped (fill it after the first seed)"
fi

docker image prune -f >/dev/null
echo "[deploy] done: https://${STAGING_DOMAIN}  https://api.${STAGING_DOMAIN}/api/docs"
