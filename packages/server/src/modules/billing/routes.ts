/**
 * Phase 2.2 — Plan billing through Stripe.
 *
 *   Broker admin
 *     GET  /api/v1/admin/billing              plan, subscription state, invoices, whether Stripe is on
 *     POST /api/v1/admin/billing/checkout     { plan_id } → Stripe Checkout URL (subscription mode)
 *     POST /api/v1/admin/billing/portal       → Stripe customer portal URL (cards, cancel)
 *   Stripe
 *     POST /api/v1/billing/webhook            raw body + Stripe-Signature; idempotent per event id
 *
 * Lifecycle:
 *   checkout.session.completed  → subscription ACTIVE (stripe ids stored), previous one CANCELLED
 *   invoice.paid                → Invoice row PAID (created if unknown), subscription ACTIVE, tenant re-enabled
 *   invoice.payment_failed      → Invoice OVERDUE, subscription PAST_DUE (past_due_since set once)
 *   customer.subscription.deleted → subscription CANCELLED
 *
 * Suspension: enforceBillingGrace() (called hourly by the position monitor)
 * deactivates tenants whose subscription has been PAST_DUE for more than
 * BILLING_GRACE_DAYS, audited as TENANT_SUSPENDED_BILLING. Paying reactivates.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type Stripe from 'stripe';
import { prisma } from '../../shared/database/prisma';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAdmin } from '../../shared/middleware/auth';
import { audit } from '../../shared/audit';
import { logger } from '../../shared/utils/index';
import { config } from '../../config/index';
import { getStripe, isBillingConfigured, parseWebhook } from './stripe-client';
import { sendTenantEmail } from '../notifications/mailer';

const CheckoutSchema = z.object({ plan_id: z.string().uuid() });

async function webBaseUrl(tenantId: string): Promise<string> {
  if (process.env.WEB_BASE_URL) return process.env.WEB_BASE_URL.replace(/\/$/, '');
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { domain: true } });
  return t?.domain ? `https://${t.domain}` : '';
}

async function currentSubscription(tenantId: string) {
  return prisma.subscription.findFirst({
    where: { tenant_id: tenantId, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
    orderBy: { created_at: 'desc' },
    include: { plan: true },
  });
}

/** Suspend tenants past the grace period; reactivation happens on invoice.paid. */
export async function enforceBillingGrace(now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - config.BILLING_GRACE_DAYS * 86400000);
  // tenant-scope: platform-wide billing job, iterates every tenant on purpose
  const overdue = await prisma.subscription.findMany({
    where: { status: 'PAST_DUE', past_due_since: { lt: cutoff } },
    include: { plan: { select: { name: true } } },
  });
  const suspended: string[] = [];
  for (const sub of overdue) {
    const res = await prisma.tenant.updateMany({ where: { id: sub.tenant_id, is_active: true }, data: { is_active: false } });
    if (res.count === 0) continue;
    suspended.push(sub.tenant_id);
    await audit.log({ tenantId: sub.tenant_id, actorId: 'system', actorType: 'system', action: 'TENANT_SUSPENDED_BILLING', target: `tenant:${sub.tenant_id}`, details: { plan: sub.plan.name, past_due_since: sub.past_due_since } });
    logger.warn({ tenantId: sub.tenant_id }, '[billing] tenant suspended: subscription past due beyond grace');
    const admins = await prisma.tenantAdmin.findMany({ where: { tenant_id: sub.tenant_id, role: 'admin', is_active: true }, select: { email: true, name: true } });
    for (const a of admins) {
      await sendTenantEmail(sub.tenant_id, { to: a.email, toName: a.name, subject: 'Your platform subscription is suspended',
        bodyHtml: `<h2>Subscription suspended</h2><p>Payment for the ${sub.plan.name} plan has been failing for more than ${config.BILLING_GRACE_DAYS} days. Your platform is paused for clients and staff until the invoice is settled. Update the payment method from the back-office billing page.</p>` });
    }
  }
  return suspended;
}

/**
 * The subscription id of an invoice. Stripe moved it from `invoice.subscription`
 * (API versions before 2025-03) to `invoice.parent.subscription_details.subscription`;
 * webhooks from either shape are accepted.
 */
