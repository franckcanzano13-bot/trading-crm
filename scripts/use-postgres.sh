#!/usr/bin/env bash
# DB-001: Switch Prisma from SQLite (dev) to PostgreSQL (prod).
#
# Usage:
#   ./scripts/use-postgres.sh
#   # then run migrations:
#   cd packages/server && npx prisma migrate dev --name init
#   cd packages/server && npx prisma generate
#
# To switch back to SQLite for dev:
#   git checkout packages/server/prisma/schema.prisma

set -euo pipefail

SCHEMA="packages/server/prisma/schema.prisma"

if [ ! -f "$SCHEMA" ]; then
  echo "ERROR: $SCHEMA not found. Run from repo root."
  exit 1
fi

if grep -q 'provider = "postgresql"' "$SCHEMA"; then
  echo "Schema is already configured for PostgreSQL."
  exit 0
fi

echo "Switching Prisma datasource provider: sqlite -> postgresql"

# Cross-platform sed (BSD on macOS, GNU on Linux). Git bash on Windows uses GNU.
sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA"
rm -f "$SCHEMA.bak"

echo "Done. Verify $SCHEMA, then:"
echo "  1. Set DATABASE_URL=\"postgresql://user:pwd@host:5432/db\" in packages/server/.env"
echo "  2. cd packages/server && npx prisma migrate dev --name init"
echo "  3. cd packages/server && npx prisma generate"
echo ""
echo "To revert: git checkout packages/server/prisma/schema.prisma"
