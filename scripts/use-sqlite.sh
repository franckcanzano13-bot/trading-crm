#!/usr/bin/env bash
# Sprint 4.1: Switch Prisma from PostgreSQL (default, prod) to SQLite (offline dev).
#
# The default is PostgreSQL. Use this script ONLY for local dev convenience.
# CI runs against PostgreSQL.
#
# Usage:
#   ./scripts/use-sqlite.sh
#   cd packages/server && DATABASE_URL=file:./dev.db npx prisma db push
#
# To switch back to Postgres:
#   git checkout packages/server/prisma/schema.prisma

set -euo pipefail

SCHEMA="packages/server/prisma/schema.prisma"

if [ ! -f "$SCHEMA" ]; then
  echo "ERROR: $SCHEMA not found. Run from repo root."
  exit 1
fi

if grep -q 'provider = "sqlite"' "$SCHEMA"; then
  echo "Schema is already configured for SQLite."
  exit 0
fi

echo "Switching Prisma datasource provider: postgresql -> sqlite"
sed -i.bak 's/provider = "postgresql"/provider = "sqlite"/' "$SCHEMA"
rm -f "$SCHEMA.bak"

echo "Done. Set DATABASE_URL=\"file:./dev.db\" and run:"
echo "  cd packages/server && npx prisma db push"
echo ""
echo "To revert: git checkout packages/server/prisma/schema.prisma"