function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const asRef = (v: unknown): string | null => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null);
  const legacy = asRef((inv as unknown as { subscription?: unknown }).subscription);
  if (legacy) return legacy;
  const parent = (inv as unknown as { parent?: { subscription_details?: { subscription?: unknown } | null } | null }).parent;
  return asRef(parent?.subscription_details?.subscription);
}

async function handleEvent(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const tenantId = s.metadata?.tenant_id; const planId = s.metadata?.plan_id;
      if (!tenantId || !planId) return 'ignored: no metadata';
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return 'ignored: unknown plan';
      await prisma.$transaction(async (tx) => {
        await tx.subscription.updateMany({ where: { tenant_id: tenantId, status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } }, data: { status: 'CANCELLED', ends_at: new Date() } });
        await tx.subscription.create({
          data: {
            tenant_id: tenantId, plan_id: plan.id, status: 'ACTIVE',
            stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? null,
            stripe_customer_id: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
          },
        });
        await tx.tenant.updateMany({ where: { id: tenantId }, data: { is_active: true } });
      });
      await audit.log({ tenantId, actorId: 'stripe', actorType: 'system', action: 'SUBSCRIPTION_STARTED', target: `tenant:${tenantId}`, details: { plan: plan.name, event: event.id } });
      return 'subscription started';
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const stripeSubId = invoiceSubscriptionId(inv);
      // tenant-scope: Stripe webhook — the tenant is derived from the globally unique Stripe subscription id
      const sub = stripeSubId ? await prisma.subscription.findFirst({ where: { stripe_subscription_id: stripeSubId } }) : null;
      if (!sub) return 'ignored: unknown subscription';
      const paid = event.type === 'invoice.paid';
      const periodStart = new Date((inv.period_start ?? inv.created) * 1000);
      const periodEnd = new Date((inv.period_end ?? inv.created) * 1000);
      await prisma.$transaction(async (tx) => {
        // tenant-scope: lookup by the globally unique Stripe invoice id; the row is written with sub.tenant_id
        const existing = await tx.invoice.findFirst({ where: { stripe_invoice_id: inv.id } });
        const data = {
          subscription_id: sub.id, tenant_id: sub.tenant_id, amount_cents: inv.amount_due ?? 0,
          status: paid ? 'PAID' : 'OVERDUE', period_start: periodStart, period_end: periodEnd,
          paid_at: paid ? new Date() : null, stripe_invoice_id: inv.id, hosted_invoice_url: inv.hosted_invoice_url ?? '',
        };
        if (existing) await tx.invoice.update({ where: { id: existing.id }, data });
        else await tx.invoice.create({ data });
        if (paid) {
          await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', past_due_since: null } });
          await tx.tenant.updateMany({ where: { id: sub.tenant_id, is_active: false }, data: { is_active: true } });
        } else {
          await tx.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE', past_due_since: sub.past_due_since ?? new Date() } });
        }
      });
      await audit.log({ tenantId: sub.tenant_id, actorId: 'stripe', actorType: 'system', action: paid ? 'INVOICE_PAID' : 'INVOICE_PAYMENT_FAILED', target: `subscription:${sub.id}`, details: { stripe_invoice_id: inv.id, amount_cents: inv.amount_due, event: event.id } });
      return paid ? 'invoice paid' : 'payment failed';
    }
    case 'customer.subscription.deleted': {
      const s = event.data.object as Stripe.Subscription;
      // tenant-scope: Stripe webhook — the tenant is derived from the globally unique Stripe subscription id
      const sub = await prisma.subscription.findFirst({ where: { stripe_subscription_id: s.id } });
      if (!sub) return 'ignored: unknown subscription';
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', ends_at: new Date() } });
      await audit.log({ tenantId: sub.tenant_id, actorId: 'stripe', actorType: 'system', action: 'SUBSCRIPTION_CANCELLED', target: `subscription:${sub.id}`, details: { event: event.id } });
      return 'subscription cancelled';
    }
    default:
      return `ignored: ${event.type}`;
  }
}

