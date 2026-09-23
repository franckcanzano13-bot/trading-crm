import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { ALL_INSTRUMENTS } from '@tradexlabel/shared';
import { prisma } from '../src/shared/database/prisma';

/**
 * Phase 2.1 — Self-serve tenant creation is one atomic unit: tenant, admin,
 * broker config, instruments and (optionally) the plan subscription either
 * all exist or none do. Postgres-only.
 */
describe('Phase 2.1 — atomic tenant creation', () => {
  let app: FastifyInstance;
  let superToken: string;
  let planId: string;
  const stamp = Date.now();
  const created: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-tenant-create' });
    await app.register((await import('../src/modules/tenants/routes')).tenantRoutes);
    superToken = app.jwt.sign({ sub: 'super-tc', email: 'root@tc.test', role: 'superadmin' });
    const plan = await prisma.plan.create({ data: { name: `Onboard-${stamp}`, price_cents: 9900, max_users: 50, max_instruments: 30 } });
    planId = plan.id;
  });

  afterAll(async () => {
    for (const id of created) {
      await prisma.subscription.deleteMany({ where: { tenant_id: id } }).catch(() => {});
      await prisma.instrument.deleteMany({ where: { tenant_id: id } }).catch(() => {});
      await prisma.brokerConfig.deleteMany({ where: { tenant_id: id } }).catch(() => {});
      await prisma.tenantAdmin.deleteMany({ where: { tenant_id: id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { target: `tenant:${id}` } }).catch(() => {});
      await prisma.tenant.delete({ where: { id } }).catch(() => {});
    }
    await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
    await app.close();
  });

  const create = (body: Record<string, unknown>) => app.inject({
    method: 'POST', url: '/api/v1/super/tenants', headers: { authorization: `Bearer ${superToken}` }, payload: body,
  });
  const base = () => ({ name: 'Acme Markets', domain: `acme-${stamp}.test`, slug: `acme${stamp}`, execution_mode: 'B_BOOK', admin_email: `admin-${stamp}@acme.test`, admin_password: 'Secret123!', admin_name: 'Acme Admin' });

  it('creates tenant + admin + broker config + instruments + trial subscription in one go', async () => {
    const res = await create({ ...base(), plan_id: planId, trial: true });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    created.push(d.id);
    expect(d.admin.email).toBe(`admin-${stamp}@acme.test`);
    expect(d.instruments).toBe(ALL_INSTRUMENTS.length);
    expect(d.subscription.status).toBe('TRIAL');
    expect(d.subscription.plan_name).toBe(`Onboard-${stamp}`);

    expect(await prisma.tenantAdmin.count({ where: { tenant_id: d.id } })).toBe(1);
    const cfg = await prisma.brokerConfig.findUnique({ where: { tenant_id: d.id } });
    expect(cfg!.company_name).toBe('Acme Markets');
    expect(await prisma.instrument.count({ where: { tenant_id: d.id, is_active: true } })).toBe(ALL_INSTRUMENTS.length);
    const sub = await prisma.subscription.findFirst({ where: { tenant_id: d.id } });
    expect(sub!.status).toBe('TRIAL');
    expect(sub!.trial_ends_at).not.toBeNull();
    const a = await prisma.auditLog.findFirst({ where: { action: 'CREATE_TENANT', target: `tenant:${d.id}` } });
    expect(a).not.toBeNull();
  });

  it('duplicate slug/domain → 409, nothing created', async () => {
    const before = await prisma.tenant.count();
    const res = await create({ ...base(), admin_email: `other-${stamp}@acme.test` });
    expect(res.statusCode).toBe(409);
    expect(await prisma.tenant.count()).toBe(before);
  });

  it('unknown plan → 404 and no partial tenant left behind (atomic)', async () => {
    const slug = `ghost${stamp}`;
    const res = await create({ ...base(), slug, domain: `ghost-${stamp}.test`, admin_email: `ghost-${stamp}@acme.test`, plan_id: '00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('PLAN_NOT_FOUND');
    expect(await prisma.tenant.findFirst({ where: { slug } })).toBeNull();
    expect(await prisma.tenantAdmin.findFirst({ where: { email: `ghost-${stamp}@acme.test` } })).toBeNull();
  });

  it('without a plan: no subscription, tenant unlimited', async () => {
    const res = await create({ ...base(), slug: `free${stamp}`, domain: `free-${stamp}.test`, admin_email: `free-${stamp}@acme.test` });
    expect(res.statusCode).toBe(201);
    created.push(res.json().data.id);
    expect(res.json().data.subscription).toBeNull();
  });
});
