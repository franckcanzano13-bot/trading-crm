import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { prisma } from '../src/shared/database/prisma';
import { tenantResolver } from '../src/shared/middleware/tenant-resolver';
import { requireAuth } from '../src/shared/middleware/auth';

/**
 * Phase 1.2 — Email verification. Postgres-only.
 *
 * Registers through the real /auth/register route, checks the token row,
 * exercises the verify/resend endpoints, the requireVerifiedEmail gate on a
 * probe route, the per-tenant opt-out, and the admin manual override.
 */
describe('Phase 1.2 — email verification', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let optOutTenantId: string;
  const stamp = Date.now();
  const email = `new-${stamp}@verify.test`;
  let userId: string;
  let traderToken: string;
  let adminToken: string;
  let issue: typeof import('../src/modules/auth/email-verification').issueEmailVerification;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-email-verification' });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    const auth = await import('../src/modules/auth/routes');
    const ev = await import('../src/modules/auth/email-verification');
    const users = await import('../src/modules/users/routes');
    issue = ev.issueEmailVerification;
    await app.register(auth.authRoutes);
    await app.register(ev.emailVerificationRoutes);
    await app.register(users.adminClientRoutes);
    // Probe route standing in for POST /orders
    app.post('/probe/trade', { preHandler: [tenantResolver, requireAuth, ev.requireVerifiedEmail] }, async () => ({ ok: true }));

    const t = await prisma.tenant.create({ data: { name: 'Verify', domain: `v-${stamp}.test`, slug: `v-${stamp}`, execution_mode: 'B_BOOK' } });
    tenantId = t.id;
    const o = await prisma.tenant.create({ data: { name: 'OptOut', domain: `vo-${stamp}.test`, slug: `vo-${stamp}`, execution_mode: 'B_BOOK', config: JSON.stringify({ require_email_verification: false }) } });
    optOutTenantId = o.id;
    adminToken = app.jwt.sign({ sub: 'admin-v', email: 'admin@v.test', role: 'admin', tenantId });
  });

  afterAll(async () => {
    for (const tid of [tenantId, optOutTenantId]) {
      await prisma.authToken.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.emailLog.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.account.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.user.deleteMany({ where: { tenant_id: tid } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tid } }).catch(() => {});
    }
    await app.close();
  });

  it('register: creates an unverified user, a live EMAIL_VERIFY token, and flags the response', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { 'x-tenant-id': tenantId }, payload: { email, password: 'Password123', accept_terms: true, name: 'New Trader' } });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.email_verification_required).toBe(true);
    traderToken = body.token;
    userId = body.user.id;
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u!.email_verified_at).toBeNull();
    const tokens = await prisma.authToken.findMany({ where: { purpose: 'EMAIL_VERIFY', subject_id: userId, used_at: null } });
    expect(tokens).toHaveLength(1);
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'EMAIL_VERIFICATION_SENT', target: `user:${userId}` } });
    expect(a).not.toBeNull();
  });

  it('gate: unverified user is refused with 403 EMAIL_NOT_VERIFIED', async () => {
    const res = await app.inject({ method: 'POST', url: '/probe/trade', headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${traderToken}` }, payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('verify: garbage token → 400 INVALID_TOKEN', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/email/verify', payload: { token: 'a'.repeat(64) } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_TOKEN');
  });

  it('verify: expired token → 400 TOKEN_EXPIRED', async () => {
    const { raw } = await issue({ tenantId, userId, email, name: 'New Trader' });
    await prisma.authToken.updateMany({ where: { subject_id: userId, used_at: null }, data: { expires_at: new Date(Date.now() - 1000) } });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/email/verify', payload: { token: raw } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('TOKEN_EXPIRED');
  });

  it('resend (authenticated) issues a new live token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/email/resend', headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${traderToken}` }, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(await prisma.authToken.count({ where: { purpose: 'EMAIL_VERIFY', subject_id: userId, used_at: null } })).toBe(1);
  });

  it('verify: valid token marks the user verified, single use, audited; gate opens', async () => {
    const { raw } = await issue({ tenantId, userId, email, name: 'New Trader' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/email/verify', payload: { token: raw } });
    expect(res.statusCode).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u!.email_verified_at).not.toBeNull();
    const again = await app.inject({ method: 'POST', url: '/api/v1/auth/email/verify', payload: { token: raw } });
    expect(again.json().code).toBe('TOKEN_USED');
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'EMAIL_VERIFIED', target: `user:${userId}` } });
    expect(a).not.toBeNull();

    const probe = await app.inject({ method: 'POST', url: '/probe/trade', headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${traderToken}` }, payload: {} });
    expect(probe.statusCode).toBe(200);

    const resend = await app.inject({ method: 'POST', url: '/api/v1/auth/email/resend', headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${traderToken}` }, payload: {} });
    expect(resend.json().data.already_verified).toBe(true);
  });

  it('opt-out tenant: unverified user passes the gate', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { 'x-tenant-id': optOutTenantId }, payload: { email: `opt-${stamp}@verify.test`, password: 'Password123', accept_terms: true, name: 'Opt Out' } });
    expect(reg.statusCode).toBe(201);
    expect(reg.json().data.email_verification_required).toBe(false);
    const probe = await app.inject({ method: 'POST', url: '/probe/trade', headers: { 'x-tenant-id': optOutTenantId, authorization: `Bearer ${reg.json().data.token}` }, payload: {} });
    expect(probe.statusCode).toBe(200);
  });

  it('admin can mark a client verified manually (audited)', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: { 'x-tenant-id': tenantId }, payload: { email: `manual-${stamp}@verify.test`, password: 'Password123', accept_terms: true, name: 'Manual' } });
    const id = reg.json().data.user.id;
    const res = await app.inject({ method: 'PATCH', url: `/api/v1/admin/clients/${id}`, headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${adminToken}` }, payload: { email_verified: true } });
    expect(res.statusCode).toBe(200);
    const u = await prisma.user.findUnique({ where: { id } });
    expect(u!.email_verified_at).not.toBeNull();
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'CLIENT_EMAIL_VERIFIED_UPDATE', target: `user:${id}` } });
    expect(a).not.toBeNull();
  });
});
