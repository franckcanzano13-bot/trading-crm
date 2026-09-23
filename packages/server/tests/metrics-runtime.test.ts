import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/shared/database/prisma';

/**
 * Phase 1.7 — the segregation canary is exposed to Prometheus. Postgres-only.
 */
describe('Phase 1.7 — runtime metrics', () => {
  let tenantId: string;
  const stamp = Date.now();
  const slug = `mx${stamp}`;
  let registry: typeof import('../src/shared/metrics/index').registry;
  let resetDriftCache: () => void;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const m = await import('../src/shared/metrics/index');
    const rt = await import('../src/shared/metrics/runtime');
    registry = m.registry; resetDriftCache = rt.resetDriftCache;
    const t = await prisma.tenant.create({ data: { name: 'Metrics', domain: `mx-${stamp}.test`, slug, execution_mode: 'B_BOOK' } });
    tenantId = t.id;
    const u = await prisma.user.create({ data: { tenant_id: tenantId, email: `mx-${stamp}@x.test`, name: 'M', password_hash: 'x' } });
    await prisma.account.create({ data: { tenant_id: tenantId, user_id: u.id, balance: 12_345n, equity: 12_345n } });
    // Ledger says 10_000 → drift = 10_000 - 12_345 = -2_345
    await prisma.clientFundsLedger.create({ data: { tenant_id: tenantId, account_id: 'x', pool: 'CLIENT_TRUST', amount_cents: 10_000n, kind: 'DEPOSIT', reference: 'seed', description: '' } });
  });

  afterAll(async () => {
    await prisma.clientFundsLedger.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  });

  it('exposes drift and client trust per tenant, and price source / monitor gauges', async () => {
    resetDriftCache();
    const text = await registry.metrics();
    // Default registry label app="tradexlabel" is appended to every label set.
    expect(text).toMatch(new RegExp(`tradexlabel_segregation_drift_cents\\{tenant="${slug}"[^}]*\\} -2345`));
    expect(text).toMatch(new RegExp(`tradexlabel_client_trust_cents\\{tenant="${slug}"[^}]*\\} 10000`));
    // The price engine is not started in unit tests: the gauge is registered but has no series yet.
    expect(text).toContain('# TYPE tradexlabel_price_source_up gauge');
    expect(text).toMatch(/tradexlabel_position_monitor_last_run_age_seconds(\{[^}]*\})? -1/);
  });

  it('drift goes to 0 once the ledger matches the balances (cache reset)', async () => {
    await prisma.clientFundsLedger.create({ data: { tenant_id: tenantId, account_id: 'x', pool: 'CLIENT_TRUST', amount_cents: 2_345n, kind: 'DEPOSIT', reference: 'fix', description: '' } });
    resetDriftCache();
    const text = await registry.metrics();
    expect(text).toMatch(new RegExp(`tradexlabel_segregation_drift_cents\\{tenant="${slug}"[^}]*\\} 0\\b`));
  });
});
