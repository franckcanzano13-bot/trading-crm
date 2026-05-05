# TradeXLabel — Architecture Technique

## Vue d'ensemble

TradeXLabel est une plateforme de trading white-label multi-tenant qui permet à des brokers
d'opérer leur propre service de trading sous leur marque. Comparable à Leverate, cTrader White Label,
ou Match-Trade.

```
┌─────────────────────────────────────────────────────────────────┐
│                     TradeXLabel Platform                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Broker A │  │ Broker B │  │ Broker C │  │ SuperAdmin   │   │
│  │ (A-Book) │  │ (B-Book) │  │ (Dealer) │  │ TradeXLabel  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │           │
│  ┌────┴──────────────┴──────────────┴───────────────┴────────┐  │
│  │                    API Gateway (Fastify)                   │  │
│  │              Tenant Resolution Middleware                  │  │
│  └────┬──────────────┬──────────────┬───────────────┬────────┘  │
│       │              │              │               │           │
│  ┌────┴────┐   ┌─────┴────┐  ┌─────┴─────┐  ┌─────┴─────┐    │
│  │  Auth   │   │  Trading │  │  Pricing  │  │   Risk    │    │
│  │ Module  │   │  Engine  │  │  Engine   │  │  Manager  │    │
│  └─────────┘   └──────────┘  └─────┬─────┘  └───────────┘    │
│                                     │                          │
│  ┌──────────────────────────────────┴────────────────────────┐  │
│  │              WebSocket Price Broadcasting                 │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────┴───────────────────────────────┐  │
│  │            Redis (Pub/Sub + Cache + Sessions)             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │     PostgreSQL (Multi-schema: public + broker schemas)    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Multi-Tenancy

### Stratégie : Schema-per-tenant

Chaque broker a son propre schema PostgreSQL. Cela garantit :
- **Isolation des données** : Un broker ne peut jamais voir les données d'un autre
- **Performance** : Indexes et queries optimisés par tenant
- **Compliance** : Facilite les audits réglementaires par broker
- **Scalabilité** : Un broker peut être migré sur sa propre DB si nécessaire

### Résolution du tenant

```
Request → Header "X-Tenant-ID" ou subdomain → Middleware → Set schema → Execute query
```

Le middleware Fastify :
1. Extrait le tenant depuis le header ou le subdomain (broker-abc.tradexlabel.com)
2. Vérifie que le tenant existe et est actif
3. Configure le Prisma client pour utiliser le bon schema
4. Attache le tenant context à la request

## 2. Price Engine

### Sources de données

| Source | Type | Instruments | Coût | Latence |
|--------|------|-------------|------|---------|
| Finnhub | WebSocket | Forex, Crypto, US Stocks | Gratuit (limité) | ~100ms |
| Twelve Data | REST + WS | Forex, Crypto, Indices | Freemium | ~200ms |
| Mock Generator | Interne | Tous | Gratuit | 0ms |

### Pipeline de prix

```
Source WebSocket
    ↓
Raw Tick {symbol: "EUR/USD", bid: 1.0850, ask: 1.0852, timestamp}
    ↓
Price Normalizer (format uniforme)
    ↓
Redis PUBLISH "prices:EURUSD" {bid, ask, timestamp}
    ↓
┌──────────────────────────┬──────────────────────────┐
│ Candle Builder           │ Spread Engine            │
│ Agrège en OHLCV          │ Par broker :             │
│ 1m, 5m, 15m, 1h, 4h, 1d │ base_spread + markup     │
│ Stocke en DB             │ = client_spread          │
└──────────────┬───────────┴──────────────┬───────────┘
               │                          │
               ↓                          ↓
        PostgreSQL               WebSocket Broadcast
        (historique)             (prix temps réel aux clients)
```

### Candle Building

Les bougies sont construites à partir des ticks bruts :

```typescript
interface Candle {
  instrument_id: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date; // Début de la bougie
}
```

Logique :
- Chaque tick met à jour la bougie courante (high = max, low = min, close = dernier prix)
- Quand l'intervalle de temps se termine, la bougie est finalisée et stockée
- Une nouvelle bougie s'ouvre avec le tick suivant

## 3. Trading Engine

### Flux d'exécution d'un ordre

```
Client: BUY 1.0 lot EUR/USD @ Market
    ↓
