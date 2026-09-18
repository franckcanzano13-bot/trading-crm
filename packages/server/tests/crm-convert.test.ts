import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/shared/database/prisma';

/**
 * Sprint 8.3 — Lead → client conversion uses the typed TenantQuery API.
 *
 * Before this sprint, POST /crm/leads/:id/convert cast request.tenantQuery to
 * a loosely-typed shape and called createAccount with an object, while the
 * real method took (userId, leverage). At runtime Prisma received
 * `user_id: { user_id, currency, balance, equity }`, so the conversion path
 * could never have produced a funded account. This test pins the contract:
 * the user carries the lead's phone/country/lead_id, and the account is
 * created with the requested initial deposit.
 *
 * Postgres-only (needs buildServer + real tables).
 */
describe('Sprint 8.3 — CRM lead conversion contract', () => {
  let fastify: any;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    const mod = await import('../src/index');
    fastify = await mod.buildServer();
    const tenant = await prisma.tenant.create({
      data: { name: 'Convert T', domain: `cv-${Date.now()}.test`, slug: `cv-${Date.now()}`, execution_mode: 'B_BOOK' },
    });
    tenantId = tenant.id;
    token = fastify.jwt.sign({ sub: 'admin-cv', email: 'admin@cv.test', role: 'admin', tenantId });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.account.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.lead.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await fastify.close();
  });

  it('creates a user carrying lead data and an account funded with the deposit', async () => {
    const lead = await prisma.lead.create({
      data: {
        tenant_id: tenantId, email: `lead-${Date.now()}@cv.test`, first_name: 'Ada', last_name: 'Lovelace',
        phone: '+33600000000', country: 'FR',
      },
    });

    const res = await fastify.inject({
      method: 'POST',
      url: `/api/v1/crm/leads/${lead.id}/convert`,
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
      payload: { password: 'Secret123!', deposit_amount: 250 },
    });
    if (res.statusCode !== 200) console.error('convert failed:', res.body);
    expect(res.statusCode).toBe(200);

    const user = await prisma.user.findFirst({ where: { tenant_id: tenantId, email: lead.email } });
    expect(user).not.toBeNull();
    expect(user!.phone).toBe('+33600000000');
    expect(user!.country).toBe('FR');
    expect(user!.lead_id).toBe(lead.id);
    expect(user!.status).toBe('ACTIVE');

    const account = await prisma.account.findFirst({ where: { tenant_id: tenantId, user_id: user!.id } });
    expect(account).not.toBeNull();
    expect(account!.currency).toBe('USD');
    expect(account!.balance).toBe(BigInt(25000));
    expect(account!.equity).toBe(BigInt(25000));

    const tx = await prisma.transaction.findFirst({ where: { tenant_id: tenantId, account_id: account!.id } });
    expect(tx?.type).toBe('DEPOSIT');
    expect(tx?.amount).toBe(BigInt(25000));

    const updatedLead = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(updatedLead!.status).toBe('CONVERTED');
    expect(updatedLead!.converted_user_id).toBe(user!.id);
    expect(updatedLead!.ftd_amount).toBe(BigInt(25000));
  });

  it('refuses to convert the same lead twice', async () => {
    const lead = await prisma.lead.create({
      data: { tenant_id: tenantId, email: `twice-${Date.now()}@cv.test`, first_name: 'B', last_name: 'C' },
    });
    const headers = { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
    const first = await fastify.inject({ method: 'POST', url: `/api/v1/crm/leads/${lead.id}/convert`, headers, payload: {} });
    expect(first.statusCode).toBe(200);
    const second = await fastify.inject({ method: 'POST', url: `/api/v1/crm/leads/${lead.id}/convert`, headers, payload: {} });
    expect(second.statusCode).toBe(400);
    expect(second.json().code).toBe('ALREADY_CONVERTED');
  });
});
