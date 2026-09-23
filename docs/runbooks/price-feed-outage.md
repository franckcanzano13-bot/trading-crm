# Price feed outage, geo-block or rate limit

The price engine chains sources: Binance (crypto), Finnhub (forex), TwelveData
or Yahoo/Frankfurter (indices, commodities, free forex), then a mock generator
for anything with no live feed. `GET /api/v1/health` lists every source with
`status`, `lastTick` and `tickCount`.

## Symptoms

- `health.priceSources.<name>.status != 'live'` or `lastTick` older than 60 s.
- Log lines `[<Source>] WebSocket upgrade refused (HTTP 451)` — the host is geo-blocked (Binance blocks US IPs, some clouds' egress ranges).
- `[TwelveData] HTTP 429` — free tier quota exhausted.
- Clients see stale or mock prices; open positions are valued on stale prices; SL/TP may not trigger.

## Immediate actions

1. Check the health endpoint on every api replica and on the position-monitor host (they have their own engine instance).
2. If a source is `failed` with 451/403: the connector gave up on purpose (permanent for this host). Either move the workload to a region the provider serves, or route that source through a proxy allowed by the provider's terms, or accept the fallback and tell brokers which instruments are on fallback data.
3. If 429: add a paid key (`FINNHUB_API_KEY`, `TWELVEDATA_API_KEY` in `.env`, `docker compose up -d api position-monitor`).
4. If a WebSocket source flaps: the connector reconnects with backoff up to 10 attempts then emits `failed`; restarting the api (`docker compose restart api`) resets the attempt counter.

## While on fallback

- The mock generator produces plausible but **fictional** prices. For a regulated broker this is not acceptable for live trading: pause trading on affected instruments (`PATCH /api/v1/admin/instruments/:id { is_active: false }`) until a live source is back, and record the decision in the audit log via the instrument update.
- Do not run bulk trades or dealer programs on fallback data.

## After

Add the outage to the ops journal with start/end, affected symbols and the source. If a source failed permanently, open a roadmap item to add a second provider for that asset class.
