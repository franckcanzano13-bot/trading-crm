# TradeXLabel — Catalogue des options proposables aux brokers

Document de référence commercial/produit. Chaque ligne correspond à une capacité
réellement présente dans le code (route API, modèle Prisma ou écran) à la date du
18 septembre 2026. Les colonnes « Activation » indiquent comment l'option se
configure pour un broker (tenant).

Légende : **Inclus** = disponible pour tout tenant · **Config** = à régler par
le broker ou le superadmin · **Option** = à activer explicitement (flag, build,
plan) · **Roadmap** = pas encore livré.

---

## 1. Modèles d'exécution (choix structurant, par tenant)

| Mode | Pour qui | Ce que ça change | Activation |
|---|---|---|---|
| `A_BOOK` | Brokers régulés (STP vers LP) | Le module dealer n'existe pas dans le runtime : image Docker `BUILD_PROFILE=regulated`, flag `ENABLE_DEALER_MODULE=0`. Preuve vérifiable en CI (assertion sur l'image). | `execution_mode` du tenant + build regulated |
| `B_BOOK` | Market makers, exécution fidèle au marché | Contrepartie interne, P&L broker suivi dans le ledger `BROKER_OPERATING`. | `execution_mode` |
| `B_BOOK_DEALER` | Dealing desk actif | Tout B_BOOK + module dealer : slippage max, requote, multiplicateur de spread, délai d'exécution, interventions tracées. | `execution_mode` + `ENABLE_DEALER_MODULE=1` |

> Le routage réel vers un liquidity provider (A-Book) n'est pas implémenté : le
> mode A_BOOK garantit aujourd'hui l'absence du code dealer, pas la connexion LP.
> Voir Roadmap.

## 2. Trading (côté client final)