API: POST /api/v1/orders
    ↓
Validation:
  - Instrument actif ?
  - Marge suffisante ?
  - Volume dans les limites ?
  - Marché ouvert ?
    ↓
Execution Mode Router:
  ├── A_BOOK → Forward to LP (futur)
  ├── B_BOOK → Internal execution au prix marché + spread
  └── B_BOOK_DEALER → Check dealer queue, puis execution
    ↓
Trade créé:
  - Position ouverte
  - Marge bloquée
  - WebSocket: mise à jour du compte
    ↓
P&L temps réel:
  - Chaque tick → recalcul P&L de toutes les positions ouvertes
  - Si equity < margin_call_level → alerte
  - Si equity < stop_out_level → liquidation auto
```

### Calculs financiers

```
Marge requise = (Volume × Lot Size × Prix) / Levier
P&L (forex) = (Prix actuel - Prix d'ouverture) × Volume × Lot Size × Direction
Equity = Balance + P&L non réalisé
Margin Level = (Equity / Marge utilisée) × 100%
```

**IMPORTANT** : Tous les calculs monétaires utilisent des integers (cents/pips).
Jamais de floating point pour les montants.

## 4. Module Dealer (ISOLÉ)

### Architecture d'isolation

```
packages/server/src/modules/
├── trading/          ← Module standard, toujours chargé
│   ├── routes.ts
│   ├── engine.ts     ← ExecutionEngine interface
│   └── ...
│
├── dealer/           ← Module ISOLÉ, chargé CONDITIONNELLEMENT
│   ├── plugin.ts     ← Fastify plugin auto-enregistré SI execution_mode === 'B_BOOK_DEALER'
│   ├── routes.ts     ← Routes /api/v1/dealer/*
│   ├── engine.ts     ← DealerExecutionEngine implements ExecutionEngine
│   ├── interventions.ts
│   └── ...
```

### Comment l'isolation fonctionne

```typescript
// Dans le setup du serveur :
if (tenant.execution_mode === 'B_BOOK_DEALER') {
  await server.register(dealerPlugin, { prefix: '/api/v1/dealer' });
  // Le DealerExecutionEngine remplace le StandardExecutionEngine
}
// Pour les autres modes, le module dealer n'est JAMAIS importé
```

### Capacités du dealer (quand activé)

| Action | Description |
|--------|-------------|
| Slippage control | Modifier le prix d'exécution de ±X pips |
| Requote | Refuser l'exécution et proposer un nouveau prix |
| Spread override | Élargir/réduire le spread pour un instrument |
| Trade result override | Modifier le P&L d'un trade clôturé |
| Delay execution | Ajouter un délai artificiel à l'exécution |

Toutes les interventions sont loggées dans `dealer_interventions` avec timestamp, dealer_id, et raison.

## 5. Interfaces utilisateur

### Terminal de Trading (Client)

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo Broker]     EUR/USD ▼    Balance: $10,000    [Logout] │
├──────────────────────────────────┬───────────────────────────┤
│                                  │  ┌─────────┬──────────┐  │
│                                  │  │   BUY   │   SELL   │  │
│     TradingView Chart            │  │  1.0852 │  1.0850  │  │
│     (Candlestick)                │  ├─────────┴──────────┤  │
│                                  │  │ Volume: [1.0] lot  │  │
│     Avec indicateurs             │  │ SL: [____] TP:[___]│  │
│     Timeframes: 1m,5m,15m,1h,4h │  │ [  PLACE ORDER  ]  │  │
│                                  │  └────────────────────┘  │
│                                  │                           │
│                                  │  Positions ouvertes       │
│                                  │  ┌──────────────────────┐ │
│                                  │  │ EUR/USD BUY 1.0      │ │
│                                  │  │ +$23.50  ███████     │ │
│                                  │  │ GBP/USD SELL 0.5     │ │
│                                  │  │ -$12.00  ███████     │ │
│                                  │  └──────────────────────┘ │
├──────────────────────────────────┴───────────────────────────┤
│  Historique | Ordres en attente | Résumé du compte           │
└──────────────────────────────────────────────────────────────┘
```

### Back-office Broker (Admin)

- Dashboard avec KPIs (clients actifs, volume, P&L broker, dépôts)
- Gestion clients (liste, KYC, activation/blocage)
- Gestion comptes (dépôts manuels, retraits, ajustements)
- Configuration instruments (activer/désactiver, spreads)
- Rapports exportables

### Dealing Desk (Dealer — si activé)

- Vue temps réel de toutes les positions ouvertes
- Exposition nette par instrument
- Boutons d'intervention par trade
- Historique des interventions

### SuperAdmin TradeXLabel

- Liste des brokers/tenants
- Création d'un nouveau broker (provisionne le schema)
- Monitoring global (santé des services, erreurs)
- Configuration des plans et facturation

## 6. API Endpoints (MVP)

### Auth
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
```

### Trading
```
GET    /api/v1/instruments
GET    /api/v1/instruments/:symbol/candles?timeframe=1h&limit=500
POST   /api/v1/orders
DELETE /api/v1/orders/:id
GET    /api/v1/positions
POST   /api/v1/positions/:id/close
GET    /api/v1/trades/history
```

### Account
```
GET    /api/v1/account
GET    /api/v1/account/transactions
```

### Admin (Broker)
```
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/clients
PATCH  /api/v1/admin/clients/:id
GET    /api/v1/admin/instruments
PATCH  /api/v1/admin/instruments/:id
POST   /api/v1/admin/accounts/:id/deposit
POST   /api/v1/admin/accounts/:id/withdraw
```

### Dealer (si activé)
```
GET    /api/v1/dealer/positions
POST   /api/v1/dealer/intervene/:tradeId
GET    /api/v1/dealer/interventions
PATCH  /api/v1/dealer/settings
```

### SuperAdmin
```
GET    /api/v1/super/tenants
POST   /api/v1/super/tenants
PATCH  /api/v1/super/tenants/:id
GET    /api/v1/super/monitoring
```

### WebSocket
```
ws://host/ws/prices          → Stream de prix temps réel
ws://host/ws/account         → Updates compte (P&L, balance, marges)
ws://host/ws/notifications   → Alertes (margin call, liquidation)
```

## 7. Instruments (Seed Data MVP)

### Forex (8 paires majeures)
EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD, EUR/GBP

### Crypto (6 paires)
BTC/USD, ETH/USD, XRP/USD, SOL/USD, ADA/USD, DOGE/USD

### Indices (5)
US500 (S&P 500), US100 (Nasdaq), US30 (Dow Jones), UK100 (FTSE), DE40 (DAX)

### Commodities (4)
XAU/USD (Or), XAG/USD (Argent), USOIL (Pétrole WTI), UKOIL (Pétrole Brent)

## 8. Sécurité

- **Authentification** : JWT avec access token (15min) + refresh token (7d)
- **Passwords** : bcrypt avec salt rounds = 12
- **Rate limiting** : Redis-based, par IP et par user
- **Input validation** : Zod schemas sur chaque endpoint
- **CORS** : Configuré par tenant (domaine du broker)
- **Helmet** : Headers de sécurité HTTP
- **SQL injection** : Impossible via Prisma (parameterized queries)
- **Audit logs** : Toutes les actions admin/dealer loggées

## 9. Configuration par tenant

```typescript
interface TenantConfig {
  id: string;
  name: string;
  domain: string;
  execution_mode: 'A_BOOK' | 'B_BOOK' | 'B_BOOK_DEALER';
  
  branding: {
    logo_url: string;
    primary_color: string;
    company_name: string;
  };
  
  trading: {
    default_leverage: number;       // ex: 100
    max_leverage: number;           // ex: 500
    margin_call_level: number;      // ex: 100 (%)
    stop_out_level: number;         // ex: 50 (%)
    max_positions: number;          // ex: 100
    max_volume_per_trade: number;   // ex: 50 (lots)
  };
  
  spreads: {
    [symbol: string]: {
      markup_pips: number;          // Ajouté au spread de base
      commission_per_lot: number;   // En USD
    };
  };
}
```
