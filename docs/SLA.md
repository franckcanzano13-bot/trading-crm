# Service Level Agreement — TradeXLabel platform (draft for the first broker contracts)

Roadmap Phase 2.8. Figures are what the current architecture can honestly
support on a single-region deployment with a managed database; they are
tightened when Phase 3.6 (multi-region, HA) ships. Counsel reviews the
wording before it goes into a contract.

## 1. Scope

Covers the hosted platform: trading API and WebSocket price feed, client web
app, back-office and CRM, on the broker's white-label domain. Excludes
third-party services the broker chooses (payment providers, KYC provider,
the broker's own SMTP) and the public price feeds (see 5).

## 2. Availability

| Plan | Monthly availability target | Measured on |
|------|-----------------------------|-------------|
| Starter, Professional | 99.5 % | `GET /api/v1/health` from an external probe every minute |
| Enterprise | 99.9 % | same, plus order-placement synthetic check |

Excluded from the calculation: announced maintenance windows (3), force
majeure, outages of the broker's own DNS, domain or SMTP, and incidents
caused by the broker's staff (e.g. mass deactivation of instruments).

Service credits (Enterprise): 5 % of the monthly fee per 0.1 % below target,
capped at 30 %, claimed within 30 days.

## 3. Maintenance

Planned maintenance is announced 72 h ahead by email to the broker's admins
and performed on Sundays between 00:00 and 04:00 UTC when possible. Database
migrations ship without downtime when additive (release runbook); a
downtime window is announced when not.

## 4. Support

| Severity | Definition | Response | Update cadence | Channels |
|----------|-----------|----------|----------------|----------|
| S1 | Platform down or trading impossible for all clients; money-path integrity in doubt | 30 min, 24/7 | hourly | phone + email |
| S2 | Major function degraded (deposits/withdrawals, CRM, one instrument class) | 2 h business hours (Mon–Fri 08:00–20:00 CET), 4 h otherwise | 4 h | email + ticket |
| S3 | Minor defect, workaround exists | 1 business day | daily | ticket |
| S4 | Question, feature request | 2 business days | — | ticket |

Starter and Professional: S1/S2 during business hours, 24/7 S1 as an add-on.
Enterprise: 24/7 S1 included.

## 5. Market data

Prices come from third-party feeds (Binance, Finnhub, TwelveData, free
fallbacks). When a feed is down or geo-blocked, affected instruments serve
fallback data flagged in the health endpoint; the broker is notified within
15 minutes (S2) and may suspend the instruments. Paid feed subscriptions are
the broker's choice and cost.

## 6. Data protection and continuity

- Daily backups, 30 days retention, off-host copy; quarterly restore drill
  (runbook). Recovery point objective: 24 h (staging), 5 min with managed
  point-in-time recovery (production). Recovery time objective: 4 h.
- Client-funds segregation ledger with continuous drift monitoring; any
  drift is an S1 with same-day notification to the broker.
- Security incident affecting the broker's data: notification within 48 h
  (DPA), with the facts needed for the broker's own regulatory notice.

## 7. Change management

Every change goes through automated tests, a protected main branch and
staged rollout to staging before production. Breaking API changes are
announced 30 days ahead and versioned.

## 8. Reporting

Monthly report to the broker: availability, incidents with root causes,
support tickets and response times, plan usage against ceilings.
