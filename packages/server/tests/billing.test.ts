import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Stripe from 'stripe';
import { prisma } from '../src/shared/database/prisma';

/**
 * Phase 2.2 — Stripe billing. Postgres-only, no network: webhooks are signed
 * locally with the SDK's test helper, and the checkout/portal calls use an
 * injected fake client.
 */
const WEBHOOK_SECRET = 'whsec_test_' + 'x'.repeat(24);

function signed(payload: object): { body: string; sig: string } {
  const body = JSON.stringify(payload);
  const sig = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
  return { body, sig };
}

describe('Phase 2.2 — Stripe billing', () => {
  let app: FastifyInstance;
  let tenantId: string;
  let planId: string;
  let adminToken: string;
  const stamp = Date.now();
  const stripeSubId = `sub_test_${stamp}`;
  const stripeCustomerId = `cus_test_${stamp}`;
  let enforce: typeof import('../src/modules/billing/routes').enforceBillingGrace;
  let setFake: typeof import('../src/modules/billing/stripe-client').setStripeClientForTests;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.BILLING_GRACE_DAYS = '7';
    delete process.env.STRIPE_SECRET_KEY;
    app = Fastify({ logger: false });
    await app.register(jwt, { secret: 'test-billing' });
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
    const mod = await import('../src/modules/billing/routes');
    const client = await import('../src/modules/billing/stripe-client');
    enforce = mod.enforceBillingGrace; setFake = client.setStripeClientForTests;
    await app.register(mod.billingRoutes);

    const t = await prisma.tenant.create({ data: { name: 'Billed', domain: `bill-${stamp}.test`, slug: `bill${stamp}`, execution_mode: 'B_BOOK' } });
    tenantId = t.id;
    const plan = await prisma.plan.create({ data: { name: `Pro-${stamp}`, price_cents: 29900, max_users: 500, max_instruments: 80, stripe_price_id: 'price_test_123' } });
    planId = plan.id;
    adminToken = app.jwt.sign({ sub: 'admin-bill', email: 'admin@bill.test', role: 'admin', tenantId });
  });

  afterAll(async () => {
    setFake(null);
    await prisma.invoice.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.subscription.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.emailLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
    await app.close();
  });

  const webhook = (payload: object, sigOverride?: string) => {
    const { body, sig } = signed(payload);
    return app.inject({ method: 'POST', url: '/api/v1/billing/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': sigOverride ?? sig }, payload: body });
  };
  const admin = (path: string, method = 'GET', payload?: unknown) => app.inject({ method: method as 'GET', url: path, headers: { 'x-tenant-id': tenantId, authorization: `Bearer ${adminToken}` }, payload });

  it('checkout is 503 when Stripe is not configured; GET /admin/billing still works', async () => {
    const c = await admin('/api/v1/admin/billing/checkout', 'POST', { plan_id: planId });
    expect(c.statusCode).toBe(503);
    const g = await admin('/api/v1/admin/billing');
    expect(g.statusCode).toBe(200);
    expect(g.json().data.billing_enabled).toBe(false);
    expect(g.json().data.subscription).toBeNull();
    expect(g.json().data.plans.find((p: { id: string }) => p.id === planId).purchasable).toBe(true);
  });

  it('webhook rejects a bad signature', async () => {
    const r = await webhook({ id: 'evt_bad', type: 'invoice.paid', data: { object: {} } }, 't=1,v1=deadbeef');
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('BAD_SIGNATURE');
  });

  it('checkout.session.completed starts an ACTIVE subscription with Stripe ids', async () => {
    const r = await webhook({ id: `evt_cs_${stamp}`, type: 'checkout.session.completed', data: { object: { id: 'cs_1', subscription: stripeSubId, customer: stripeCustomerId, metadata: { tenant_id: tenantId, plan_id: planId } } } });
    expect(r.statusCode).toBe(200);
    expect(r.json().outcome).toBe('subscription started');
    const sub = await prisma.subscription.findFirst({ where: { tenant_id: tenantId, status: 'ACTIVE' } });
    expect(sub!.stripe_subscription_id).toBe(stripeSubId);
    expect(sub!.stripe_customer_id).toBe(stripeCustomerId);
    // replay is a no-op
    const again = await webhook({ id: `evt_cs_${stamp}`, type: 'checkout.session.completed', data: { object: { id: 'cs_1', subscription: stripeSubId, customer: stripeCustomerId, metadata: { tenant_id: tenantId, plan_id: planId } } } });
    expect(again.json().duplicate).toBe(true);
    expect(await prisma.subscription.count({ where: { tenant_id: tenantId, status: 'ACTIVE' } })).toBe(1);
  });

  it('invoice.paid records a PAID invoice; payment_failed marks PAST_DUE; grace suspends; paying reactivates', async () => {
    const now = Math.floor(Date.now() / 1000);
    const paid = await webhook({ id: `evt_inv1_${stamp}`, type: 'invoice.paid', data: { object: { id: `in_1_${stamp}`, subscription: stripeSubId, amount_due: 29900, period_start: now, period_end: now + 2592000, created: now, hosted_invoice_url: 'https://invoice.stripe.com/x' } } });
    expect(paid.json().outcome).toBe('invoice paid');
    const inv = await prisma.invoice.findFirst({ where: { stripe_invoice_id: `in_1_${stamp}` } });
    expect(inv!.status).toBe('PAID');
    expect(inv!.amount_cents).toBe(29900);

    const failed = await webhook({ id: `evt_inv2_${stamp}`, type: 'invoice.payment_failed', data: { object: { id: `in_2_${stamp}`, subscription: stripeSubId, amount_due: 29900, period_start: now, period_end: now + 2592000, created: now } } });
    expect(failed.json().outcome).toBe('payment failed');
    let sub = await prisma.subscription.findFirst({ where: { stripe_subscription_id: stripeSubId } });
    expect(sub!.status).toBe('PAST_DUE');
    expect(sub!.past_due_since).not.toBeNull();

    // Within grace: nothing happens
    expect(await enforce()).not.toContain(tenantId);
    // Past grace: tenant suspended + audited
    await prisma.subscription.update({ where: { id: sub!.id }, data: { past_due_since: new Date(Date.now() - 8 * 86400000) } });
    expect(await enforce()).toContain(tenantId);
    expect((await prisma.tenant.findUnique({ where: { id: tenantId } }))!.is_active).toBe(false);
    expect(await prisma.auditLog.findFirst({ where: { tenant_id: tenantId, action: 'TENANT_SUSPENDED_BILLING' } })).not.toBeNull();

    // Paying the overdue invoice reactivates
    const paid2 = await webhook({ id: `evt_inv3_${stamp}`, type: 'invoice.paid', data: { object: { id: `in_2_${stamp}`, subscription: stripeSubId, amount_due: 29900, period_start: now, period_end: now + 2592000, created: now } } });
    expect(paid2.json().outcome).toBe('invoice paid');
    sub = await prisma.subscription.findFirst({ where: { stripe_subscription_id: stripeSubId } });
    expect(sub!.status).toBe('ACTIVE');
    expect(sub!.past_due_since).toBeNull();
    expect((await prisma.tenant.findUnique({ where: { id: tenantId } }))!.is_active).toBe(true);
    expect((await prisma.invoice.findFirst({ where: { stripe_invoice_id: `in_2_${stamp}` } }))!.status).toBe('PAID');
  });

  it('checkout and portal use the injected client when billing is configured', async () => {
    const calls: Record<string, unknown>[] = [];
    const fake = {
      checkout: { sessions: { create: async (p: Record<string, unknown>) => { calls.push(p); return { id: 'cs_fake', url: 'https://checkout.stripe.com/fake' }; } } },
      billingPortal: { sessions: { create: async (p: Record<string, unknown>) => { calls.push(p); return { url: 'https://billing.stripe.com/fake' }; } } },
    } as unknown as Stripe;
    setFake(fake);
    try {
      const c = await admin('/api/v1/admin/billing/checkout', 'POST', { plan_id: planId });
      expect(c.statusCode).toBe(200);
      expect(c.json().data.url).toBe('https://checkout.stripe.com/fake');
      expect((calls[0].metadata as Record<string, string>).tenant_id).toBe(tenantId);
      expect(calls[0].customer).toBe(stripeCustomerId); // reuses the known customer
      const p = await admin('/api/v1/admin/billing/portal', 'POST', {});
      expect(p.statusCode).toBe(200);
      expect(p.json().data.url).toBe('https://billing.stripe.com/fake');
      const g = await admin('/api/v1/admin/billing');
      expect(g.json().data.billing_enabled).toBe(true);
      expect(g.json().data.subscription.managed_by_stripe).toBe(true);
    } finally {
      setFake(null);
    }
  });

  it('customer.subscription.deleted cancels the subscription', async () => {
    const r = await webhook({ id: `evt_del_${stamp}`, type: 'customer.subscription.deleted', data: { object: { id: stripeSubId } } });
    expect(r.json().outcome).toBe('subscription cancelled');
    const sub = await prisma.subscription.findFirst({ where: { stripe_subscription_id: stripeSubId } });
    expect(sub!.status).toBe('CANCELLED');
  });
});
