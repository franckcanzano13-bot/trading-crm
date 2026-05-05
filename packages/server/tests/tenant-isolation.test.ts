import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/shared/database/prisma';
import { tenantResolver } from '../src/shared/middleware/tenant-resolver';
import { requireAdmin, requireAuth } from '../src/shared/middleware/auth';

/**
 * VULN-001 regression test: an admin of tenant A must not be able to
 * authenticate against tenant B by changing the X-Tenant-ID header.
 *
 * Before the fix, requireAdmin only checked decoded.role and never
 * compared decoded.tenantId to the resolved request.tenantId.
 */
describe('Cross-tenant escalation (VULN-001)', () => {
  let app: FastifyInstance;
  let tenantA: { id: string };
  let tenantB: { id: string };
  let adminAToken: string;
  let traderAToken: string;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-secret-cross-tenant' });

    // Minimal protected route to test middleware behavior
    app.get('/test/admin', { preHandler: [tenantResolver, requireAdmin] }, async (req) => {
      return { ok: true, role: (req as any).userData?.role, tenantId: (req as any).tenantId };
    });
    app.get('/test/auth', { preHandler: [tenantResolver, requireAuth] }, async (req) => {
      return { ok: true, sub: (req as any).userData?.sub, tenantId: (req as any).tenantId };
    });

    tenantA = await prisma.tenant.create({
      data: { name: 'Tenant A', domain: `tA-${Date.now()}.test`, slug: `ta-${Date.now()}`, execution_mode: 'B_BOOK' },
    });
    tenantB = await prisma.tenant.create({
      data: { name: 'Tenant B', domain: `tB-${Date.now()}.test`, slug: `tb-${Date.now()}`, execution_mode: 'B_BOOK' },
    });

    adminAToken = app.jwt.sign({ sub: 'admin-A', email: 'admin@a.test', role: 'admin', tenantId: tenantA.id });
    traderAToken = app.jwt.sign({ sub: 'trader-A', email: 'trader@a.test', role: 'trader', tenantId: tenantA.id });
  });

  afterAll(async () => {
    if (tenantA?.id) await prisma.tenant.delete({ where: { id: tenantA.id } }).catch(() => {});
    if (tenantB?.id) await prisma.tenant.delete({ where: { id: tenantB.id } }).catch(() => {});
    await app.close();
  });

  it('admin of tenant A accessing tenant A: 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/admin',
      headers: { authorization: `Bearer ${adminAToken}`, 'x-tenant-id': tenantA.id },
    });
    expect(res.statusCode).toBe(200);
  });

  it('admin of tenant A trying to access tenant B: 403 TENANT_MISMATCH', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/admin',
      headers: { authorization: `Bearer ${adminAToken}`, 'x-tenant-id': tenantB.id },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('TENANT_MISMATCH');
  });

  it('trader of tenant A trying to access tenant B: 403 TENANT_MISMATCH', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: { authorization: `Bearer ${traderAToken}`, 'x-tenant-id': tenantB.id },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('TENANT_MISMATCH');
  });

  it('trader of tenant A accessing tenant A: 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: { authorization: `Bearer ${traderAToken}`, 'x-tenant-id': tenantA.id },
    });
    expect(res.statusCode).toBe(200);
  });
});
