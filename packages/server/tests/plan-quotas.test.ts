import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { prisma } from '../src/shared/database/prisma';

/**
 * Phase 1.3 — Plan quotas (max_users, max_instruments). Postgres-only.
 */
describe('Phase 1.3 — plan quota enforcement', () => {
  let app: FastifyInstance;
  let tenantId: string;      // plan: 1 user, 1 instrument
  let freeTenantId: string;  // no subscription → unlimited
  let planId: string;
  let adminToken: string;
  const stamp = Date.now();
  const instrumentIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-plan-quotas' });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    await app.register((await import('../src/modules/auth/routes')).authRoutes);
    await app.register((await import('../src/modules/users/routes')).adminClientRoutes);

    const t = await prisma.tenant.create({ data: { name: 'Quota', domain: `q-${stamp}.test`, slug: `q-${stamp}`, execution_mode: 'B_BOOK', config: JSON.stringify({ require_email_verification: false }) } });
    tenantId = t.id;
    const f = await prisma.tenant.create({ data: { name: 'Free', domain: `qf-${stamp}.test`, slug: `qf-${stamp}`, execution_mode: 'B_BOOK', config: JSON.stringify({ require_email_verification: false }) } });
    freeTenantId = f.id;
    const plan = await prisma.plan.create({ data: { name: `Tiny-${stamp}`, price_cents: 100, max_users: 1, max_instruments: 1 } });
    planId = plan.id;
    await prisma.subscription.create({ data: { tenant_id: tenantId, plan_id: planId, status: 'ACTIVE' } });
    for (const sym of ['QA1', 'QA2']) {
      const i = await prisma.instrument.create({ data: { tenant_id: tenantId, symbol: `${sym}-${stamp}`, display_name: sym, type: 'FOREX', pip_size: 0.0001, lot_size: 100000, is_active: false } });
      instrumentIds.push(i.id);
    }
    adminToken = app.jwt.sign({ sub: 'admin-q', email: 'admin@q.test', role: 'admin', tenantId });
  });

  afterAll(async () => {
    for (const tid of [tenantId, freeTenantId]) {
      await prisma.auditLog.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.authToken.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.account.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.instrument.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.subscription.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tid } }).catch(() => {});
    }
    await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
    await app.close();
  });

  // Each registration comes from its own IP: /auth/register is rate-limited
  // 5 / hour / IP (Phase 1.2) and this file registers more than five accounts.
  let ipSeq = 0;
  const register = (tid: string, n: number) => app.inject({
    method: 'POST', url: '/api/v1/auth/register', headers: { 'x-tenant-id': tid },
    remoteAddress: `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250 + 1}`,
    payload: { email: `u${n}-${stamp}@q.test`, password: 'Password123', name: `U${n}` },
  });

  it('max_users: first registration passes, second is refused 403 PLAN_LIMIT_USERS and audited', async () => {
    expect((await register(tenantId, 1)).statusCode).toBe(201);
    const second = await register(tenantId, 2);
    expect(second.statusCode).toBe(403);
    expect(second.json().code).toBe('PLAN_LIMIT_USERS');
    expect(await prisma.user.count({ where: { tenant_id: tenantId } })).toBe(1);
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'PLAN_LIMIT_HIT' } });
    expect(a).not.toBeNull();
    expect(JSON.parse(a!.details).kind).toBe('users');
  });

  it('no subscription: registrations are unlimited', async () => {
    expect((await register(freeTenantId, 1)).statusCode).toBe(201);
    expect((await register(freeTenantId, 2)).statusCode).toBe(201);
    expect((await register(freeTenantId, 3)).statusCode).toBe(201);
  });

  it('max_instruments: activating the first instrument passes, the second is refused', async () => {
    const h = { 'x-tenant-id': tenantId, authorization: `Bearer ${adminToken}` };
    const a = await app.inject({ method: 'PATCH', url: `/api/v1/admin/instruments/${instrumentIds[0]}`, headers: h, payload: { is_active: true } });
    expect(a.statusCode).toBe(200);
    const b = await app.inject({ method: 'PATCH', url: `/api/v1/admin/instruments/${instrumentIds[1]}`, headers: h, payload: { is_active: true } });
    expect(b.statusCode).toBe(403);
    expect(b.json().code).toBe('PLAN_LIMIT_INSTRUMENTS');
    // Re-saving an already active instrument (e.g. spread change) is not a new activation
    const c = await app.inject({ method: 'PATCH', url: `/api/v1/admin/instruments/${instrumentIds[0]}`, headers: h, payload: { is_active: true, spread_markup: 2 } });
    expect(c.statusCode).toBe(200);
    // Deactivating is always allowed
    const d = await app.inject({ method: 'PATCH', url: `/api/v1/admin/instruments/${instrumentIds[0]}`, headers: h, payload: { is_active: false } });
    expect(d.statusCode).toBe(200);
  });

  it('expired subscription lifts the quota (no plan → unlimited)', async () => {
    await prisma.subscription.updateMany({ where: { tenant_id: tenantId }, data: { ends_at: new Date(Date.now() - 1000) } });
    try {
      expect((await register(tenantId, 3)).statusCode).toBe(201);
    } finally {
      await prisma.subscription.updateMany({ where: { tenant_id: tenantId }, data: { ends_at: null } });
    }
  });

  it('dashboard exposes plan usage', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${adminToken}` } });
    expect(res.statusCode).toBe(200);
    const usage = res.json().data.plan_usage;
    expect(usage.plan.name).toBe(`Tiny-${stamp}`);
    expect(usage.users.max).toBe(1);
    expect(usage.users.current).toBe(2);
    expect(usage.instruments.max).toBe(1);
  });
});
