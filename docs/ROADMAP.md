# TradeXLabel — Feuille de route vers la commercialisation

**Date** : 22 septembre 2026
**Point de départ** : 50 commits, 155 tests verts sur PostgreSQL, images Docker construites en CI, audit npm vert, smoke de bout en bout 21/21. Catalogue des options dans [OFFERING.md](OFFERING.md).
**Objectif** : premier broker payant en production dans 8 semaines, deuxième segment (régulés) dans 6 mois.

Chaque phase a une **porte de sortie** : on ne passe pas à la suivante tant que les critères ne sont pas cochés. Les estimations sont en jours-personne pour un développeur senior à plein temps, hors imprévus.

---

## Phase 0 — Débloquer (semaine 1) — ~3 j

Ce qui empêche physiquement de livrer aujourd'hui.

| # | Action | Pourquoi | Effort |
|---|--------|----------|--------|
| 0.1 | Pousser les 14 commits locaux sur `main` depuis un poste avec les bons credentials GitHub (le compte configuré ici, juliengpt, n'a pas les droits sur le dépôt). Activer la protection de branche : CI verte obligatoire, pas de push direct. | Le travail des sprints 8 et 9 n'existe que sur cette VM. | 0.5 j |
| 0.2 | Faire passer le job CI `docker-images` une première fois. Corriger ce qu'il remonte. | Le Dockerfile web n'a jamais été construit par un daemon Docker. | 0.5 j |
| 0.3 | Activer Dependabot (npm, GitHub Actions, Docker). | L'audit était rouge depuis des mois sans que personne ne le voie. | 0.5 j |
| 0.4 | Choisir l'hébergement et créer l'environnement **staging** : Postgres managé, Redis managé, 2 conteneurs api + 1 position-monitor + 1 web, TLS, domaine `*.staging.tradexlabel.com`. | Il n'existe aucun environnement en dehors des postes de dev. | 1.5 j |

**Porte de sortie** : `main` protégée, CI complète verte sur GitHub, staging accessible en HTTPS avec les données de seed.

**État au 22 septembre 2026** — tout ce qui se fait dans le dépôt est livré, le reste attend le propriétaire GitHub et un serveur :
- 0.1 : commits prêts, `CODEOWNERS` et template de PR en place ; **push et protection de branche à faire par le propriétaire** ([runbook](runbooks/phase0-github-setup.md)).
- 0.2 : job CI Docker écrit ; **s'exécutera au premier push**.
- 0.3 : `.github/dependabot.yml` livré (npm groupé, Actions, Docker) ; **alertes à activer dans les réglages du dépôt**.
- 0.4 : stack staging complète en infrastructure-as-code (`deploy/staging/` : Traefik + TLS, api ×2, worker, web, Postgres, Redis, script de déploiement avec smoke), publication des images sur GHCR et déploiement SSH automatique après CI verte ; **il manque un VPS, deux enregistrements DNS et trois secrets GitHub** ([runbook](../deploy/staging/README.md)).

---

## Phase 1 — Prêt pour la production (semaines 2 à 4) — ~18 j

Ce qu'un premier client remarquerait le premier jour. Classé par risque.

### 1A. Trous fonctionnels bloquants (~6 j)

| # | Action | Constat | Effort |
|---|--------|---------|--------|
| 1.1 | **Mot de passe oublié** pour traders et staff : token signé à durée limitée, email via le SMTP du broker, audit. | Aucune route de reset n'existe. Un client qui oublie son mot de passe est bloqué. | 1.5 j |
| 1.2 | **Vérification d'email** à l'inscription trader + rate-limit sur `/auth/register`. | L'inscription est ouverte sans limite ni vérification : spam de comptes, KYC pollué. | 1 j |
| 1.3 | **Application des quotas de plan** (`max_users`, `max_instruments`) à la création, avec message clair et audit. | Stockés en base, jamais lus. On vend des plafonds qui n'existent pas. | 1 j |
| 1.4 | **Résolution du tenant par domaine complet**, pas seulement par sous-domaine. Documenter le CNAME à poser côté broker. | Le champ `domain` existe, le middleware ne regarde que le premier segment du host. Sans ça, pas de vrai white-label. | 1 j |
| 1.5 | **Retraits avec workflow** : demande client → validation admin → exécution, statuts et audit. | Aujourd'hui le retrait est un acte admin sans demande client. | 1.5 j |

### 1B. Exploitation (~7 j)

| # | Action | Constat | Effort |
|---|--------|---------|--------|
| 1.6 | **Sauvegardes** Postgres quotidiennes + PITR, et un **test de restauration** documenté et joué une fois. | Rien n'est écrit sur les sauvegardes. | 1 j |
| 1.7 | **Supervision** : Prometheus + Grafana branchés sur `/metrics`, alertes sur latence, erreurs 5xx, worker position-monitor arrêté, et **dérive de ségrégation ≠ 0**. | Le canari existe, personne ne le regarde. | 2 j |
| 1.8 | **Logs centralisés** (Loki ou équivalent) avec `tenant_id` et `request_id` en champs indexés. | Pino écrit sur stdout, c'est tout. | 1 j |
| 1.9 | **Runbooks** : rotation de `ENCRYPTION_KEY` et des secrets JWT, restauration, montée de version avec migration, incident « dérive de ségrégation », reset 2FA. | ADR-005 exige le runbook de rotation ; il n'existe pas. | 1.5 j |
| 1.10 | **Playwright en CI** contre le docker-compose : login des 4 rôles, un trade, une conversion CRM. | Le dossier `e2e/` existe, il ne tourne nulle part. | 1.5 j |

### 1C. Sécurité et conformité de base (~5 j)

| # | Action | Effort |
|---|--------|--------|
| 1.11 | **Pentest externe** (boîte noire + revue du multi-tenant). Budget prestataire à prévoir, correctifs inclus dans l'estimation. | 3 j |
| 1.12 | Règle ESLint ou test automatique « toute requête Prisma sur une table tenant porte un `tenant_id` » (ADR-002). | 1 j |
| 1.13 | Documents juridiques : CGU plateforme, politique de confidentialité, **DPA** broker ↔ TradeXLabel, durée de rétention des données et des logs d'audit, mentions RGPD dans le CRM (leads = données personnelles). Rédaction par un juriste, intégration côté produit. | 1 j (intégration) |

**Porte de sortie** : un compte trader peut naître, perdre son mot de passe et retirer ses fonds sans intervention manuelle ; un broker peut être servi sur son propre domaine ; une panne à 3 h du matin déclenche une alerte et un runbook.

---

## Phase 2 — Premier broker payant (semaines 5 à 8) — ~15 j

Cible : **un broker B_BOOK ou B_BOOK_DEALER non soumis à MiFID** (offshore, ou marché où le broker porte lui-même la licence). C'est le segment où le produit est complet aujourd'hui et où le cycle de vente est le plus court.

### 2A. Onboarding et facturation (~7 j)

| # | Action | Effort |
|---|--------|--------|
| 2.1 | **Création de tenant en libre-service** depuis le superadmin : nom, slug, mode d'exécution, admin initial, instruments par défaut, branding, en une transaction. Aujourd'hui c'est une route API. | 2 j |
| 2.2 | **Paiement des plans** via Stripe : abonnement mensuel, webhook qui passe la facture en PAID, suspension automatique du tenant après X jours d'impayé. Le passage en PAID est manuel aujourd'hui. | 3 j |
| 2.3 | **Environnement de démo permanent** avec données réalistes et remise à zéro nocturne, pour les rendez-vous commerciaux. | 1 j |
| 2.4 | **Kit d'intégration broker** : guide DNS, guide SMTP, guide KYC, guide affiliés, export des données. | 1 j |

### 2B. Ce que le pilote va demander (~8 j)

| # | Action | Effort |
|---|--------|--------|
| 2.5 | **Passerelle de dépôt** : au moins un PSP carte + un rail crypto (USDT), via webhook vers le ledger de ségrégation. Sans ça le broker encaisse hors plateforme et la ségrégation ne vaut rien. | 4 j |
| 2.6 | **Split des pages** `/admin`, `/dealer`, `/superadmin` en composants, et de `crm/routes.ts` en modules. Condition pour livrer vite les demandes du pilote. | 3 j |
| 2.7 | **Lint web** en CI (Next 16 a supprimé `next lint`). | 0.5 j |
| 2.8 | **SLA écrit** (disponibilité, délai de réponse support, fenêtre de maintenance) et canal de support (email + astreinte). | 0.5 j |

**Porte de sortie** : un broker a signé, paye par carte, a ses clients qui déposent, tradent et retirent sur son domaine, et n'a eu besoin d'aucune intervention en base de données pendant deux semaines.

---

## Phase 3 — Brokers régulés et montée en charge (mois 3 à 6) — ~45 j

Ce qui ouvre le segment MiFID / FCA / ASIC et justifie le plan Enterprise.

| # | Action | Pourquoi | Effort |
|---|--------|----------|--------|
| 3.1 | **Connexion à un liquidity provider** (A-Book réel) : bridge FIX ou API d'un agrégateur, routage, confirmation d'exécution, réconciliation. Le mode A_BOOK ne garantit aujourd'hui que l'absence du code dealer. | Sans ça, impossible de vendre à un régulé. | 15 j |
| 3.2 | **Hedging automatique** B-Book → LP au-delà d'un seuil d'exposition par instrument. | Gestion du risque broker, argument de vente majeur. | 5 j |
| 3.3 | **Réconciliation bancaire du ledger** : import des relevés du compte ségrégué, rapprochement avec `CLIENT_TRUST`, rapport CASS quotidien. | Exigence réglementaire réelle, pas seulement un ledger interne. | 5 j |
| 3.4 | **2FA traders** et **passkeys** pour le staff. | Attendu par les régulateurs et les assureurs. | 4 j |
| 3.5 | **Reporting réglementaire automatisé** : envoi MiFIR/EMIR vers un ARM, pas seulement un export. | Le format existe, le canal non. | 5 j |
| 3.6 | **Multi-région / haute disponibilité** : api sans état déjà prêt, ajouter réplica Postgres, failover Redis, run du position-monitor en actif/passif (leader election déjà en place). | SLA Enterprise. | 4 j |
| 3.7 | **Parcours SOC 2 Type I** : politiques, contrôle d'accès, revue des logs d'audit. | Demandé dans les appels d'offres. | 5 j + auditeur |
| 3.8 | **PWA mobile** du terminal (avant une app native). | Attente client, coût faible. | 2 j |

**Porte de sortie** : un broker régulé peut passer un audit interne avec la plateforme comme preuve, et le plan Enterprise a un SLA tenu.

---

## Phase 4 — Différenciation (mois 6 et plus)

À lancer selon ce que les premiers clients demandent réellement, pas avant.

- Copy trading et signaux.
- Application mobile native.
- Marketplace d'intégrations (KYC alternatifs, PSP, CRM externes, webhooks sortants).
- API publique documentée pour les brokers (la spec OpenAPI existe déjà).
- Facturation à l'usage (volume tradé) en plus de l'abonnement.

---

## Go-to-market en parallèle du développement

| Quand | Action |
|-------|--------|
| Semaine 1 | Positionnement : « plateforme de trading white-label avec CRM intégré, déployable en une semaine ». Cible initiale : brokers en création et IB qui veulent leur propre marque. Fixer les prix publics (Starter 99 $, Professional 299 $, Enterprise 999 $ sont seedés, à valider contre le marché). |
| Semaine 2 | Site vitrine + demande de démo. Deck de 10 slides construit sur OFFERING.md, avec la ségrégation des fonds et l'isolation du module dealer comme arguments de confiance. |
| Semaine 3 | Démo scénarisée sur l'environnement de démo : lead → conversion → dépôt → trade → rapport de ségrégation, en 12 minutes. |
| Semaines 4 à 6 | Prospection : 30 conversations, objectif 3 pilotes signés à tarif réduit contre étude de cas. |
| Semaine 8 | Premier broker payant en production. Étude de cas rédigée. |
| Mois 3 | Ouverture du segment régulé quand 3.1 et 3.3 sont livrés. Partenariats LP et PSP annoncés. |

## Indicateurs à suivre dès la phase 2

- Brokers actifs, MRR, churn.
- Par broker : traders actifs, volume, dépôts nets, temps de première valeur (création du tenant → premier trade réel).
- Technique : disponibilité api, p95 latence ordres, dérive de ségrégation (doit rester à zéro), tickets support par broker et par semaine.

## Risques et parades

| Risque | Parade |
|--------|--------|
| Un broker B_BOOK_DEALER utilise le module dealer de façon abusive et expose TradeXLabel. | Contrat : le broker est responsable de l'exécution ; toutes les interventions sont tracées et exportables ; possibilité de couper le flag à distance. |
| Une seule personne connaît le code. | Runbooks (1.9), ADR à jour, second développeur à recruter avant la phase 3. |
| Dépendance à des flux de prix gratuits. | Contrats Finnhub / TwelveData payants dès le premier client ; alerte si une source tombe. |
| Dette front (pages monolithiques). | Traitée en 2.6 avant que le pilote ne génère des demandes d'évolution. |

## Total indicatif

| Phase | Effort dev | Calendrier |
|-------|-----------|------------|
| 0 | 3 j | semaine 1 |
| 1 | 18 j | semaines 2 à 4 |
| 2 | 15 j | semaines 5 à 8 |
| 3 | 45 j | mois 3 à 6 |

Un développeur senior seul tient les phases 0 à 2. La phase 3 demande deux personnes ou un partenaire pour le bridge LP.
