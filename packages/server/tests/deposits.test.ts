import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/database/prisma';

/** Phase 2.5a — Deposit declarations confirmed by staff. Postgres-only. */
describe('Phase 2.5a — deposit declarations', () => {
  let app: FastifyInstance;
  let tenantId: string; let userId: string; let accountId: string;
  let traderToken: string; let adminToken: string;
  const stamp = Date.now();
  const trader = (path: string, method = 'GET', payload?: unknown) => app.inject({ method: method as 'GET', url: path, headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${traderToken}` }, payload });
  const admin = (path: string, method = 'GET', payload?: unknown) => app.inject({ method: method as 'GET', url: path, headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${adminToken}` }, payload });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-deposits' });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    await app.register((await import('../src/modules/accounts/deposits')).depositRoutes);
    const t = await prisma.tenant.create({ data: { name: 'Dep', domain: `dep-${stamp}.test`, slug: `dep${stamp}`, execution_mode: 'B_BOOK' } });
    tenantId = t.id;
    const u = await prisma.user.create({ data: { tenant_id: tenantId, email: `dep-${stamp}@x.test`, name: 'Depositor', password_hash: await bcrypt.hash('x', 4), email_verified_at: new Date() } });
    userId = u.id;
    const a = await prisma.account.create({ data: { tenant_id: tenantId, user_id: userId, balance: 0n, equity: 0n } });
    accountId = a.id;
    traderToken = app.jwt.sign({ sub: userId, email: u.email, role: 'trader', tenantId });
    adminToken = app.jwt.sign({ sub: 'admin-dep', email: 'admin@dep.test', role: 'admin', tenantId });
  });

  afterAll(async () => {
    await prisma.depositRequest.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.clientFundsLedger.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.transaction.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  let id: string;
  it('declares a deposit (PENDING, nothing credited), audited', async () => {
    expect((await trader('/api/v1/deposits', 'POST', { amount: 5, method: 'bank' })).json().code).toBe('BELOW_MINIMUM');
    const r = await trader('/api/v1/deposits', 'POST', { amount: 500, method: 'bank', reference: 'TXN-42' });
    expect(r.statusCode).toBe(201);
    id = r.json().data.id;
    expect((await prisma.account.findUnique({ where: { id: accountId } }))!.balance).toBe(0n);
    expect(await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'DEPOSIT_DECLARED', target: `deposit:${id}` } })).not.toBeNull();
    expect((await trader('/api/v1/deposits')).json().data).toHaveLength(1);
  });

  it('staff confirm with a different received amount: balance, transaction and ledger move by what arrived', async () => {
    const list = await admin('/api/v1/admin/deposits?status=PENDING');
    expect(list.json().data[0].user.email).toBe(`dep-${stamp}@x.test`);
    const r = await admin(`/api/v1/admin/deposits/${id}/confirm`, 'POST', { amount_received: 495 });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.credited_cents).toBe('49500');
    const acct = await prisma.account.findUnique({ where: { id: accountId } });
    expect(acct!.balance).toBe(49_500n); expect(acct!.equity).toBe(49_500n);
    const tx = await prisma.transaction.findFirst({ where: { account_id: accountId, type: 'DEPOSIT' } });
    expect(tx!.amount).toBe(49_500n);
    const ledger = await prisma.clientFundsLedger.aggregate({ where: { tenant_id: tenantId, pool: 'CLIENT_TRUST' }, _sum: { amount_cents: true } });
    expect(ledger._sum.amount_cents).toBe(49_500n);
    const row = await prisma.depositRequest.findUnique({ where: { id } });
    expect(row!.status).toBe('CONFIRMED'); expect(row!.credited_cents).toBe(49_500n); expect(row!.transaction_id).toBe(tx!.id);
    expect((await admin(`/api/v1/admin/deposits/${id}/confirm`, 'POST', {})).statusCode).toBe(409);
  });

  it('cancel while pending; reject requires a reason', async () => {
    const a = await trader('/api/v1/deposits', 'POST', { amount: 100, method: 'crypto' });
    expect((await trader(`/api/v1/deposits/${a.json().data.id}/cancel`, 'POST', {})).statusCode).toBe(200);
    const b = await trader('/api/v1/deposits', 'POST', { amount: 100, method: 'card' });
    expect((await admin(`/api/v1/admin/deposits/${b.json().data.id}/reject`, 'POST', {})).statusCode).toBe(400);
    expect((await admin(`/api/v1/admin/deposits/${b.json().data.id}/reject`, 'POST', { reason: 'No funds received' })).statusCode).toBe(200);
    expect((await prisma.account.findUnique({ where: { id: accountId } }))!.balance).toBe(49_500n);
  });
});
