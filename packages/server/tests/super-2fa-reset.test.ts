import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { prisma } from '../src/shared/database/prisma';

/**
 * Sprint 9.3 — SuperAdmin lost-device 2FA recovery.
 *
 * POST /api/v1/super/tenants/:id/admins/:adminId/2fa/reset clears the
 * admin's TOTP secret, flag and backup codes, writes a 2FA_RESET audit row
 * with actor_type superadmin, and is scoped to the tenant in the URL.
 * Postgres-only (DB-backed).
 */
describe('Sprint 9.3 — superadmin 2FA reset', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let otherTenantId: string;
  let adminId: string;
  let superToken: string;
  let adminToken: string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    const { encrypt } = await import('../src/shared/crypto/index');
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-super-2fa-reset-secret' });
    const { tenantRoutes } = await import('../src/modules/tenants/routes');
    await app.register(tenantRoutes);

    const stamp = Date.now();
    const t = await prisma.tenant.create({ data: { name: 'Reset T', domain: `r-${stamp}.test`, slug: `r-${stamp}`, execution_mode: 'B_BOOK' } });
    const o = await prisma.tenant.create({ data: { name: 'Other T', domain: `o-${stamp}.test`, slug: `o-${stamp}`, execution_mode: 'B_BOOK' } });
    tenantId = t.id; otherTenantId = o.id;

    const admin = await prisma.tenantAdmin.create({
      data: {
        tenant_id: tenantId, email: `reset-${stamp}@x.test`, name: 'Locked Out',
        password_hash: await bcrypt.hash('pw-not-used', 4), role: 'admin',
        totp_secret: encrypt(authenticator.generateSecret()), totp_enabled: true,
        totp_backup_codes: encrypt(JSON.stringify(['abc'])),
      },
    });
    adminId = admin.id;
    superToken = app.jwt.sign({ sub: 'super-1', email: 'root@tradexlabel.test', role: 'superadmin' });
    adminToken = app.jwt.sign({ sub: adminId, email: admin.email, role: 'admin', tenantId });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { target: `tenant_admin:${adminId}` } }).catch(() => {});
    await prisma.tenantAdmin.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: otherTenantId } }).catch(() => {});
    await app.close();
  });

  const url = (t: string, a: string) => `/api/v1/super/tenants/${t}/admins/${a}/2fa/reset`;

  it('rejects a tenant admin token (403)', async () => {
    const res = await app.inject({ method: 'POST', url: url(tenantId, adminId), headers: { authorization: `Bearer ${adminToken}` } });
    expect(res.statusCode).toBe(403);
  });

  it('404s when the admin belongs to a different tenant than the URL', async () => {
    const res = await app.inject({ method: 'POST', url: url(otherTenantId, adminId), headers: { authorization: `Bearer ${superToken}` } });
    expect(res.statusCode).toBe(404);
    const still = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
    expect(still!.totp_enabled).toBe(true);
  });

  it('clears secret, flag and backup codes, and audits 2FA_RESET', async () => {
    const res = await app.inject({ method: 'POST', url: url(tenantId, adminId), headers: { authorization: `Bearer ${superToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ admin_id: adminId, totp_enabled: false, was_enabled: true });

    const after = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
    expect(after!.totp_enabled).toBe(false);
    expect(after!.totp_secret).toBe('');
    expect(after!.totp_backup_codes).toBe('');

    const audit = await prisma.auditLog.findFirst({ where: { action: '2FA_RESET', target: `tenant_admin:${adminId}` } });
    expect(audit).not.toBeNull();
    expect(audit!.actor_type).toBe('superadmin');
    expect(audit!.actor_id).toBe('super-1');
  });
});
