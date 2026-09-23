/**
 * Phase 1.7 — Runtime gauges computed at scrape time.
 *
 * Kept out of metrics/index.ts because these need the price engine, the
 * position monitor and Prisma, and metrics/index.ts is imported by those
 * modules (a static import here would be a cycle).
 *
 *  - tradexlabel_segregation_drift_cents{tenant}   the ADR-010 canary, per active tenant
 *  - tradexlabel_client_trust_cents{tenant}        broker's liability to clients
 *  - tradexlabel_price_source_up{source}           1 = live, 0 = anything else
 *  - tradexlabel_price_source_tick_age_seconds{source}
 *  - tradexlabel_position_monitor_last_run_age_seconds
 *
 * Drift is expensive (three aggregates per tenant), so it is cached for
 * DRIFT_CACHE_MS between scrapes.
 */
import { Gauge } from 'prom-client';
import { registry } from './index';
import { prisma } from '../database/prisma';
import { getPoolBalances } from '../segregation';
import { priceEngine } from '../../modules/pricing/price-engine';
import { getPositionMonitorLastRun } from '../../modules/trading/position-monitor';
import { logger } from '../utils/index';

const DRIFT_CACHE_MS = 30_000;
let driftCache: { at: number; rows: { tenant: string; drift: bigint; trust: bigint }[] } = { at: 0, rows: [] };

async function loadDrift() {
  if (Date.now() - driftCache.at < DRIFT_CACHE_MS) return driftCache.rows;
  try {
    const tenants = await prisma.tenant.findMany({ where: { is_active: true }, select: { id: true, slug: true } });
    const rows = await Promise.all(tenants.map(async (t) => {
      const b = await getPoolBalances(t.id);
      return { tenant: t.slug, drift: b.drift_cents, trust: b.client_trust_cents };
    }));
    driftCache = { at: Date.now(), rows };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[metrics] drift collection failed');
  }
  return driftCache.rows;
}

export const segregationDriftGauge = new Gauge({
  name: 'tradexlabel_segregation_drift_cents',
  help: 'client_trust ledger minus sum(account.balance), per tenant. Must be 0 (ADR-010).',
  labelNames: ['tenant'] as const,
  registers: [registry],
  async collect() {
    const rows = await loadDrift();
    this.reset();
    for (const r of rows) this.labels(r.tenant).set(Number(r.drift));
  },
});

export const clientTrustGauge = new Gauge({
  name: 'tradexlabel_client_trust_cents',
  help: 'Sum of the CLIENT_TRUST pool per tenant (broker liability to clients).',
  labelNames: ['tenant'] as const,
  registers: [registry],
  async collect() {
    const rows = await loadDrift();
    this.reset();
    for (const r of rows) this.labels(r.tenant).set(Number(r.trust));
  },
});

export const priceSourceUpGauge = new Gauge({
  name: 'tradexlabel_price_source_up',
  help: '1 when the price source reports status=live, else 0.',
  labelNames: ['source'] as const,
  registers: [registry],
  collect() {
    this.reset();
    for (const [key, info] of priceEngine.getSourceInfo()) this.labels(key).set(info.status === 'live' ? 1 : 0);
  },
});

export const priceSourceTickAgeGauge = new Gauge({
  name: 'tradexlabel_price_source_tick_age_seconds',
  help: 'Seconds since the last accepted tick from the source (-1 = never).',
  labelNames: ['source'] as const,
  registers: [registry],
  collect() {
    this.reset();
    const now = Date.now();
    for (const [key, info] of priceEngine.getSourceInfo()) this.labels(key).set(info.lastTick ? (now - info.lastTick) / 1000 : -1);
  },
});

export const positionMonitorAgeGauge = new Gauge({
  name: 'tradexlabel_position_monitor_last_run_age_seconds',
  help: 'Seconds since the position monitor loop last completed in this process (-1 = not running here).',
  registers: [registry],
  collect() {
    const last = getPositionMonitorLastRun();
    this.set(last ? (Date.now() - last) / 1000 : -1);
  },
});

/** Test helper: drop the cache so the next scrape recomputes drift. */
export function resetDriftCache() { driftCache = { at: 0, rows: [] }; }