export async function billingRoutes(fastify: FastifyInstance) {
  // ── Broker admin ──────────────────────────────────────────────────────────
  fastify.get('/api/v1/admin/billing', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const sub = await currentSubscription(tenantId);
    const invoices = await prisma.invoice.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'desc' }, take: 12 });
    const plans = await prisma.plan.findMany({ where: { is_active: true }, orderBy: { price_cents: 'asc' }, select: { id: true, name: true, description: true, price_cents: true, max_users: true, max_instruments: true, stripe_price_id: true } });
    return reply.send({
      data: {
        billing_enabled: isBillingConfigured(),
        grace_days: config.BILLING_GRACE_DAYS,
        subscription: sub ? { id: sub.id, status: sub.status, plan: { id: sub.plan.id, name: sub.plan.name, price_cents: sub.plan.price_cents }, trial_ends_at: sub.trial_ends_at, past_due_since: sub.past_due_since, managed_by_stripe: Boolean(sub.stripe_subscription_id) } : null,
        invoices,
        plans: plans.map((p) => ({ ...p, purchasable: Boolean(p.stripe_price_id) })),
      },
    });
  });

  fastify.post('/api/v1/admin/billing/checkout', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) return reply.status(503).send({ error: 'Online billing is not enabled on this platform', code: 'BILLING_NOT_CONFIGURED' });
    const parsed = CheckoutSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const tenantId = request.tenantId!;
    const plan = await prisma.plan.findUnique({ where: { id: parsed.data.plan_id } });
    if (!plan || !plan.is_active) return reply.status(404).send({ error: 'Plan not found', code: 'PLAN_NOT_FOUND' });
    if (!plan.stripe_price_id) return reply.status(400).send({ error: 'This plan is not purchasable online', code: 'PLAN_NOT_PURCHASABLE' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const existing = await prisma.subscription.findFirst({ where: { tenant_id: tenantId, stripe_customer_id: { not: null } }, orderBy: { created_at: 'desc' } });
    const base = await webBaseUrl(tenantId);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer: existing?.stripe_customer_id ?? undefined,
      customer_email: existing?.stripe_customer_id ? undefined : request.userData!.email,
      client_reference_id: tenantId,
      metadata: { tenant_id: tenantId, plan_id: plan.id, tenant_slug: tenant?.slug ?? '' },
      subscription_data: { metadata: { tenant_id: tenantId, plan_id: plan.id } },
      success_url: `${base}/admin?billing=success`,
      cancel_url: `${base}/admin?billing=cancelled`,
    });
    await audit.log({ tenantId, actorId: request.userData!.sub, actorType: 'admin', action: 'BILLING_CHECKOUT_STARTED', target: `plan:${plan.id}`, details: { session: session.id }, ip: request.ip });
    return reply.send({ data: { url: session.url, session_id: session.id } });
  });

  fastify.post('/api/v1/admin/billing/portal', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) return reply.status(503).send({ error: 'Online billing is not enabled on this platform', code: 'BILLING_NOT_CONFIGURED' });
    const tenantId = request.tenantId!;
    const sub = await prisma.subscription.findFirst({ where: { tenant_id: tenantId, stripe_customer_id: { not: null } }, orderBy: { created_at: 'desc' } });
    if (!sub?.stripe_customer_id) return reply.status(404).send({ error: 'No online subscription for this broker', code: 'NO_STRIPE_CUSTOMER' });
    const base = await webBaseUrl(tenantId);
    const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${base}/admin` });
    return reply.send({ data: { url: portal.url } });
  });

  // ── Stripe webhook (raw body; encapsulated parser) ───────────────────────
  await fastify.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    scope.post('/api/v1/billing/webhook', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
      const secret = config.STRIPE_WEBHOOK_SECRET;
      if (!secret) return reply.status(503).send({ error: 'Webhook secret not configured', code: 'BILLING_NOT_CONFIGURED' });
      const sig = request.headers['stripe-signature'];
      if (typeof sig !== 'string') return reply.status(400).send({ error: 'Missing Stripe-Signature', code: 'BAD_SIGNATURE' });
      let event: Stripe.Event;
      try {
        event = parseWebhook(request.body as Buffer, sig, secret);
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[billing] webhook signature rejected');
        return reply.status(400).send({ error: 'Invalid signature', code: 'BAD_SIGNATURE' });
      }
      // Idempotency: Stripe retries; a processed event id is a no-op.
      // tenant-scope: event ids are global; the tenant is only known after the event is parsed
      const seen = await prisma.auditLog.findFirst({ where: { actor_id: 'stripe', details: { contains: `"event":"${event.id}"` } }, select: { id: true } });
      if (seen) return reply.send({ received: true, duplicate: true });
      const outcome = await handleEvent(event);
      logger.info({ type: event.type, id: event.id, outcome }, '[billing] webhook');
      return reply.send({ received: true, outcome });
    });
  });
}
