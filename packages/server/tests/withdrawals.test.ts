import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/database/prisma';

/**
 * Phase 1.5 — Withdrawal request workflow. Postgres-only.
 * Money path is checked against Account.balance, transactions and the
 * client-funds segregation ledger (CLIENT_TRUST must drop by the amount).
 */
describe('Phase 1.5 — withdrawal requests', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let userId: string;
  let accountId: string;
  let traderToken: string;
  let adminToken: string;
  const stamp = Date.now();

  const trader = (path: string, method = 'GET', payload?: unknown) => app.inject({ method: method as 'GET', url: path, headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${traderToken}` }, payload });
  const admin = (path: string, method = 'GET', payload?: unknown) => app.inject({ method: method as 'GET', url: path, headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${adminToken}` }, payload });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-withdrawals' });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    await app.register((await import('../src/modules/accounts/withdrawals')).withdrawalRoutes);

    const t = await prisma.tenant.create({ data: { name: 'WD', domain: `wd-${stamp}.test`, slug: `wd-${stamp}`, execution_mode: 'B_BOOK' } });
    tenantId = t.id;
    const u = await prisma.user.create({ data: { tenant_id: tenantId, email: `wd-${stamp}@x.test`, name: 'Withdrawer', password_hash: await bcrypt.hash('x', 4), kyc_status: 'NONE', email_verified_at: new Date() } });
    userId = u.id;
    const a = await prisma.account.create({ data: { tenant_id: tenantId, user_id: userId, balance: 100_000n, equity: 100_000n, margin_used: 20_000n } }); // $1000, $200 in margin
    accountId = a.id;
    await prisma.clientFundsLedger.create({ data: { tenant_id: tenantId, account_id: accountId, pool: 'CLIENT_TRUST', amount_cents: 100_000n, kind: 'DEPOSIT', reference: 'seed', description: 'seed' } });
    traderToken = app.jwt.sign({ sub: userId, email: u.email, role: 'trader', tenantId });
    adminToken = app.jwt.sign({ sub: 'admin-wd', email: 'admin@wd.test', role: 'admin', tenantId });
  });

  afterAll(async () => {
    await prisma.withdrawalRequest.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.clientFundsLedger.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.transaction.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  it('KYC not approved → 403 KYC_REQUIRED', async () => {
    const r = await trader('/api/v1/withdrawals', 'POST', { amount: 100 });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('KYC_REQUIRED');
    await prisma.user.update({ where: { id: userId }, data: { kyc_status: 'APPROVED' } });
  });

  it('below minimum → 400, above available (balance − margin) → 400 with available_cents', async () => {
    expect((await trader('/api/v1/withdrawals', 'POST', { amount: 20 })).json().code).toBe('BELOW_MINIMUM');
    const r = await trader('/api/v1/withdrawals', 'POST', { amount: 900 });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('INSUFFICIENT_FUNDS');
    expect(r.json().available_cents).toBe('80000');
  });

  let firstId: string;
  it('creates a PENDING request, audited; a second request accounts for the pending one', async () => {
    const r = await trader('/api/v1/withdrawals', 'POST', { amount: 300, method: 'bank', destination: 'IBAN FR76…' });
    expect(r.statusCode).toBe(201);
    firstId = r.json().data.id;
    expect(r.json().data.status).toBe('PENDING');
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'WITHDRAWAL_REQUESTED', target: `withdrawal:${firstId}` } });
    expect(a).not.toBeNull();
    const second = await trader('/api/v1/withdrawals', 'POST', { amount: 600 });
    expect(second.json().code).toBe('INSUFFICIENT_FUNDS');
    expect(second.json().available_cents).toBe('50000');
    const list = await trader('/api/v1/withdrawals');
    expect(list.json().data).toHaveLength(1);
  });

  it('trader can cancel a pending request', async () => {
    const r = await trader('/api/v1/withdrawals', 'POST', { amount: 100 });
    const id = r.json().data.id;
    expect((await trader(`/api/v1/withdrawals/${id}/cancel`, 'POST', {})).statusCode).toBe(200);
    expect((await trader(`/api/v1/withdrawals/${id}/cancel`, 'POST', {})).statusCode).toBe(404);
    const row = await prisma.withdrawalRequest.findUnique({ where: { id } });
    expect(row!.status).toBe('CANCELLED');
  });

  it('admin lists pending requests with the client attached', async () => {
    const r = await admin('/api/v1/admin/withdrawals?status=PENDING');
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toHaveLength(1);
    expect(r.json().data[0].user.email).toBe(`wd-${stamp}@x.test`);
  });

  it('reject requires a reason and is audited', async () => {
    const r = await trader('/api/v1/withdrawals', 'POST', { amount: 100 });
    const id = r.json().data.id;
    expect((await admin(`/api/v1/admin/withdrawals/${id}/reject`, 'POST', {})).statusCode).toBe(400);
    expect((await admin(`/api/v1/admin/withdrawals/${id}/reject`, 'POST', { reason: 'Name mismatch on bank account' })).statusCode).toBe(200);
    const row = await prisma.withdrawalRequest.findUnique({ where: { id } });
    expect(row!.status).toBe('REJECTED');
    expect(row!.reason).toBe('Name mismatch on bank account');
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'WITHDRAWAL_REJECTED', target: `withdrawal:${id}` } });
    expect(a).not.toBeNull();
    const acct = await prisma.account.findUnique({ where: { id: accountId } });
    expect(acct!.balance).toBe(100_000n);
  });

  it('approve debits balance + equity, writes WITHDRAWAL transaction and ledger row, is single-shot', async () => {
    const r = await admin(`/api/v1/admin/withdrawals/${firstId}/approve`, 'POST', {});
    expect(r.statusCode).toBe(200);
    expect(r.json().data.new_balance_cents).toBe('70000');
    const acct = await prisma.account.findUnique({ where: { id: accountId } });
    expect(acct!.balance).toBe(70_000n);
    expect(acct!.equity).toBe(70_000n);
    const tx = await prisma.transaction.findFirst({ where: { account_id: accountId, type: 'WITHDRAWAL' } });
    expect(tx!.amount).toBe(-30_000n);
    const ledger = await prisma.clientFundsLedger.aggregate({ where: { tenant_id: tenantId, pool: 'CLIENT_TRUST' }, _sum: { amount_cents: true } });
    expect(ledger._sum.amount_cents).toBe(70_000n); // ledger == balance, no drift
    const row = await prisma.withdrawalRequest.findUnique({ where: { id: firstId } });
    expect(row!.status).toBe('APPROVED');
    expect(row!.transaction_id).toBe(tx!.id);
    expect((await admin(`/api/v1/admin/withdrawals/${firstId}/approve`, 'POST', {})).statusCode).toBe(409);
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'WITHDRAWAL_APPROVED', target: `withdrawal:${firstId}` } });
    expect(a).not.toBeNull();
  });

  it('approve re-checks free balance at decision time', async () => {
    const r = await trader('/api/v1/withdrawals', 'POST', { amount: 400 }); // available now 700-200 = 500
    const id = r.json().data.id;
    await prisma.account.update({ where: { id: accountId }, data: { margin_used: 60_000n } }); // a big trade opened meanwhile
    const a = await admin(`/api/v1/admin/withdrawals/${id}/approve`, 'POST', {});
    expect(a.statusCode).toBe(400);
    expect(a.json().code).toBe('INSUFFICIENT_FUNDS');
    const row = await prisma.withdrawalRequest.findUnique({ where: { id } });
    expect(row!.status).toBe('PENDING');
  });
});
