import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma, createTenantSchema } from '../../shared/database/prisma';
import { requireSuperAdmin } from '../../shared/middleware/auth';
import { resolveTenantByHost } from '../../shared/middleware/tenant-resolver';
import { BCRYPT_SALT_ROUNDS, ALL_INSTRUMENTS } from '@tradexlabel/shared';
import { TenantQuery } from '../../shared/database/tenant-queries';
import { logger, isValidLei } from '../../shared/utils/index';

const CreateTenantSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/),
  execution_mode: z.enum(['A_BOOK', 'B_BOOK', 'B_BOOK_DEALER']).default('B_BOOK'),
  admin_email: z.string().email(),
  admin_password: z.string().min(8),
  admin_name: z.string().min(1),
  config: z.any().optional(),
});

export async function tenantRoutes(fastify: FastifyInstance) {
  // Phase 1.4 — Public: which broker is served on this host? Lets the web
  // app on a white-label domain skip the "Tenant ID" field. Returns only
  // what a login page needs (identity + branding), never tenant.config.
  fastify.get<{ Querystring: { host?: string } }>('/api/v1/tenant/resolve', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const forwarded = request.headers['x-forwarded-host'];
    const host = request.query.host || (Array.isArray(forwarded) ? forwarded[0] : forwarded) || request.headers.host || '';
    const tenant = await resolveTenantByHost(host);
    if (!tenant) return reply.status(404).send({ error: 'No broker on this domain', code: 'TENANT_NOT_FOUND' });
    const branding = await prisma.brokerConfig.findUnique({
      where: { tenant_id: tenant.id },
      select: { company_name: true, logo_url: true, primary_color: true },
    });
    return reply.send({ data: { id: tenant.id, name: tenant.name, slug: tenant.slug, branding } });
  });

  // List tenants (superadmin)
  fastify.get('/api/v1/super/tenants', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const tenants = await prisma.tenant.findMany({
      include: { admins: { select: { id: true, email: true, name: true, role: true } } },
      orderBy: { created_at: 'desc' },
    });
    return reply.send({ data: tenants });
  });

  // Create tenant (superadmin)
  fastify.post('/api/v1/super/tenants', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const parsed = CreateTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const { slug, name, domain, execution_mode, admin_email, admin_password, admin_name, config } = parsed.data;

    // Check unique
    const existing = await prisma.tenant.findFirst({ where: { OR: [{ slug }, { domain }] } });
    if (existing) {
      return reply.status(409).send({ error: 'Tenant slug or domain already exists', code: 'TENANT_EXISTS' });
    }

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        name,
        domain,
        slug,
        execution_mode,
        config: JSON.stringify(config || {
          branding: { logo_url: '', primary_color: '#2563eb', company_name: name },
          trading: {
            default_leverage: 100,
            max_leverage: 500,
            margin_call_level: 100,
            stop_out_level: 50,
            max_positions: 100,
            max_volume_per_trade: 50,
          },
        }),
      },
    });

    // Create tenant admin
    const passwordHash = await bcrypt.hash(admin_password, BCRYPT_SALT_ROUNDS);
    await prisma.tenantAdmin.create({
      data: {
        tenant_id: tenant.id,
        email: admin_email,
        password_hash: passwordHash,
        name: admin_name,
      },
    });

    // Create schema and tables
    await createTenantSchema(slug);

    // Seed instruments
    const tq = new TenantQuery(tenant.id);
    for (const inst of ALL_INSTRUMENTS) {
      await tq.upsertInstrument({
        symbol: inst.symbol,
        display_name: inst.display,
        type: inst.type,
        pip_size: inst.pip_size,
        lot_size: inst.lot_size,
        base_spread: inst.base_spread,
      });
    }

    logger.info({ tenantId: tenant.id, slug }, 'Tenant created');
    await auditLog(request, 'CREATE_TENANT', `tenant:${tenant.id}`, { name, slug, execution_mode });

    return reply.status(201).send({ data: tenant });
  });

  // Update tenant (superadmin)
  fastify.patch<{ Params: { id: string } }>('/api/v1/super/tenants/:id', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const body = (request.body ?? {}) as {
      name?: string;
      execution_mode?: string;
      config?: string;
      is_active?: boolean;
      lei?: string;
    };

    // Sprint 6.6: LEI must be ISO 17442-valid (or empty to clear).
    if (body.lei !== undefined && !isValidLei(body.lei)) {
      return reply.status(400).send({
        error: 'LEI must be 20-char ISO 17442 with valid mod-97 checksum, or empty',
        code: 'INVALID_LEI',
      });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        name: body.name,
        execution_mode: body.execution_mode,
        config: body.config,
        is_active: body.is_active,
        ...(body.lei !== undefined && { lei: body.lei }),
      },
    });

    await auditLog(request, 'UPDATE_TENANT', `tenant:${id}`, { changes: body });
    return reply.send({ data: tenant });
  });

  // Sprint 9.3 — Lost-device 2FA recovery (closes the ADR-005 follow-up).
  // A superadmin clears an admin's TOTP secret + backup codes so they can
  // enrol again from a new device. Scoped by tenant id in the URL so a typo
  // in adminId cannot hit another broker's staff. Audited as 2FA_RESET with
  // actor_type superadmin; the admin's next login will NOT ask for a code
  // until they re-run /admin/2fa/setup + verify.
  fastify.post<{ Params: { id: string; adminId: string } }>('/api/v1/super/tenants/:id/admins/:adminId/2fa/reset', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const { id: tenantId, adminId } = request.params;
    const admin = await prisma.tenantAdmin.findFirst({ where: { id: adminId, tenant_id: tenantId } });
    if (!admin) {
      return reply.status(404).send({ error: 'Admin not found in this tenant', code: 'ADMIN_NOT_FOUND' });
    }
    const wasEnabled = admin.totp_enabled;
    await prisma.tenantAdmin.update({
      where: { id: admin.id },
      data: { totp_secret: '', totp_enabled: false, totp_backup_codes: '' },
    });
    await auditLog(request, '2FA_RESET', `tenant_admin:${admin.id}`, {
      tenant_id: tenantId, email: admin.email, was_enabled: wasEnabled,
    });
    logger.warn({ tenantId, adminId: admin.id, by: request.userData?.sub }, '[super] 2FA reset for tenant admin');
    return reply.send({ data: { admin_id: admin.id, email: admin.email, totp_enabled: false, was_enabled: wasEnabled } });
  });

  // Monitoring (superadmin)
  fastify.get('/api/v1/super/monitoring', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const tenants = await prisma.tenant.findMany({ where: { is_active: true } });
    const stats = {
      total_tenants: tenants.length,
      active_tenants: tenants.length,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version,
    };
    return reply.send({ data: stats });
  });

  // ─── Analytics per broker ───
  fastify.get('/api/v1/super/analytics', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const tenants = await prisma.tenant.findMany({ include: { admins: { select: { email: true } } } });
    const analytics = [];

    for (const tenant of tenants) {
      const [userCount, accountStats, tradeStats, openPositions, closedTrades] = await Promise.all([
        prisma.user.count({ where: { tenant_id: tenant.id } }),
        prisma.account.aggregate({ where: { tenant_id: tenant.id }, _sum: { balance: true, equity: true, margin_used: true }, _count: true }),
        prisma.trade.aggregate({ where: { tenant_id: tenant.id, status: 'CLOSED' }, _count: true, _sum: { pnl: true, commission: true } }),
        prisma.trade.count({ where: { tenant_id: tenant.id, status: 'OPEN' } }),
        prisma.trade.count({ where: { tenant_id: tenant.id, status: 'CLOSED' } }),
      ]);

      const subscription = await prisma.subscription.findFirst({
        where: { tenant_id: tenant.id, status: 'ACTIVE' },
        include: { plan: { select: { name: true, price_cents: true } } },
      });

      analytics.push({
        tenant_id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        execution_mode: tenant.execution_mode,
        is_active: tenant.is_active,
        admin_email: tenant.admins[0]?.email || '',
        users: userCount,
        accounts: accountStats._count,
        total_balance_cents: (accountStats._sum.balance ?? BigInt(0)).toString(),
        total_equity_cents: (accountStats._sum.equity ?? BigInt(0)).toString(),
        total_margin_used_cents: (accountStats._sum.margin_used ?? BigInt(0)).toString(),
        open_positions: openPositions,
        closed_trades: closedTrades,
        broker_pnl_cents: (tradeStats._sum.pnl ?? BigInt(0)).toString(),
        total_commissions_cents: (tradeStats._sum.commission ?? BigInt(0)).toString(),
        plan: subscription?.plan?.name || 'No Plan',
        plan_price_cents: subscription?.plan?.price_cents || 0,
        subscription_status: subscription?.status || 'NONE',
      });
    }

    return reply.send({ data: analytics });
  });

  // ─── Plans CRUD ───
  fastify.get('/api/v1/super/plans', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const plans = await prisma.plan.findMany({ orderBy: { price_cents: 'asc' } });
    return reply.send({ data: plans });
  });

  fastify.post('/api/v1/super/plans', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      name: string;
      description?: string;
      price_cents?: number;
      max_users?: number;
      max_instruments?: number;
      features?: Record<string, unknown>;
    };
    const plan = await prisma.plan.create({
      data: {
        name: body.name,
        description: body.description || '',
        price_cents: body.price_cents || 0,
        max_users: body.max_users || 100,
        max_instruments: body.max_instruments || 50,
        features: JSON.stringify(body.features || {}),
      },
    });
    await auditLog(request, 'CREATE_PLAN', `plan:${plan.id}`, { name: plan.name });
    return reply.status(201).send({ data: plan });
  });

  // ─── Subscriptions ───
  fastify.get('/api/v1/super/subscriptions', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const subs = await prisma.subscription.findMany({
      include: { plan: true, invoices: { orderBy: { created_at: 'desc' }, take: 3 } },
      orderBy: { created_at: 'desc' },
    });
    return reply.send({ data: subs });
  });

  fastify.post('/api/v1/super/subscriptions', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      tenant_id: string;
      plan_id: string;
      trial?: boolean;
    };
    const plan = await prisma.plan.findUnique({ where: { id: body.plan_id } });
    if (!plan) return reply.status(404).send({ error: 'Plan not found', code: 'PLAN_NOT_FOUND' });

    // Cancel existing active subscription
    await prisma.subscription.updateMany({
      where: { tenant_id: body.tenant_id, status: 'ACTIVE' },
      data: { status: 'CANCELLED', ends_at: new Date() },
    });

    const sub = await prisma.subscription.create({
      data: {
        tenant_id: body.tenant_id,
        plan_id: body.plan_id,
        status: body.trial ? 'TRIAL' : 'ACTIVE',
        trial_ends_at: body.trial ? new Date(Date.now() + 14 * 86400000) : null,
      },
    });

    // Create first invoice
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    await prisma.invoice.create({
      data: {
        subscription_id: sub.id,
        tenant_id: body.tenant_id,
        amount_cents: plan.price_cents,
        status: body.trial ? 'PENDING' : 'PENDING',
        period_start: now,
        period_end: nextMonth,
      },
    });

    await auditLog(request, 'CREATE_SUBSCRIPTION', `tenant:${body.tenant_id}`, { plan: plan.name });
    return reply.status(201).send({ data: sub });
  });

  // ─── Invoices ───
  fastify.get('/api/v1/super/invoices', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const invoices = await prisma.invoice.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return reply.send({ data: invoices });
  });

  fastify.patch<{ Params: { id: string } }>('/api/v1/super/invoices/:id/pay', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const invoice = await prisma.invoice.update({
      where: { id: request.params.id },
      data: { status: 'PAID', paid_at: new Date() },
    });
    await auditLog(request, 'MARK_INVOICE_PAID', `invoice:${invoice.id}`, { amount: invoice.amount_cents });
    return reply.send({ data: invoice });
  });

  // ─── Audit Logs ───
  fastify.get('/api/v1/super/audit-logs', {
    preHandler: [requireSuperAdmin],
  }, async (request, reply) => {
    const logs = await prisma.auditLog.findMany({
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return reply.send({ data: logs });
  });
}

// Audit log helper
async function auditLog(
  request: { userData?: { sub?: string }; ip?: string },
  action: string,
  target: string,
  details: Record<string, unknown> = {},
) {
  try {
    const actorId = request.userData?.sub || 'system';
    const ip = request.ip || '';
    await prisma.auditLog.create({
      data: {
        actor_id: actorId,
        actor_type: 'superadmin',
        action,
        target,
        details: JSON.stringify(details),
        ip_address: ip,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
  }
}
