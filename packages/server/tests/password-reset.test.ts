import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { prisma } from '../src/shared/database/prisma';

/**
 * Phase 1.1 — Password reset for traders and staff. Postgres-only.
 *
 * SMTP is not configured for the test tenant, so the forgot endpoints take
 * the NO_SMTP path (still 200, token row still created). The raw token is
 * obtained through issuePasswordResetToken() directly for the reset cases.
 */
describe('Phase 1.1 — password reset', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let userId: string;
  let adminId: string;
  const stamp = Date.now();
  const userEmail = `trader-${stamp}@reset.test`;
  const adminEmail = `admin-${stamp}@reset.test`;
  let issue: typeof import('../src/modules/auth/password-reset').issuePasswordResetToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-password-reset' });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    const mod = await import('../src/modules/auth/password-reset');
    issue = mod.issuePasswordResetToken;
    await app.register(mod.passwordResetRoutes);

    const t = await prisma.tenant.create({ data: { name: 'Reset', domain: `reset-${stamp}.test`, slug: `reset-${stamp}`, execution_mode: 'B_BOOK' } });
    tenantId = t.id;
    const u = await prisma.user.create({ data: { tenant_id: tenantId, email: userEmail, name: 'Trader R', password_hash: await bcrypt.hash('old-pass-1', 4) } });
    userId = u.id;
    const a = await prisma.tenantAdmin.create({ data: { tenant_id: tenantId, email: adminEmail, name: 'Admin R', password_hash: await bcrypt.hash('old-pass-2', 4), role: 'admin' } });
    adminId = a.id;
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenantAdmin.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  it('forgot: unknown email → 200 and no token row (no enumeration)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', headers: { 'x-tenant-id': tenantId }, payload: { email: `nobody-${stamp}@reset.test` } });
    expect(res.statusCode).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { tenant_id: tenantId } })).toBe(0);
  });

  it('forgot: known trader → 200, one token row, audit PASSWORD_RESET_REQUESTED', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', headers: { 'x-tenant-id': tenantId }, payload: { email: userEmail } });
    expect(res.statusCode).toBe(200);
    const rows = await prisma.passwordResetToken.findMany({ where: { tenant_id: tenantId, subject_type: 'USER', subject_id: userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].used_at).toBeNull();
    expect(rows[0].token_hash).toHaveLength(64);
    const a = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'PASSWORD_RESET_REQUESTED', target: `user:${userId}` } });
    expect(a).not.toBeNull();
  });

  it('forgot again: previous token invalidated, only one live token', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/auth/password/forgot', headers: { 'x-tenant-id': tenantId }, payload: { email: userEmail } });
    const live = await prisma.passwordResetToken.count({ where: { subject_id: userId, used_at: null } });
    expect(live).toBe(1);
  });

  it('reset: valid token changes the trader password, single use, audited', async () => {
    const { raw } = await issue({ tenantId, subjectType: 'USER', subjectId: userId });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token: raw, password: 'new-pass-123' } });
    expect(res.statusCode).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(await bcrypt.compare('new-pass-123', u!.password_hash)).toBe(true);
    expect(await bcrypt.compare('old-pass-1', u!.password_hash)).toBe(false);

    const again = await app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token: raw, password: 'another-pass-1' } });
    expect(again.statusCode).toBe(400);
    expect(again.json().code).toBe('TOKEN_USED');

    const done = await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'PASSWORD_RESET_COMPLETED', target: `user:${userId}` } });
    expect(done).not.toBeNull();
  });

  it('reset: expired token → 400 TOKEN_EXPIRED and password unchanged', async () => {
    const { raw } = await issue({ tenantId, subjectType: 'USER', subjectId: userId });
    await prisma.passwordResetToken.updateMany({ where: { subject_id: userId, used_at: null }, data: { expires_at: new Date(Date.now() - 1000) } });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token: raw, password: 'expired-pass-1' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('TOKEN_EXPIRED');
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(await bcrypt.compare('new-pass-123', u!.password_hash)).toBe(true);
  });

  it('reset: garbage token → 400 INVALID_TOKEN', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token: 'f'.repeat(64), password: 'whatever-123' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_TOKEN');
  });

  it('reset: a USER token cannot be used on the admin endpoint', async () => {
    const { raw } = await issue({ tenantId, subjectType: 'USER', subjectId: userId });
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/password/reset', payload: { token: raw, password: 'cross-type-123' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_TOKEN');
  });

  it('staff: forgot with tenant_id + reset changes the admin password', async () => {
    const forgot = await app.inject({ method: 'POST', url: '/api/v1/admin/password/forgot', payload: { email: adminEmail, tenant_id: tenantId } });
    expect(forgot.statusCode).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { subject_type: 'ADMIN', subject_id: adminId, used_at: null } })).toBe(1);

    const { raw } = await issue({ tenantId, subjectType: 'ADMIN', subjectId: adminId });
    const res = await app.inject({ method: 'POST', url: '/api/v1/admin/password/reset', payload: { token: raw, password: 'admin-new-pass-1' } });
    expect(res.statusCode).toBe(200);
    const a = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
    expect(await bcrypt.compare('admin-new-pass-1', a!.password_hash)).toBe(true);
  });

  it('validation: short password → 400', async () => {
    const { raw } = await issue({ tenantId, subjectType: 'USER', subjectId: userId });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/password/reset', payload: { token: raw, password: 'short' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
