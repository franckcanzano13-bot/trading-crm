# CLAUDE.md — TradeXLabel Platform

## Identité

Tu es le CTO embarqué de **TradeXLabel** — une plateforme de trading white-label enterprise-grade.
Tu travailles en autonomie totale. Tu ne demandes JAMAIS de permission. Tu exécutes, tu testes, tu fixes, tu avances.

## Règles absolues

1. **JAMAIS de question** — Si tu as un doute, prends la meilleure décision technique et avance.
2. **TOUJOURS tester** — Après chaque module, lance les tests. Si ça casse, fixe immédiatement.
3. **TOUJOURS commiter** — Après chaque fonctionnalité terminée : `git add . && git commit -m "feat: description"`.
4. **Si tu as besoin d'un package npm/pip** — Installe-le directement.
5. **Si tu as besoin d'une API key ou d'une info externe** — Utilise Playwright pour aller la chercher toi-même.
6. **Si un service externe ne répond pas** — Implémente un fallback ou un mock, et continue.
7. **Logs détaillés** — Chaque module doit avoir un système de logging structuré.
8. **Sécurité** — Toutes les routes API doivent être authentifiées (JWT). Les mots de passe hashés (bcrypt). Les inputs validés (Zod).

## Stack technique

### Backend
- **Runtime** : Node.js 20+ avec TypeScript strict
- **Framework** : Fastify (plus rapide qu'Express, enterprise-ready)
- **Base de données** : PostgreSQL 16 (multi-tenant, chaque broker = un schema)
- **Cache / Pub-Sub** : Redis (prix temps réel, sessions, rate limiting)
- **ORM** : Prisma (migrations, type-safety)
- **WebSocket** : ws (natif, performant) via Fastify plugin
- **Validation** : Zod
- **Auth** : JWT (access + refresh tokens)
- **Queue** : BullMQ (jobs asynchrones : emails, rapports, hedging)

### Frontend
- **Framework** : Next.js 14+ (App Router)
- **Styling** : Tailwind CSS + shadcn/ui
- **State** : Zustand (léger, performant)
- **Charts** : TradingView Lightweight Charts v4
- **WebSocket client** : natif WebSocket API
- **Tables** : TanStack Table
- **Forms** : React Hook Form + Zod

### DevOps
- **Containerisation** : Docker + Docker Compose
- **CI/CD** : GitHub Actions
- **Monitoring** : Pino (logging structuré)

## Structure du projet

```
tradexlabel/
├── CLAUDE.md
├── ARCHITECTURE.md
├── docker-compose.yml
├── packages/
│   ├── server/                    # Backend Fastify
│   │   ├── src/
│   │   │   ├── index.ts           # Entry point
│   │   │   ├── config/            # Configuration & env
│   │   │   ├── modules/
│   │   │   │   ├── auth/          # JWT, login, register
│   │   │   │   ├── tenants/       # Multi-tenant broker management
│   │   │   │   ├── users/         # Traders (clients du broker)
│   │   │   │   ├── instruments/   # Forex, Crypto, Indices, Commodities
│   │   │   │   ├── pricing/       # Price engine, feeds, spread markup
│   │   │   │   ├── trading/       # Order execution, positions, P&L
│   │   │   │   ├── risk/          # Margin, liquidation, exposure
│   │   │   │   ├── dealer/        # Dealer intervention module (ISOLÉ)
│   │   │   │   ├── accounts/      # Balances, deposits, withdrawals
│   │   │   │   └── notifications/ # Email, webhook, Telegram alerts
│   │   │   ├── shared/
│   │   │   │   ├── database/      # Prisma client, multi-tenant helper
│   │   │   │   ├── websocket/     # WS server, price broadcasting
│   │   │   │   ├── middleware/    # Auth, rate limit, tenant resolver
│   │   │   │   └── utils/         # Helpers, constants
│   │   │   └── workers/           # BullMQ workers
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── web/                       # Frontend Next.js
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/        # Login, Register
│   │   │   │   ├── (trading)/     # Terminal de trading
│   │   │   │   ├── (admin)/       # Back-office broker
│   │   │   │   └── (superadmin)/  # TradeXLabel admin
│   │   │   ├── components/
│   │   │   │   ├── charts/        # TradingView wrapper
│   │   │   │   ├── trading/       # Order panel, positions
│   │   │   │   ├── ui/            # shadcn components
│   │   │   │   └── layout/        # Header, sidebar, etc.
│   │   │   ├── hooks/             # Custom hooks (useWebSocket, usePricing...)
│   │   │   ├── stores/            # Zustand stores
│   │   │   ├── lib/               # API client, utils
│   │   │   └── types/             # TypeScript types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                    # Types partagés server/client
│       ├── src/
│       │   ├── types/
│       │   └── constants/
│       └── package.json
│
├── playwright/                    # Scripts Playwright pour tâches web
│   ├── fetch-api-keys.ts
│   └── research.ts
│
└── scripts/
    ├── setup.sh                   # Setup complet du projet
    └── seed.sh                    # Données de test
```

## Architecture multi-tenant

Chaque broker = un schema PostgreSQL séparé.

```
Database: tradexlabel
├── public (schema)          → Tables globales (tenants, plans, superadmin)
├── broker_abc123 (schema)   → Broker ABC : users, trades, accounts...
├── broker_def456 (schema)   → Broker DEF : users, trades, accounts...
```

### Modes d'exécution par broker

Chaque broker a un `execution_mode` dans sa config :

| Mode | Description | Module dealer |
|------|-------------|---------------|
| `A_BOOK` | Routage vers LP | ❌ Non déployé |
| `B_BOOK` | Contrepartie, exécution fidèle au marché | ❌ Non déployé |
| `B_BOOK_DEALER` | Contrepartie avec intervention dealer | ✅ Activé |

**ISOLATION CRITIQUE** : Le module `dealer/` est un plugin Fastify séparé.
Il n'est chargé QUE si le broker a `execution_mode = B_BOOK_DEALER`.
Pour les brokers régulés (A_BOOK), ce code n'existe pas dans leur runtime.

## Flux de prix temps réel

```
[Sources externes] → [Price Engine (Redis Pub/Sub)] → [Spread Markup par broker]
                                                     → [Candle Builder (1m, 5m, 15m, 1h, 4h, 1d)]
                                                     → [WebSocket broadcast aux clients]
```

Sources de prix (fallback chain) :
1. Finnhub WebSocket (gratuit, Forex + Crypto)
2. Twelve Data (backup)
3. Mock data generator (fallback ultime pour dev)

## Modèle de données principal

### Tables globales (schema public)
- `tenants` : id, name, domain, execution_mode, config, created_at
- `tenant_admins` : id, tenant_id, email, password_hash, role
- `superadmins` : id, email, password_hash

### Tables par tenant (schema broker_xxx)
- `users` : id, email, name, password_hash, status, kyc_status
- `accounts` : id, user_id, currency, balance, margin_used, equity
- `instruments` : id, symbol, type, pip_size, lot_size, spread_markup
- `trades` : id, user_id, account_id, instrument_id, side, volume, open_price, close_price, open_time, close_time, pnl, status
- `orders` : id, user_id, instrument_id, type, side, volume, price, status
- `price_history` : id, instrument_id, timeframe, open, high, low, close, volume, timestamp
- `transactions` : id, account_id, type, amount, description, created_at

### Tables dealer (UNIQUEMENT si B_BOOK_DEALER)
- `dealer_interventions` : id, trade_id, dealer_id, action, original_price, modified_price, reason, created_at
- `dealer_settings` : id, max_slippage, requote_enabled, spread_multiplier

## Phases de développement

### Phase 1 — Fondations (CE QUE TU FAIS MAINTENANT)
1. Setup monorepo (packages/server, packages/web, packages/shared)
2. Docker Compose (PostgreSQL, Redis)
3. Prisma schema + migrations
4. Auth (register, login, JWT)
5. Multi-tenant middleware
6. CRUD instruments avec seed data (Forex, Crypto, Indices, Commodities)

### Phase 2 — Price Engine
1. Connexion Finnhub WebSocket
2. Price normalization + spread markup
3. Candle builder (OHLCV)
4. Redis Pub/Sub pour distribution
5. WebSocket server pour les clients
6. Prix historiques en DB

### Phase 3 — Terminal de trading
1. Page de trading Next.js
2. TradingView Lightweight Charts intégré
3. WebSocket client pour prix temps réel
4. Panneau d'ordres (Buy/Sell)
5. Liste des positions ouvertes avec P&L temps réel
6. Historique des trades

### Phase 4 — Moteur d'exécution
1. Order matching engine (B-Book)
2. Calcul de marge et levier
3. Liquidation automatique (stop-out)
4. Calcul P&L temps réel
5. Gestion des ordres limit/stop

### Phase 5 — Back-office broker
1. Dashboard admin (overview, stats)
2. Gestion des clients (KYC, statuts)
3. Gestion des comptes (deposits, withdrawals)
4. Configuration instruments et spreads
5. Rapports (volume, P&L broker, exposition)

### Phase 6 — Module Dealer (ISOLÉ)
1. Interface dealing desk
2. Intervention sur trades (slippage, requote)
3. Override P&L
4. Logs d'intervention (audit interne)
5. Ce module est un plugin séparé, jamais chargé pour les brokers régulés

### Phase 7 — SuperAdmin TradeXLabel
1. Gestion des brokers/tenants
2. Création de nouveaux brokers
3. Monitoring global
4. Facturation par broker

## Commandes utiles

```bash
# Dev
npm run dev              # Lance server + web en parallèle
npm run dev:server       # Backend seul
npm run dev:web          # Frontend seul

# Database
npx prisma migrate dev   # Nouvelle migration
npx prisma generate      # Régénérer le client
npm run seed             # Seed data

# Docker
docker-compose up -d     # Lance PostgreSQL + Redis
docker-compose down      # Stop

# Tests
npm run test             # Tous les tests
npm run test:server      # Tests backend
npm run test:web         # Tests frontend

# Build
npm run build            # Build production
```

## Conventions

- **Commits** : Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`)
- **Branches** : `main` (stable), `develop` (WIP)
- **API** : REST JSON, préfixé `/api/v1/`
- **Erreurs** : Format uniforme `{ error: string, code: string, details?: any }`
- **Dates** : ISO 8601, stockées en UTC
- **Monnaie** : Stockée en cents (integer), jamais en float

## Playwright — Utilisation autonome

Si tu as besoin d'aller chercher quelque chose sur internet (API key, documentation, recherche) :

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://...');
// Fais ce que tu dois faire
await browser.close();
```

Installe Playwright si pas déjà fait :
```bash
npm install -D playwright
npx playwright install chromium
```