| Option | Détail | Activation |
|---|---|---|
| Terminal web | Next.js, TradingView Lightweight Charts, prix temps réel WebSocket, thème sombre, responsive | Inclus |
| Classes d'actifs | Forex, Crypto, Indices, Matières premières — 23 instruments seedés, liste extensible par tenant | Config (admin instruments) |
| Types d'ordres | Market, Limit, Stop, OCO (one-cancels-the-other), Stop-Loss / Take-Profit modifiables, Trailing stop | Inclus |
| Levier | Par compte (défaut 1:100), plafonné par juridiction (ESMA / FCA / ASIC) | Config |
| Protection solde négatif | Clamp ESMA : solde et equity jamais négatifs | Inclus |
| Marge & liquidation | Calcul de marge décimal (decimal.js), margin call, stop-out en cascade sur un tick, worker de surveillance isolé avec leader election | Inclus |
| Timeframes graphiques | 1s, 1m, 5m, 15m, 1h, 4h, 1d, historique en base | Inclus |
| Sources de prix | Binance (crypto), Finnhub (forex), TwelveData (indices/commodités), Frankfurter/Yahoo (gratuit), mock de secours ; détection de spikes/gaps | Config (clés API) |
| Spread markup | Par instrument et par tenant | Config |
| Historique & P&L | Positions ouvertes avec P&L temps réel, historique des trades, transactions | Inclus |
| Comptes | Multi-devises (champ `currency`), dépôts via back-office, **demandes de retrait client validées par le staff** (KYC approuvé requis, solde libre re-vérifié à l'approbation, ledger de ségrégation) | Inclus |
| Notifications trader | Margin call, stop-out, ordre exécuté, trade fermé, dépôt, retrait (WebSocket + email) | Inclus |

## 3. Back-office broker

| Option | Détail | Activation |
|---|---|---|
| Dashboard | Vue d'ensemble, stats, positions ouvertes globales | Inclus |
| Gestion clients | Statuts, KYC, comptes, dépôts manuels audités, file des demandes de retrait (approuver / refuser avec motif), confirmation d'email manuelle | Inclus |
| Instruments | Activation, spreads, pip/lot size par tenant | Inclus |
| Rôles staff | Admin, Seller (conversion), Retention (dealing), données scopées par rôle | Inclus |
| 2FA staff | TOTP (Google Authenticator, Authy, 1Password), codes de secours, reset par le superadmin en cas de perte de device | Inclus |
| Mot de passe oublié | Traders et staff, lien signé 30 min à usage unique, email aux couleurs du broker, audité | Inclus |
| Vérification d'email | Inscription trader confirmée par email (24 h), trading bloqué tant que non confirmée, désactivable par broker | Config |
| Domaine white-label | Le broker est reconnu à partir de son domaine (`trade.broker.com`, `api.` / `www.`) ; les clients ne saisissent jamais d'identifiant | Config (CNAME) |
| IP whitelist | Liste d'IP autorisées pour le CRM/back-office | Config |
| Branding | Nom société, logo, couleur primaire, site, support, adresse ; emails aux couleurs du broker | Config |
| SMTP dédié | Serveur SMTP du broker (mot de passe chiffré AES-256-GCM) | Config |
| Rapports | Volume, P&L broker, exposition, export MiFIR/EMIR (LEI ISO 17442), rapport de ségrégation des fonds clients | Inclus |
| Audit | Journal append-only (immutabilité au niveau Postgres) de toutes les opérations financières et administratives | Inclus |

## 4. CRM intégré (vente & rétention)

| Option | Détail | Activation |
|---|---|---|
| Pipeline leads | Kanban, statuts NEW → CONVERTED/LOST, priorités (LOW→VIP), départements Seller/Retention, assignation, bulk assign, import/export | Inclus |
| Conversion 1 clic | Lead → client + compte + premier dépôt (FTD), le tout atomique et tracé dans le ledger | Inclus |
| Appels | Click-to-call SIP (Zoiper), journal d'appels, notes, tâches, relances | Config (domaine SIP) |
| KYC | Envoi/relance/statut/approbation/rejet via un backend KYC externe | Config (`KYC_API_URL`, `KYC_API_KEY`) |
| Emails | Templates par broker, logs d'envoi, notifications internes | Inclus |
| Affiliés | Programmes CPA, CPL, Revenue share, Hybride ; commissions auto sur FTD ; campagnes et UTM ; endpoint public d'injection de leads | Inclus |
| Géolocalisation & météo | Enrichissement IP du lead | Inclus |
| Multi-langue | FR / EN / AR (RTL) | Inclus |
| Auto-trader programs | Programmes de trading automatisés sur un panier de clients : objectif de gain %, période, trades/jour, taille min/max | Option (B_BOOK_DEALER) |
| Bulk trade | Ouvrir un même trade sur plusieurs clients en une opération | Option (B_BOOK_DEALER) |

## 5. Dealing desk (uniquement `B_BOOK_DEALER`)

| Option | Détail |
|---|---|
| Interventions | Slippage, requote, override de prix ou de P&L, clôture instantanée ou programmée |
| Paramètres | `max_slippage`, `requote_enabled`, `spread_multiplier`, `auto_delay_ms` |
| Traçabilité | Table `dealer_interventions` + audit log + ledger de ségrégation |
| Isolation | Plugin séparé, absent du build regulated, absent du routeur si flag désactivé |

## 6. Plateforme & conformité (arguments pour les brokers régulés)

| Capacité | Détail |
|---|---|
| Multi-tenant | Isolation par `tenant_id` sur chaque requête, tests d'escalade inter-tenant |
| Ségrégation des fonds | Ledger `CLIENT_TRUST` / `BROKER_OPERATING`, dérive calculée en continu, table append-only (MiFID II / FCA CASS / ASIC) |
| Reporting réglementaire | Export MiFIR/EMIR, LEI validé (mod-97) |
| Sécurité | JWT access+refresh, bcrypt, Zod, CORS whitelist, CSP/Helmet, rate-limit login (partagé via Redis en multi-instance), audit npm bloquant en CI |
| Observabilité | Logs structurés Pino, `/metrics` Prometheus protégé, healthcheck, OpenAPI/Swagger |
| Déploiement | Images Docker api (full / regulated) et web, docker-compose, migrations versionnées, worker séparé, CI qui construit et démarre les images |

## 7. Plans SuperAdmin (facturation TradeXLabel → broker)

Plans seedés, modifiables via `/api/v1/super/plans` :

| Plan | Prix/mois | Max users | Max instruments | Features |
|---|---|---|---|---|
| Starter | 99 $ | 50 | 30 | support email |
| Professional | 299 $ | 500 | 80 | support prioritaire, API |
| Enterprise | 999 $ | 10 000 | 200 | support 24/7, API, white-label complet, domaine custom |

Souscriptions, factures et paiement sont gérés côté superadmin (`/super/subscriptions`, `/super/invoices`).

Les plafonds `max_users` / `max_instruments` sont **appliqués** : refus à
l'inscription et à la conversion CRM au-delà du nombre de clients, refus
d'activation d'instrument au-delà du nombre autorisé, chaque refus audité
(`PLAN_LIMIT_HIT`) et l'usage exposé sur le tableau de bord du broker. Un
tenant sans abonnement actif n'a pas de plafond (sandbox, démo).

## 8. Roadmap (non livré, à ne pas vendre comme disponible)

- Connexion réelle à un liquidity provider (A-Book STP), hedging automatique.
- 2FA pour les traders (uniquement staff aujourd'hui).
- Passkeys / WebAuthn pour le staff.
- Passerelles de paiement (PSP, crypto) : les dépôts sont manuels via back-office.
- Provisioning automatique DNS/TLS des domaines personnalisés (la résolution par domaine fonctionne, le certificat et le CNAME restent manuels).
- Application mobile.
- Copy trading / signaux.
- Réconciliation bancaire externe du ledger de ségrégation.
