/**
 * Sprint 3.3 — Prometheus metrics.
 *
 * Default metrics: process CPU, memory, event loop lag, etc. (auto-collected).
 *
 * Custom metrics:
 *  - tradexlabel_http_requests_total{method, route, status_code}
 *  - tradexlabel_http_request_duration_seconds{method, route}
 *  - tradexlabel_trades_opened_total{tenant, side, instrument_type}
 *  - tradexlabel_trades_closed_total{tenant, side, status}
 *  - tradexlabel_dealer_interventions_total{tenant, action}
 *  - tradexlabel_login_attempts_total{outcome, role}
 *  - tradexlabel_price_ticks_total{source, accepted}
 *  - tradexlabel_open_positions{tenant}  (gauge)
 *
 * Endpoint: GET /metrics  (no auth — bind only to internal interface in prod)
 */
import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ app: 'tradexlabel' });

// Default Node.js process metrics (CPU, memory, GC, etc.)
collectDefaultMetrics({ register: registry });

// ─── HTTP ───
export const httpRequestsTotal = new Counter({
  name: 'tradexlabel_http_requests_total',
  help: 'Total HTTP requests handled',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'tradexlabel_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// ─── Trading ───
export const tradesOpenedTotal = new Counter({
  name: 'tradexlabel_trades_opened_total',
  help: 'Trades opened',
  labelNames: ['tenant', 'side', 'instrument_type'] as const,
  registers: [registry],
});

export const tradesClosedTotal = new Counter({
  name: 'tradexlabel_trades_closed_total',
  help: 'Trades closed',
  labelNames: ['tenant', 'side', 'status'] as const,
  registers: [registry],
});

export const openPositionsGauge = new Gauge({
  name: 'tradexlabel_open_positions',
  help: 'Currently open positions per tenant',
  labelNames: ['tenant'] as const,
  registers: [registry],
});

// ─── Dealer ───
export const dealerInterventionsTotal = new Counter({
  name: 'tradexlabel_dealer_interventions_total',
  help: 'Dealer interventions executed',
  labelNames: ['tenant', 'action'] as const,
  registers: [registry],
});

// ─── Auth ───
export const loginAttemptsTotal = new Counter({
  name: 'tradexlabel_login_attempts_total',
  help: 'Login attempts',
  labelNames: ['outcome', 'role'] as const,
  registers: [registry],
});

// ─── Pricing ───
export const priceTicksTotal = new Counter({
  name: 'tradexlabel_price_ticks_total',
  help: 'Price ticks received',
  labelNames: ['source', 'accepted'] as const,
  registers: [registry],
});
