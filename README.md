# TradeXLabel

Enterprise-grade white-label trading platform with built-in CRM, dealing desk, KYC integration, and multi-tenant broker management.

## Features

- **Trading terminal** — Real-time charts (TradingView Lightweight Charts), live prices (Binance / Finnhub / Yahoo Finance / TwelveData), order placement, position management, P&L tracking
- **CRM** — Lead pipeline, kanban board, 1-click calling (Zoiper SIP), email templates with broker branding, KYC integration, IP geolocation, weather, multi-language (FR/EN/AR with RTL)
- **Roles** — Admin, Seller (conversion), Retention (dealing) with scoped data access
- **Dealing desk** — B-Book dealer interventions, scheduled trades, bulk trade across multiple clients, auto-trader programs (target % gain over period)
- **Multi-tenant** — Each broker is a tenant with isolated data, custom branding, SMTP, and execution mode (A_BOOK / B_BOOK / B_BOOK_DEALER)
- **SuperAdmin** — Platform management for the TradeXLabel operator

## Stack

**Backend** — Node.js 20+, Fastify 5, Prisma ORM, PostgreSQL 16 (SQLite optional for offline dev), JWT auth, WebSocket, Zod validation
**Frontend** — Next.js 16 (App Router, standalone output), React 19, Tailwind CSS, Zustand, TradingView Lightweight Charts
**DevOps** — Docker images for api (full / regulated profiles) and web, Docker Compose, GitHub Actions (typecheck, lint, audit, tests on PostgreSQL, image builds)

## Project structure

```
TradingCRM/
├── packages/
│   ├── server/          # Fastify backend
│   │   ├── src/
│   │   │   ├── modules/      # Feature modules (auth, trading, crm, dealer, etc.)
│   │   │   ├── shared/       # Database, middleware, websocket, utils
│   │   │   └── workers/      # Background workers
│   │   ├── prisma/           # Schema + migrations
│   │   └── tests/            # Vitest tests
│   ├── web/             # Next.js frontend
│   │   └── src/
│   │       ├── app/          # Routes (/, /admin, /dealer, /crm, /superadmin)
│   │       ├── components/   # Shared components (crm/, trading/, ui/)
│   │       └── lib/          # API client, helpers, i18n
│   └── shared/          # Shared types between server and web
├── docker-compose.yml   # PostgreSQL + Redis services
├── CLAUDE.md            # Architecture & conventions
└── FIXES_NOTES.md       # Recent fixes & known issues
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp packages/server/.env.example packages/server/.env
cp packages/web/.env.example packages/web/.env.local
```

Edit `packages/server/.env`:
- Set `JWT_SECRET` and `JWT_REFRESH_SECRET` to secure random strings
- Optionally add API keys for Finnhub / TwelveData (free sources work by default)
- Optionally set `KYC_API_URL` + `KYC_API_KEY` for KYC integration

### 3. Database

Default is PostgreSQL (same as CI and production). Start it with Docker Compose, then apply the versioned migrations:

```bash
docker compose up -d postgres redis
cd packages/server
npx prisma migrate deploy
npx prisma generate
```

`DATABASE_URL` must be a `postgresql://` URL (see `.env.example`).

No Docker on your machine (VM without nested virtualization, locked-down laptop)? Run a real PostgreSQL without it:

```bash
node scripts/dev-postgres.mjs        # downloads a Postgres binary once into .local/pg, starts on 5432
```

Then apply migrations and seed as above. Last resort, offline dev on SQLite: `./scripts/use-sqlite.sh` flips the Prisma provider to SQLite, then `DATABASE_URL=file:./dev.db npx prisma db push`. The Postgres-only tests (audit immutability, tenant isolation, TOTP, dealer isolation) are skipped in that mode. Revert with `git checkout packages/server/prisma/schema.prisma`.

### 4. Build & run

```bash
# Backend
cd packages/server && npx tsc && node dist/index.js

# Frontend (separate terminal)
cd packages/web && npx next build && npx next start -p 5501
```

Open:
- `http://localhost:5501` — Trader terminal
- `http://localhost:5501/admin` — Broker admin
- `http://localhost:5501/crm` — CRM (Seller / Retention / Admin)
- `http://localhost:5501/dealer` — Dealing desk
- `http://localhost:5501/superadmin` — SuperAdmin (platform-level)

## Multi-tenant

Each broker is a `Tenant` with its own:
- Domain / slug for sub-domain routing
- `execution_mode`: A_BOOK / B_BOOK / B_BOOK_DEALER
- Admin accounts with roles: `admin`, `seller`, `retention`
- Isolated data (users, trades, leads, KYC) by `tenant_id`

The dealer module is gated by `execution_mode === 'B_BOOK_DEALER'`. A_BOOK regulated brokers cannot call dealer routes.

## Tests

```bash
cd packages/server
npx vitest run
```

## Conventions

- TypeScript strict mode
- Currency stored in cents (BigInt), never floats
- Dates in UTC ISO 8601
- API errors: `{ error: string, code: string, details?: any }`
- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`)
- No `useCallback` in CRM components (MetaMask SES lockdown compatibility)

## License

Proprietary. All rights reserved.

## Docker images

```bash
# API — full profile (dealer module compiled in, gated by ENABLE_DEALER_MODULE at runtime)
docker build -f packages/server/Dockerfile -t tradexlabel/api:latest .
# API — regulated profile (dealer module removed from the source tree before compilation)
docker build -f packages/server/Dockerfile --build-arg BUILD_PROFILE=regulated -t tradexlabel/api:regulated .
# Web — NEXT_PUBLIC_API_URL is inlined at build time (one image per public API origin)
docker build -f packages/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.broker.example -t tradexlabel/web:latest .
# Everything together
docker compose up --build
```

CI builds both profiles of the API image and the web image on every push, asserts the regulated image contains no dealer code, and boots each image once.

## Smoke test against a running API

```bash
SMOKE_TENANT_ID=<demo tenant id from seed> SMOKE_OTHER_TENANT_ID=<dealer tenant id> \
SMOKE_METRICS_TOKEN=<METRICS_AUTH_TOKEN> npm run smoke -- http://127.0.0.1:5500
```

## What can be sold to a broker

See [docs/OFFERING.md](docs/OFFERING.md) for what can be sold today, [docs/ROADMAP.md](docs/ROADMAP.md) for the path to the first paying broker, [docs/broker-integration-kit.md](docs/broker-integration-kit.md) for what a broker's team does to go live, and [docs/SLA.md](docs/SLA.md) for the service levels offered. — the catalogue of options per execution mode, what is included, what is configurable, and what is still roadmap.
