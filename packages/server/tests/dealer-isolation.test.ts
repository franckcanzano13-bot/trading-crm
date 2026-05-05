import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/shared/database/prisma';

/**
 * Integration test: dealer routes must reject tenants whose execution_mode
 * is not B_BOOK_DEALER. This is a compliance-critical guarantee.
 */
describe('Dealer route isolation by execution_mode', () => {
  let app: FastifyInstance;
  let abookTenantId: string;
  let dealerTenantId: string;
  let abookAdminToken: string;
  let dealerAdminToken: string;

  beforeAll(async () => {
    // Build minimal Fastify app with JWT + dealer plugin only
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-secret-for-dealer-isolation' });
    const { dealerRoutes } = await import('../src/modules/dealer/routes');
    await app.register(dealerRoutes);

    // Create A_BOOK tenant
    const abook = await prisma.tenant.create({
      data: {
        name: 'Test A-Book Broker',
        domain: `test-abook-${Date.now()}.test`,
        slug: `test-abook-${Date.now()}`,
        execution_mode: 'A_BOOK',
      },
    });
    abookTenantId = abook.id;

    // Create B_BOOK_DEALER tenant
    const dealer = await prisma.tenant.create({
      data: {
        name: 'Test Dealer Broker',
        domain: `test-dealer-${Date.now()}.test`,
        slug: `test-dealer-${Date.now()}`,
        execution_mode: 'B_BOOK_DEALER',
      },
    });
    dealerTenantId = dealer.id;

    // Generate admin JWTs (role=admin) for each
    abookAdminToken = app.jwt.sign({
      sub: 'test-admin-abook',
      email: 'admin@abook.test',
      role: 'admin',
      tenantId: abookTenantId,
    });
    dealerAdminToken = app.jwt.sign({
      sub: 'test-admin-dealer',
      email: 'admin@dealer.test',
      role: 'admin',
      tenantId: dealerTenantId,
    });
  });

  afterAll(async () => {
    // Cleanup
    if (abookTenantId) await prisma.tenant.delete({ where: { id: abookTenantId } }).catch(() => {});
    if (dealerTenantId) await prisma.tenant.delete({ where: { id: dealerTenantId } }).catch(() => {});
    await app.close();
  });

  it('returns 403 DEALER_DISABLED for A_BOOK tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dealer/positions',
      headers: {
        authorization: `Bearer ${abookAdminToken}`,
        'x-tenant-id': abookTenantId,
      },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DEALER_DISABLED');
  });

  it('does NOT return 403 DEALER_DISABLED for B_BOOK_DEALER tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dealer/positions',
      headers: {
        authorization: `Bearer ${dealerAdminToken}`,
        'x-tenant-id': dealerTenantId,
      },
    });
    // Should NOT be 403 with DEALER_DISABLED. Could be 200 (success) or another
    // legitimate error (e.g. 401 if auth not satisfied), but never DEALER_DISABLED.
    if (res.statusCode === 403) {
      const body = JSON.parse(res.body);
      expect(body.code).not.toBe('DEALER_DISABLED');
    } else {
      // 200 or 401 — both acceptable: the dealer-mode gate let us through
      expect([200, 401]).toContain(res.statusCode);
    }
  });
});
