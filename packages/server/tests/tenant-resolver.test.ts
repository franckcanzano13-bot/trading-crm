import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { prisma } from '../src/shared/database/prisma';
import { tenantResolver } from '../src/shared/middleware/tenant-resolver';

/**
 * Phase 1.4 — Tenant resolution by full domain (white-label), with the
 * historical slug-subdomain fallback and the X-Tenant-ID header. Postgres-only.
 */
describe('Phase 1.4 — tenant resolution by domain', () => {
  let app: FastifyInstance;
  let tenantId: string;
  const stamp = Date.now();
  const domain = `trade-${stamp}.example.com`;
  const slug = `slug${stamp}`;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    app.get('/probe', { preHandler: [tenantResolver] }, async (req) => ({ tenantId: req.tenantId, slug: req.tenantSlug }));
    await app.register((await import('../src/modules/tenants/routes')).tenantRoutes);
    const t = await prisma.tenant.create({ data: { name: 'Domain T', domain, slug, execution_mode: 'B_BOOK' } });
    tenantId = t.id;
    await prisma.brokerConfig.create({ data: { tenant_id: tenantId, company_name: 'Domain Broker', primary_color: '#123456' } });
  });

  afterAll(async () => {
    await prisma.brokerConfig.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await app.close();
  });

  const probe = (headers: Record<string, string>) => app.inject({ method: 'GET', url: '/probe', headers });

  it('X-Tenant-ID header still wins', async () => {
    const r = await probe({ 'x-tenant-id': tenantId, host: 'whatever.test' });
    expect(r.statusCode).toBe(200);
    expect(r.json().tenantId).toBe(tenantId);
  });

  it('exact domain in Host resolves the tenant (case-insensitive, port ignored)', async () => {
    const r = await probe({ host: `${domain.toUpperCase()}:443` });
    expect(r.statusCode).toBe(200);
    expect(r.json().tenantId).toBe(tenantId);
  });

  it('api.<domain> and www.<domain> resolve too', async () => {
    expect((await probe({ host: `api.${domain}` })).json().tenantId).toBe(tenantId);
    expect((await probe({ host: `www.${domain}` })).json().tenantId).toBe(tenantId);
  });

  it('X-Forwarded-Host (reverse proxy) takes precedence over Host', async () => {
    const r = await probe({ host: 'internal-lb:5500', 'x-forwarded-host': domain });
    expect(r.json().tenantId).toBe(tenantId);
  });

  it('slug subdomain fallback keeps working', async () => {
    const r = await probe({ host: `${slug}.tradexlabel.com` });
    expect(r.statusCode).toBe(200);
    expect(r.json().slug).toBe(slug);
  });

  it('unknown host → 400 TENANT_REQUIRED', async () => {
    const r = await probe({ host: `nobody-${stamp}.example.org` });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('TENANT_REQUIRED');
  });

  it('inactive tenant is not resolved by domain', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { is_active: false } });
    try {
      expect((await probe({ host: domain })).statusCode).toBe(400);
    } finally {
      await prisma.tenant.update({ where: { id: tenantId }, data: { is_active: true } });
    }
  });

  it('GET /api/v1/tenant/resolve?host= returns public identity + branding', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/v1/tenant/resolve?host=${encodeURIComponent(`api.${domain}`)}` });
    expect(r.statusCode).toBe(200);
    const d = r.json().data;
    expect(d.id).toBe(tenantId);
    expect(d.slug).toBe(slug);
    expect(d.branding.company_name).toBe('Domain Broker');
    expect(d.branding.primary_color).toBe('#123456');
    expect(Object.keys(d)).not.toContain('config');
    const miss = await app.inject({ method: 'GET', url: '/api/v1/tenant/resolve?host=unknown.example.org' });
    expect(miss.statusCode).toBe(404);
  });
});
