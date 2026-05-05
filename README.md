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

**Backend** — Node.js 20+, Fastify, Prisma ORM, SQLite (dev) / PostgreSQL (prod), JWT auth, WebSocket, Zod validation
**Frontend** — Next.js 14 (App Router), Tailwind CSS, Zustand, TradingView Lightweight Charts
**DevOps** — Docker Compose for PostgreSQL + Redis

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

Default is SQLite (zero setup):

```bash
cd packages/server
npx prisma db push
npx prisma generate
```

For production with PostgreSQL, update `DATABASE_URL` and run the same commands.

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
