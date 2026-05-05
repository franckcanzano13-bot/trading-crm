import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAdmin } from '../../shared/middleware/auth';
import crypto from 'crypto';

const logger = require('pino')({ name: 'crm' });

// ─── Validation Schemas ───

const CreateLeadSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional().default(''),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  country: z.string().optional().default(''),
  language: z.string().optional().default('en'),
  source: z.string().optional().default('DIRECT'),
  affiliate_id: z.string().uuid().optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  department: z.enum(['SELLER', 'RETENTION']).optional().default('SELLER'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VIP']).optional().default('MEDIUM'),
  utm_source: z.string().optional().default(''),
  utm_medium: z.string().optional().default(''),
  utm_campaign: z.string().optional().default(''),
  utm_content: z.string().optional().default(''),
  ip_address: z.string().optional().default(''),
  custom_fields: z.record(z.any()).optional().default({}),
});

const UpdateLeadSchema = z.object({
  phone: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'DEMO', 'FTD', 'CONVERTED', 'LOST', 'DO_NOT_CALL']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  department: z.enum(['SELLER', 'RETENTION']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VIP']).optional(),
  next_follow_up: z.string().datetime().nullable().optional(),
  custom_fields: z.record(z.any()).optional(),
});

const CreateNoteSchema = z.object({
  lead_id: z.string().uuid(),
  content: z.string().min(1),
  type: z.enum(['NOTE', 'EMAIL', 'SMS', 'SYSTEM']).optional().default('NOTE'),
});

const LogCallSchema = z.object({
  lead_id: z.string().uuid(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).optional().default('OUTBOUND'),
  status: z.enum(['COMPLETED', 'MISSED', 'VOICEMAIL', 'NO_ANSWER', 'BUSY']).optional().default('COMPLETED'),
  duration: z.number().int().min(0).optional().default(0),
  phone: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  recording_url: z.string().optional().default(''),
});

const CreateTaskSchema = z.object({
  lead_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  type: z.enum(['FOLLOW_UP', 'CALL_BACK', 'EMAIL', 'DEMO', 'MEETING']).optional().default('FOLLOW_UP'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  due_at: z.string().datetime(),
  assigned_to: z.string().uuid().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['FOLLOW_UP', 'CALL_BACK', 'EMAIL', 'DEMO', 'MEETING']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  due_at: z.string().datetime().optional(),
  assigned_to: z.string().uuid().optional(),
});

const CreateAffiliateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  company: z.string().optional().default(''),
  commission_type: z.enum(['CPA', 'CPL', 'REVENUE_SHARE', 'HYBRID']).optional().default('CPA'),
  cpa_amount: z.number().int().optional().default(0),
  cpl_amount: z.number().int().optional().default(0),
  revenue_share: z.number().min(0).max(100).optional().default(0),
  min_ftd: z.number().int().optional().default(0),
});

const UpdateAffiliateSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  commission_type: z.enum(['CPA', 'CPL', 'REVENUE_SHARE', 'HYBRID']).optional(),
  cpa_amount: z.number().int().optional(),
  cpl_amount: z.number().int().optional(),
  revenue_share: z.number().min(0).max(100).optional(),
  min_ftd: z.number().int().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'BLOCKED']).optional(),
});

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  source: z.string().optional().default(''),
  budget_cents: z.number().int().optional().default(0),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional().nullable(),
});

// ─── Helper ───

function generateCode(prefix: string, len = 8): string {
  return prefix + '_' + crypto.randomBytes(len).toString('hex').substring(0, len);
}

// ─── CRM Routes ───

export async function crmRoutes(fastify: FastifyInstance) {
  // IP Whitelist middleware for CRM routes
  const ipWhitelistCheck = async (request: any, reply: any) => {
    const tenantId = request.tenantId || request.headers['x-tenant-id'];
    if (!tenantId) return; // let tenant resolver handle missing tenant
    try {
      const config = await prisma.brokerConfig.findUnique({ where: { tenant_id: tenantId }, select: { ip_whitelist: true } });
      if (config?.ip_whitelist && config.ip_whitelist.trim()) {
        const allowedIps = config.ip_whitelist.split(',').map((ip: string) => ip.trim()).filter(Boolean);
        const clientIp = request.ip || request.headers['x-forwarded-for'] || '';
        // Always allow localhost for development
        const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
        if (!isLocalhost && allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
          return reply.status(403).send({ error: 'Access denied: IP not whitelisted', code: 'IP_BLOCKED' });
        }
      }
    } catch {} // If config check fails, allow access
  };

  const auth = [tenantResolver, ipWhitelistCheck, requireAdmin];

  // ═══════════════════════════════════════
  // LEADS
  // ═══════════════════════════════════════

  // Helper: extract role and adminId from JWT
  const getAgent = (request: any) => {
    const ud = request.userData || {};
    return { adminId: ud.sub || '', adminRole: ud.role || 'admin' };
  };
  // Force department filter based on role
  const forceDepartment = (role: string, query?: string): string | undefined => {
    if (role === 'seller') return 'SELLER';
    if (role === 'retention') return 'RETENTION';
    return query || undefined; // admin sees all or filtered
  };

  // GET /api/v1/crm/leads — list with filters
  fastify.get('/api/v1/crm/leads', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { adminId, adminRole } = getAgent(request);
    const q = request.query as any;

    const where: any = { tenant_id: tenantId };
    if (q.status) where.status = q.status;
    const dept = forceDepartment(adminRole, q.department);
    if (dept) where.department = dept;
    // Seller/Retention only see their own assigned leads (admin sees all)
    if (adminRole === 'seller' || adminRole === 'retention') {
      where.assigned_to = adminId;
    } else if (q.assigned_to) {
      where.assigned_to = q.assigned_to;
    }
    if (q.priority) where.priority = q.priority;
    if (q.source) where.source = q.source;
    if (q.search) {
      where.OR = [
        { email: { contains: q.search } },
        { first_name: { contains: q.search } },
        { last_name: { contains: q.search } },
        { phone: { contains: q.search } },
      ];
    }

    const page = parseInt(q.page) || 1;
    const limit = Math.min(parseInt(q.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          affiliate: { select: { name: true, tracking_code: true } },
          campaign: { select: { name: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    reply.send({ data: { leads, total, page, limit } });
  });

  // GET /api/v1/crm/leads/:id — single lead with notes, calls, tasks
  fastify.get('/api/v1/crm/leads/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;

    const lead = await prisma.lead.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        affiliate: { select: { name: true, tracking_code: true, email: true } },
        campaign: { select: { name: true } },
        notes: { orderBy: { created_at: 'desc' }, take: 50 },
        calls: { orderBy: { created_at: 'desc' }, take: 50 },
        tasks: { orderBy: { due_at: 'asc' }, take: 20 },
      },
    });

    if (!lead) return reply.status(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });

    // Resolve agent names for calls and notes
    const agentIds = [...new Set([
      ...lead.calls.map(c => c.agent_id),
      ...lead.notes.map(n => n.author_id),
    ])].filter(Boolean);
    const agentMap: Record<string, string> = {};
    if (agentIds.length > 0) {
      const agents = await prisma.tenantAdmin.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } });
      agents.forEach(a => { agentMap[a.id] = a.name; });
    }

    // Enrich calls and notes with agent_name
    const enrichedCalls = lead.calls.map(c => ({ ...c, agent_name: agentMap[c.agent_id] || 'Unknown' }));
    const enrichedNotes = lead.notes.map(n => ({ ...n, author_name: agentMap[n.author_id] || 'Unknown' }));

    // Resolve assigned_to name
    const assignedName = lead.assigned_to ? agentMap[lead.assigned_to] || (await prisma.tenantAdmin.findUnique({ where: { id: lead.assigned_to }, select: { name: true } }))?.name || null : null;

    reply.send({ data: { ...lead, calls: enrichedCalls, notes: enrichedNotes, assigned_name: assignedName } });
  });

  // POST /api/v1/crm/leads — create lead
  fastify.post('/api/v1/crm/leads', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const body = CreateLeadSchema.parse(request.body);

    // Get next lead number (global auto-increment)
    const maxLead = await prisma.lead.findFirst({ orderBy: { lead_number: 'desc' }, select: { lead_number: true } });
    const nextNumber = (maxLead?.lead_number || 999) + 1;

    const lead = await prisma.lead.create({
      data: {
        tenant_id: tenantId,
        lead_number: nextNumber,
        ...body,
        custom_fields: JSON.stringify(body.custom_fields),
      },
    });

    // If from affiliate, increment lead count + create CPL commission
    if (body.affiliate_id) {
      const aff = await prisma.affiliate.findUnique({ where: { id: body.affiliate_id } });
      if (aff) {
        await prisma.affiliate.update({
          where: { id: body.affiliate_id },
          data: { total_leads: { increment: 1 } },
        });
        if ((aff.commission_type === 'CPL' || aff.commission_type === 'HYBRID') && Number(aff.cpl_amount) > 0) {
          await prisma.commission.create({
            data: {
              tenant_id: tenantId,
              affiliate_id: body.affiliate_id,
              lead_id: lead.id,
              type: 'CPL',
              amount: aff.cpl_amount,
              description: `CPL for lead ${body.first_name} ${body.last_name}`,
            },
          });
          await prisma.affiliate.update({
            where: { id: body.affiliate_id },
            data: { total_commission: { increment: Number(aff.cpl_amount) } },
          });
        }
      }
    }

    logger.info({ leadId: lead.id, email: body.email }, '[CRM] Lead created');
    reply.status(201).send({ data: lead });
  });

  // PATCH /api/v1/crm/leads/:id — update lead
  fastify.patch('/api/v1/crm/leads/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    const body = UpdateLeadSchema.parse(request.body);

    const data: any = { ...body };
    if (body.custom_fields) data.custom_fields = JSON.stringify(body.custom_fields);
    if (body.next_follow_up !== undefined) data.next_follow_up = body.next_follow_up ? new Date(body.next_follow_up) : null;
    if (body.status === 'CONTACTED' || body.status === 'INTERESTED') data.last_contact = new Date();

    const lead = await prisma.lead.updateMany({
      where: { id, tenant_id: tenantId },
      data,
    });

    if (lead.count === 0) return reply.status(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });
    const updated = await prisma.lead.findUnique({ where: { id } });
    reply.send({ data: updated });
  });

  // POST /api/v1/crm/leads/:id/convert — convert lead to client
  fastify.post('/api/v1/crm/leads/:id/convert', { preHandler: auth }, async (request, reply) => {
    const { tenantId, tenantQuery } = request as any;
    const { id } = request.params as any;
    const { password, deposit_amount } = (request.body || {}) as any;

    const lead = await prisma.lead.findFirst({ where: { id, tenant_id: tenantId } });
    if (!lead) return reply.status(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });
    if (lead.status === 'CONVERTED') return reply.status(400).send({ error: 'Already converted', code: 'ALREADY_CONVERTED' });

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password || 'Welcome123!', 10);

    // Create user
    const user = await tenantQuery.createUser({
      email: lead.email,
      password_hash: hash,
      name: `${lead.first_name} ${lead.last_name}`,
      phone: lead.phone,
      country: lead.country,
      status: 'ACTIVE',
      kyc_status: 'NONE',
    });

    // Create account
    const depositCents = deposit_amount ? Math.round(deposit_amount * 100) : 0;
    const account = await tenantQuery.createAccount({
      user_id: user.id,
      currency: 'USD',
      balance: BigInt(depositCents),
      equity: BigInt(depositCents),
    });

    if (depositCents > 0) {
      await prisma.transaction.create({
        data: { tenant_id: tenantId, account_id: account.id, type: 'DEPOSIT', amount: BigInt(depositCents), description: 'Initial deposit (CRM conversion)' },
      });
    }

    // Update lead
    await prisma.lead.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        converted_user_id: user.id,
        ftd_amount: BigInt(depositCents),
        ftd_date: depositCents > 0 ? new Date() : undefined,
      },
    });

    // Affiliate CPA commission if applicable
    if (lead.affiliate_id && depositCents > 0) {
      const aff = await prisma.affiliate.findUnique({ where: { id: lead.affiliate_id } });
      if (aff && (aff.commission_type === 'CPA' || aff.commission_type === 'HYBRID') && depositCents >= Number(aff.min_ftd)) {
        await prisma.commission.create({
          data: {
            tenant_id: tenantId,
            affiliate_id: lead.affiliate_id,
            lead_id: lead.id,
            type: 'CPA',
            amount: aff.cpa_amount,
            description: `CPA for FTD $${(depositCents / 100).toFixed(2)} by ${lead.first_name} ${lead.last_name}`,
          },
        });
        await prisma.affiliate.update({
          where: { id: lead.affiliate_id },
          data: {
            total_ftds: { increment: 1 },
            total_commission: { increment: Number(aff.cpa_amount) },
          },
        });
      }
    }

    logger.info({ leadId: id, userId: user.id }, '[CRM] Lead converted to client');
    // Notify all admins of conversion
    await createNotification(tenantId, { for_role: 'admin', type: 'LEAD_CONVERTED', title: `Lead #${lead.lead_number} converted: ${lead.first_name} ${lead.last_name}`, body: depositCents > 0 ? `FTD: $${(depositCents / 100).toFixed(2)}` : 'No initial deposit', link: id });
    reply.send({ data: { lead_id: id, user_id: user.id, account_id: account.id } });
  });

  // DELETE /api/v1/crm/leads/:id
  fastify.delete('/api/v1/crm/leads/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    await prisma.note.deleteMany({ where: { lead_id: id, tenant_id: tenantId } });
    await prisma.call.deleteMany({ where: { lead_id: id, tenant_id: tenantId } });
    await prisma.crmTask.deleteMany({ where: { lead_id: id, tenant_id: tenantId } });
    await prisma.lead.deleteMany({ where: { id, tenant_id: tenantId } });
    reply.send({ success: true });
  });

  // POST /api/v1/crm/leads/bulk-assign — bulk assign leads
  fastify.post('/api/v1/crm/leads/bulk-assign', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { lead_ids, assigned_to, department } = (request.body || {}) as any;
    if (!lead_ids?.length) return reply.status(400).send({ error: 'No leads specified', code: 'INVALID' });

    const data: any = {};
    if (assigned_to !== undefined) data.assigned_to = assigned_to;
    if (department) data.department = department;

    const result = await prisma.lead.updateMany({
      where: { id: { in: lead_ids }, tenant_id: tenantId },
      data,
    });
    reply.send({ data: { updated: result.count } });
  });

  // ═══════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════

  fastify.post('/api/v1/crm/notes', { preHandler: auth }, async (request, reply) => {
    const { tenantId, adminId } = request as any;
    const body = CreateNoteSchema.parse(request.body);

    const note = await prisma.note.create({
      data: { tenant_id: tenantId, lead_id: body.lead_id, author_id: adminId, content: body.content, type: body.type },
    });
    await prisma.lead.update({ where: { id: body.lead_id }, data: { notes_count: { increment: 1 } } });
    reply.status(201).send({ data: note });
  });

  // ═══════════════════════════════════════
  // CALLS
  // ═══════════════════════════════════════

  fastify.post('/api/v1/crm/calls', { preHandler: auth }, async (request, reply) => {
    const { tenantId, adminId } = request as any;
    const body = LogCallSchema.parse(request.body);

    const { lead_id, ...callData } = body;
    const call = await prisma.call.create({
      data: { tenant_id: tenantId, lead_id, agent_id: adminId, ...callData },
    });
    await prisma.lead.update({
      where: { id: body.lead_id },
      data: { calls_count: { increment: 1 }, last_contact: new Date() },
    });
    reply.status(201).send({ data: call });
  });

  fastify.get('/api/v1/crm/calls', { preHandler: auth }, async (request, reply) => {
    const { tenantId, adminId } = request as any;
    const q = request.query as any;
    const where: any = { tenant_id: tenantId };
    if (q.agent_id) where.agent_id = q.agent_id;
    if (q.lead_id) where.lead_id = q.lead_id;

    const calls = await prisma.call.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: parseInt(q.limit) || 100,
      include: { lead: { select: { first_name: true, last_name: true, email: true, phone: true } } },
    });
    reply.send({ data: calls });
  });

  // ═══════════════════════════════════════
  // TASKS
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/tasks', { preHandler: auth }, async (request, reply) => {
    const { tenantId, adminId } = request as any;
    const q = request.query as any;
    const where: any = { tenant_id: tenantId };
    if (q.assigned_to) where.assigned_to = q.assigned_to;
    if (q.status) where.status = q.status;
    if (q.my === 'true') where.assigned_to = adminId;

    const tasks = await prisma.crmTask.findMany({
      where,
      orderBy: [{ status: 'asc' }, { due_at: 'asc' }],
      take: parseInt(q.limit) || 100,
      include: { lead: { select: { first_name: true, last_name: true, email: true } } },
    });
    reply.send({ data: tasks });
  });

  fastify.post('/api/v1/crm/tasks', { preHandler: auth }, async (request, reply) => {
    const { tenantId, adminId } = request as any;
    const body = CreateTaskSchema.parse(request.body);

    const task = await prisma.crmTask.create({
      data: {
        tenant_id: tenantId,
        lead_id: body.lead_id || null,
        assigned_to: body.assigned_to || adminId,
        title: body.title,
        description: body.description,
        type: body.type,
        priority: body.priority,
        due_at: new Date(body.due_at),
      },
    });
    reply.status(201).send({ data: task });
  });

  fastify.patch('/api/v1/crm/tasks/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    const body = UpdateTaskSchema.parse(request.body);

    const data: any = { ...body };
    if (body.due_at) data.due_at = new Date(body.due_at);
    if (body.status === 'COMPLETED') data.completed_at = new Date();

    await prisma.crmTask.updateMany({ where: { id, tenant_id: tenantId }, data });
    const task = await prisma.crmTask.findUnique({ where: { id } });
    reply.send({ data: task });
  });

  // ═══════════════════════════════════════
  // AFFILIATES
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/affiliates', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const affiliates = await prisma.affiliate.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { leads: true, commissions: true } } },
    });
    reply.send({ data: affiliates });
  });

  fastify.post('/api/v1/crm/affiliates', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const body = CreateAffiliateSchema.parse(request.body);

    const affiliate = await prisma.affiliate.create({
      data: {
        tenant_id: tenantId,
        ...body,
        cpa_amount: BigInt(body.cpa_amount),
        cpl_amount: BigInt(body.cpl_amount),
        min_ftd: BigInt(body.min_ftd),
        tracking_code: generateCode('AFF'),
        api_key: generateCode('ak', 24),
      },
    });
    logger.info({ affiliateId: affiliate.id, name: body.name }, '[CRM] Affiliate created');
    reply.status(201).send({ data: affiliate });
  });

  fastify.patch('/api/v1/crm/affiliates/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    const body = UpdateAffiliateSchema.parse(request.body);

    const data: any = { ...body };
    if (body.cpa_amount !== undefined) data.cpa_amount = BigInt(body.cpa_amount);
    if (body.cpl_amount !== undefined) data.cpl_amount = BigInt(body.cpl_amount);
    if (body.min_ftd !== undefined) data.min_ftd = BigInt(body.min_ftd);

    await prisma.affiliate.updateMany({ where: { id, tenant_id: tenantId }, data });
    const aff = await prisma.affiliate.findUnique({ where: { id } });
    reply.send({ data: aff });
  });

  // GET /api/v1/crm/affiliates/:id/commissions
  fastify.get('/api/v1/crm/affiliates/:id/commissions', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    const commissions = await prisma.commission.findMany({
      where: { tenant_id: tenantId, affiliate_id: id },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    reply.send({ data: commissions });
  });

  // PATCH commission status (approve/pay/reject)
  fastify.patch('/api/v1/crm/commissions/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    const { status } = (request.body || {}) as any;
    if (!['PENDING', 'APPROVED', 'PAID', 'REJECTED'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status', code: 'INVALID' });
    }
    const data: any = { status };
    if (status === 'PAID') data.paid_at = new Date();
    await prisma.commission.updateMany({ where: { id, tenant_id: tenantId }, data });
    const commission = await prisma.commission.findUnique({ where: { id } });

    // Update affiliate total_paid if marking as PAID
    if (status === 'PAID' && commission) {
      await prisma.affiliate.update({
        where: { id: commission.affiliate_id },
        data: { total_paid: { increment: Number(commission.amount) } },
      });
    }
    reply.send({ data: commission });
  });

  // ═══════════════════════════════════════
  // CAMPAIGNS
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/campaigns', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const campaigns = await prisma.campaign.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { leads: true } } },
    });
    reply.send({ data: campaigns });
  });

  fastify.post('/api/v1/crm/campaigns', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const body = CreateCampaignSchema.parse(request.body);
    const campaign = await prisma.campaign.create({
      data: {
        tenant_id: tenantId,
        name: body.name,
        description: body.description,
        source: body.source,
        budget_cents: BigInt(body.budget_cents),
        starts_at: body.starts_at ? new Date(body.starts_at) : new Date(),
        ends_at: body.ends_at ? new Date(body.ends_at) : null,
      },
    });
    reply.status(201).send({ data: campaign });
  });

  // ═══════════════════════════════════════
  // DASHBOARD / STATS
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/dashboard', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { adminId, adminRole } = getAgent(request);
    const q = request.query as any;
    const department = forceDepartment(adminRole, q.department);

    const baseWhere: any = { tenant_id: tenantId };
    if (department) baseWhere.department = department;
    // Seller/Retention only see their assigned leads in dashboard
    if (adminRole === 'seller' || adminRole === 'retention') {
      baseWhere.assigned_to = adminId;
    }

    const [
      totalLeads,
      newLeads,
      contactedLeads,
      interestedLeads,
      ftdLeads,
      convertedLeads,
      lostLeads,
      myLeads,
      todayTasks,
      overdueTasks,
      totalAffiliates,
      recentCalls,
    ] = await Promise.all([
      prisma.lead.count({ where: baseWhere }),
      prisma.lead.count({ where: { ...baseWhere, status: 'NEW' } }),
      prisma.lead.count({ where: { ...baseWhere, status: 'CONTACTED' } }),
      prisma.lead.count({ where: { ...baseWhere, status: 'INTERESTED' } }),
      prisma.lead.count({ where: { ...baseWhere, status: 'FTD' } }),
      prisma.lead.count({ where: { ...baseWhere, status: 'CONVERTED' } }),
      prisma.lead.count({ where: { ...baseWhere, status: 'LOST' } }),
      prisma.lead.count({ where: { ...baseWhere, assigned_to: adminId } }),
      prisma.crmTask.count({
        where: {
          tenant_id: tenantId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          due_at: { lte: new Date(new Date().setHours(23, 59, 59, 999)) },
        },
      }),
      prisma.crmTask.count({
        where: {
          tenant_id: tenantId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          due_at: { lt: new Date() },
        },
      }),
      prisma.affiliate.count({ where: { tenant_id: tenantId } }),
      prisma.call.count({ where: { tenant_id: tenantId, created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ]);

    // Total FTD amount
    const ftdAgg = await prisma.lead.aggregate({
      where: { ...baseWhere, ftd_amount: { gt: 0 } },
      _sum: { ftd_amount: true },
      _count: true,
    });

    // Pipeline funnel
    const pipeline = [
      { stage: 'NEW', count: newLeads, color: '#6366f1' },
      { stage: 'CONTACTED', count: contactedLeads, color: '#8b5cf6' },
      { stage: 'INTERESTED', count: interestedLeads, color: '#f59e0b' },
      { stage: 'FTD', count: ftdLeads, color: '#22c55e' },
      { stage: 'CONVERTED', count: convertedLeads, color: '#10b981' },
      { stage: 'LOST', count: lostLeads, color: '#ef4444' },
    ];

    // Agents leaderboard
    const agents = await prisma.lead.groupBy({
      by: ['assigned_to'],
      where: { tenant_id: tenantId, assigned_to: { not: null } },
      _count: true,
    });

    // Resolve agent names
    const agentIds = agents.map(a => a.assigned_to).filter(Boolean) as string[];
    const adminAccounts = agentIds.length > 0 ? await prisma.tenantAdmin.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, email: true },
    }) : [];
    const agentMap = new Map(adminAccounts.map(a => [a.id, a]));

    const leaderboard = agents.map(a => ({
      agent_id: a.assigned_to,
      name: agentMap.get(a.assigned_to!)?.name || 'Unknown',
      email: agentMap.get(a.assigned_to!)?.email || '',
      leads: a._count,
    })).sort((a, b) => b.leads - a.leads);

    reply.send({
      data: {
        total_leads: totalLeads,
        pipeline,
        my_leads: myLeads,
        today_tasks: todayTasks,
        overdue_tasks: overdueTasks,
        total_affiliates: totalAffiliates,
        today_calls: recentCalls,
        total_ftd_amount: Number(ftdAgg._sum.ftd_amount || 0),
        total_ftd_count: ftdAgg._count,
        leaderboard,
      },
    });
  });

  // ═══════════════════════════════════════
  // AGENTS (admin users list for assignment)
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/agents', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const agents = await prisma.tenantAdmin.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: { id: true, name: true, email: true, role: true },
    });
    reply.send({ data: agents });
  });

  // ═══════════════════════════════════════
  // AFFILIATE PUBLIC API (uses api_key auth)
  // ═══════════════════════════════════════

  // POST /api/v1/affiliate/lead — create lead from affiliate tracking
  fastify.post('/api/v1/affiliate/lead', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] || (request.query as any).api_key) as string;
    if (!apiKey) return reply.status(401).send({ error: 'API key required', code: 'UNAUTHORIZED' });

    const affiliate = await prisma.affiliate.findUnique({ where: { api_key: apiKey } });
    if (!affiliate) return reply.status(401).send({ error: 'Invalid API key', code: 'UNAUTHORIZED' });
    if (affiliate.status !== 'ACTIVE') return reply.status(403).send({ error: 'Affiliate account inactive', code: 'INACTIVE' });

    const body = z.object({
      email: z.string().email(),
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      phone: z.string().optional().default(''),
      country: z.string().optional().default(''),
      language: z.string().optional().default('en'),
      ip_address: z.string().optional().default(''),
      utm_source: z.string().optional().default(''),
      utm_medium: z.string().optional().default(''),
      utm_campaign: z.string().optional().default(''),
    }).parse(request.body);

    const lead = await prisma.lead.create({
      data: {
        tenant_id: affiliate.tenant_id,
        email: body.email,
        first_name: body.first_name,
        last_name: body.last_name,
        phone: body.phone,
        country: body.country,
        language: body.language,
        source: 'AFFILIATE',
        affiliate_id: affiliate.id,
        ip_address: body.ip_address || (request.ip || ''),
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
      },
    });

    // Increment + CPL
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { total_leads: { increment: 1 } },
    });

    if ((affiliate.commission_type === 'CPL' || affiliate.commission_type === 'HYBRID') && Number(affiliate.cpl_amount) > 0) {
      await prisma.commission.create({
        data: {
          tenant_id: affiliate.tenant_id,
          affiliate_id: affiliate.id,
          lead_id: lead.id,
          type: 'CPL',
          amount: affiliate.cpl_amount,
          description: `CPL for ${body.first_name} ${body.last_name}`,
        },
      });
    }

    logger.info({ affiliateId: affiliate.id, leadId: lead.id }, '[Affiliate API] Lead created');
    reply.status(201).send({ data: { lead_id: lead.id, status: 'NEW' } });
  });

  // GET /api/v1/affiliate/stats — affiliate dashboard
  fastify.get('/api/v1/affiliate/stats', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] || (request.query as any).api_key) as string;
    if (!apiKey) return reply.status(401).send({ error: 'API key required', code: 'UNAUTHORIZED' });

    const affiliate = await prisma.affiliate.findUnique({ where: { api_key: apiKey } });
    if (!affiliate) return reply.status(401).send({ error: 'Invalid API key', code: 'UNAUTHORIZED' });

    const commissions = await prisma.commission.findMany({
      where: { affiliate_id: affiliate.id },
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    reply.send({
      data: {
        total_leads: affiliate.total_leads,
        total_ftds: affiliate.total_ftds,
        total_commission: Number(affiliate.total_commission),
        total_paid: Number(affiliate.total_paid),
        pending_payout: Number(affiliate.total_commission) - Number(affiliate.total_paid),
        tracking_code: affiliate.tracking_code,
        commissions: commissions.map(c => ({
          id: c.id,
          type: c.type,
          amount: Number(c.amount),
          status: c.status,
          created_at: c.created_at,
        })),
      },
    });
  });

  // ═══════════════════════════════════════
  // TRADES (for Lead Detail)
  // ═══════════════════════════════════════

  // GET /api/v1/crm/trades/:userId — closed trades for a converted user
  fastify.get('/api/v1/crm/trades/:userId', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { userId } = request.params as any;

    const trades = await prisma.trade.findMany({
      where: { tenant_id: tenantId, user_id: userId, status: 'CLOSED' },
      orderBy: { close_time: 'desc' },
      take: 200,
      include: { instrument: { select: { symbol: true, display_name: true } } },
    });

    const result = trades.map(t => ({
      id: t.id,
      symbol: t.instrument.symbol,
      display_name: t.instrument.display_name,
      side: t.side,
      volume: t.volume,
      open_price: Number(t.open_price),
      close_price: Number(t.close_price),
      pnl: Number(t.pnl),
      open_time: t.open_time,
      close_time: t.close_time,
    }));

    reply.send({ data: result });
  });

  // ═══════════════════════════════════════
  // CSV IMPORT / EXPORT
  // ═══════════════════════════════════════

  // GET /api/v1/crm/leads/export?format=csv
  fastify.get('/api/v1/crm/leads/export', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { adminId, adminRole } = getAgent(request);
    const q = request.query as any;

    const where: any = { tenant_id: tenantId };
    if (q.status) where.status = q.status;
    const dept = forceDepartment(adminRole, q.department);
    if (dept) where.department = dept;
    if (adminRole === 'seller' || adminRole === 'retention') {
      where.assigned_to = adminId;
    } else if (q.assigned_to) {
      where.assigned_to = q.assigned_to;
    }
    if (q.search) {
      where.OR = [
        { email: { contains: q.search } },
        { first_name: { contains: q.search } },
        { last_name: { contains: q.search } },
        { phone: { contains: q.search } },
      ];
    }
    if (q.date_from) {
      where.created_at = { ...(where.created_at || {}), gte: new Date(q.date_from) };
    }
    if (q.date_to) {
      where.created_at = { ...(where.created_at || {}), lte: new Date(q.date_to) };
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 10000,
    });

    const headers = ['lead_number', 'email', 'phone', 'first_name', 'last_name', 'country', 'language', 'source', 'status', 'department', 'priority', 'created_at'];
    const csvRows = [headers.join(',')];
    for (const l of leads) {
      const row = headers.map(h => {
        const val = String((l as any)[h] ?? '');
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      });
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename=leads_export.csv');
    reply.send(csv);
  });

  // POST /api/v1/crm/leads/import — accepts mapped lead objects array
  fastify.post('/api/v1/crm/leads/import', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const body = request.body as any;

    // Support both legacy csv_data string and new mapped leads array
    let leadsToImport: any[] = [];

    if (Array.isArray(body?.leads)) {
      leadsToImport = body.leads;
    } else if (typeof body?.csv_data === 'string') {
      // Legacy: parse CSV string
      const lines = body.csv_data.split('\n').filter((l: string) => l.trim());
      if (lines.length < 2) {
        return reply.status(400).send({ error: 'CSV must have header and at least one data row', code: 'INVALID' });
      }
      const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const vals: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const ch of lines[i]) {
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue; }
          current += ch;
        }
        vals.push(current.trim());
        const row: any = {};
        headers.forEach((h: string, idx: number) => { if (idx < vals.length) row[h] = vals[idx]; });
        leadsToImport.push(row);
      }
    } else {
      return reply.status(400).send({ error: 'Provide leads array or csv_data string', code: 'INVALID' });
    }

    if (leadsToImport.length === 0) {
      return reply.status(400).send({ error: 'No leads to import', code: 'INVALID' });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < leadsToImport.length; i++) {
      try {
        const row = leadsToImport[i];
        const email = (row.email || '').trim();
        const first_name = (row.first_name || '').trim();
        const last_name = (row.last_name || '').trim();

        if (!email || !first_name || !last_name) { skipped++; continue; }

        const existing = await prisma.lead.findFirst({ where: { email, tenant_id: tenantId } });
        if (existing) { skipped++; continue; }

        const maxLead = await prisma.lead.findFirst({ orderBy: { lead_number: 'desc' }, select: { lead_number: true } });
        const nextNumber = (maxLead?.lead_number || 999) + 1;

        await prisma.lead.create({
          data: {
            tenant_id: tenantId,
            lead_number: nextNumber,
            email,
            first_name,
            last_name,
            phone: (row.phone || '').trim(),
            country: (row.country || '').trim(),
            language: (row.language || 'en').trim(),
            source: (row.source || 'CSV_IMPORT').trim(),
            department: (['SELLER', 'RETENTION'].includes((row.department || '').toUpperCase()) ? (row.department || '').toUpperCase() : 'SELLER') as any,
            priority: (['LOW', 'MEDIUM', 'HIGH', 'VIP'].includes((row.priority || '').toUpperCase()) ? (row.priority || '').toUpperCase() : 'MEDIUM') as any,
            status: 'NEW',
          },
        });
        created++;
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e.message}`);
        skipped++;
      }
    }

    logger.info({ created, skipped, errors: errors.length }, '[CRM] CSV import completed');
    reply.send({ data: { created, skipped, errors: errors.slice(0, 10) } });
  });

  // ═══════════════════════════════════════
  // IP GEOLOCATION
  // ═══════════════════════════════════════

  const geoCache = new Map<string, { data: any; ts: number }>();
  const GEO_CACHE_TTL = 3600000; // 1 hour

  fastify.get('/api/v1/crm/geo/:ip', { preHandler: auth }, async (request, reply) => {
    const { ip } = request.params as any;
    if (!ip || !/^[\d.:a-fA-F]+$/.test(ip)) {
      return reply.status(400).send({ error: 'Invalid IP address', code: 'INVALID' });
    }

    // Check cache
    const cached = geoCache.get(ip);
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
      return reply.send({ data: cached.data });
    }

    try {
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country,countryCode,timezone,lat,lon,isp`);
      const json: any = await res.json();
      if (json.status === 'fail') {
        return reply.send({ data: { city: '', country: '', timezone: '', lat: 0, lon: 0, isp: '' } });
      }
      const result = {
        city: json.city || '',
        country: json.country || '',
        countryCode: json.countryCode || '',
        timezone: json.timezone || '',
        lat: json.lat || 0,
        lon: json.lon || 0,
        isp: json.isp || '',
      };
      geoCache.set(ip, { data: result, ts: Date.now() });
      reply.send({ data: result });
    } catch (e: any) {
      logger.error({ ip, error: e.message }, '[CRM] IP geolocation failed');
      reply.send({ data: { city: '', country: '', timezone: '', lat: 0, lon: 0, isp: '' } });
    }
  });

  // ═══════════════════════════════════════
  // REPORTS (Broker Reports)
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/reports', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { adminRole } = getAgent(request);

    if (adminRole !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required', code: 'FORBIDDEN' });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tradesToday = await prisma.trade.findMany({
      where: { tenant_id: tenantId, open_time: { gte: todayStart } },
      select: { volume: true, pnl: true, status: true },
    });
    const total_volume_today = tradesToday.reduce((s, t) => s + t.volume, 0);

    const closedToday = await prisma.trade.findMany({
      where: { tenant_id: tenantId, status: 'CLOSED', close_time: { gte: todayStart } },
      select: { pnl: true },
    });
    const total_pnl_today = closedToday.reduce((s, t) => s + Number(t.pnl), 0);

    const depositsToday = await prisma.transaction.findMany({
      where: { tenant_id: tenantId, type: 'DEPOSIT', created_at: { gte: todayStart } },
      select: { amount: true },
    });
    const total_deposits_today = depositsToday.reduce((s, t) => s + Number(t.amount), 0);

    const withdrawalsToday = await prisma.transaction.findMany({
      where: { tenant_id: tenantId, type: 'WITHDRAWAL', created_at: { gte: todayStart } },
      select: { amount: true },
    });
    const total_withdrawals_today = withdrawalsToday.reduce((s, t) => s + Number(t.amount), 0);

    const allClosedTrades = await prisma.trade.findMany({
      where: { tenant_id: tenantId, status: 'CLOSED' },
      select: { instrument_id: true, volume: true },
      take: 10000,
    });
    const instrumentMap: Record<string, { count: number; volume: number; instrument_id: string }> = {};
    for (const t of allClosedTrades) {
      if (!instrumentMap[t.instrument_id]) instrumentMap[t.instrument_id] = { count: 0, volume: 0, instrument_id: t.instrument_id };
      instrumentMap[t.instrument_id].count++;
      instrumentMap[t.instrument_id].volume += t.volume;
    }
    const instrumentIds = Object.keys(instrumentMap);
    const instruments = instrumentIds.length > 0
      ? await prisma.instrument.findMany({ where: { id: { in: instrumentIds } }, select: { id: true, symbol: true } })
      : [];
    const symbolMap: Record<string, string> = {};
    instruments.forEach(i => { symbolMap[i.id] = i.symbol; });
    const top_instruments = Object.entries(instrumentMap)
      .map(([id, data]) => ({ symbol: symbolMap[id] || 'Unknown', count: data.count, volume: Math.round(data.volume * 100) / 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const recentTrades = await prisma.trade.findMany({
      where: { tenant_id: tenantId, status: 'CLOSED', close_time: { gte: thirtyDaysAgo } },
      select: { volume: true, pnl: true, close_time: true },
    });

    const dailyMap: Record<string, { trades: number; volume: number; pnl: number }> = {};
    for (let d = 0; d < 30; d++) {
      const day = new Date(thirtyDaysAgo);
      day.setDate(day.getDate() + d);
      const key = day.toISOString().split('T')[0];
      dailyMap[key] = { trades: 0, volume: 0, pnl: 0 };
    }
    for (const t of recentTrades) {
      if (!t.close_time) continue;
      const key = t.close_time.toISOString().split('T')[0];
      if (dailyMap[key]) {
        dailyMap[key].trades++;
        dailyMap[key].volume += t.volume;
        dailyMap[key].pnl += Number(t.pnl);
      }
    }
    const daily_stats = Object.entries(dailyMap).map(([date, data]) => ({
      date,
      trades: data.trades,
      volume: Math.round(data.volume * 100) / 100,
      pnl: data.pnl,
    })).sort((a, b) => a.date.localeCompare(b.date));

    reply.send({
      data: {
        total_volume_today: Math.round(total_volume_today * 100) / 100,
        total_pnl_today,
        total_deposits_today,
        total_withdrawals_today,
        top_instruments,
        daily_stats,
      },
    });
  });

  // ═══════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════

  // Helper: create notification
  async function createNotification(tenantId: string, opts: { for_user?: string; for_role?: string; type: string; title: string; body?: string; link?: string }) {
    await prisma.crmNotification.create({
      data: { tenant_id: tenantId, for_user: opts.for_user || null, for_role: opts.for_role || null, type: opts.type, title: opts.title, body: opts.body || '', link: opts.link || '' },
    });
  }

  // GET notifications for current agent
  fastify.get('/api/v1/crm/notifications', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { adminId, adminRole } = getAgent(request);
    const q = request.query as any;

    const notifications = await prisma.crmNotification.findMany({
      where: {
        tenant_id: tenantId,
        OR: [
          { for_user: adminId },
          { for_role: adminRole },
          { for_user: null, for_role: null }, // broadcast to all
        ],
      },
      orderBy: { created_at: 'desc' },
      take: parseInt(q.limit) || 30,
    });

    const unreadCount = await prisma.crmNotification.count({
      where: {
        tenant_id: tenantId,
        is_read: false,
        OR: [{ for_user: adminId }, { for_role: adminRole }, { for_user: null, for_role: null }],
      },
    });

    reply.send({ data: notifications, unread: unreadCount });
  });

  // PATCH mark as read
  fastify.patch('/api/v1/crm/notifications/read', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { adminId, adminRole } = getAgent(request);
    const { ids } = (request.body || {}) as any;

    if (ids && Array.isArray(ids)) {
      await prisma.crmNotification.updateMany({ where: { id: { in: ids }, tenant_id: tenantId }, data: { is_read: true } });
    } else {
      // Mark all as read
      await prisma.crmNotification.updateMany({
        where: { tenant_id: tenantId, is_read: false, OR: [{ for_user: adminId }, { for_role: adminRole }, { for_user: null, for_role: null }] },
        data: { is_read: true },
      });
    }
    reply.send({ success: true });
  });

  // ═══════════════════════════════════════
  // KYC BRIDGE — proxy to external KYC app
  // ═══════════════════════════════════════

  const KYC_API_URL = process.env.KYC_API_URL || 'http://localhost:3000';
  const KYC_API_KEY = process.env.KYC_API_KEY || '';

  async function kycFetch(path: string, opts: RequestInit = {}): Promise<any> {
    const res = await fetch(`${KYC_API_URL}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KYC_API_KEY, ...(opts.headers as Record<string, string>) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data as any).error || 'KYC request failed');
    return data;
  }

  // POST /api/v1/crm/kyc/send/:leadId — create KYC verification for a lead
  fastify.post('/api/v1/crm/kyc/send/:leadId', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { leadId } = request.params as any;

    const lead = await prisma.lead.findFirst({ where: { id: leadId, tenant_id: tenantId } });
    if (!lead) return reply.status(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });

    // Get tenant domain for branding the KYC URL
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const brokerDomain = tenant?.domain || 'localhost';

    // Create verification in KYC backend
    const kycRes = await kycFetch('/api/admin/verifications', {
      method: 'POST',
      body: JSON.stringify({
        clientInfo: {
          lead_id: lead.id,
          lead_number: lead.lead_number,
          email: lead.email,
          name: `${lead.first_name} ${lead.last_name}`,
          phone: lead.phone,
          tenant_id: tenantId,
          broker: tenant?.name || '',
        },
        expiresInHours: 72,
      }),
    });

    // Build KYC URL using broker domain
    const kycUrl = `https://kyc.${brokerDomain}/verify/${kycRes.token}`;

    // Update lead with KYC info
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        kyc_status: 'SENT',
        kyc_verification_id: kycRes.id,
        kyc_token: kycRes.token,
        kyc_url: kycUrl,
        kyc_sent_at: new Date(),
      },
    });

    logger.info({ leadId, kycId: kycRes.id, kycUrl }, '[CRM] KYC verification sent');
    reply.send({ data: { kyc_id: kycRes.id, kyc_url: kycUrl, kyc_token: kycRes.token, expires_at: kycRes.expiresAt } });
  });

  // GET /api/v1/crm/kyc/status/:leadId — check KYC status
  fastify.get('/api/v1/crm/kyc/status/:leadId', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { leadId } = request.params as any;

    const lead = await prisma.lead.findFirst({ where: { id: leadId, tenant_id: tenantId } });
    if (!lead || !lead.kyc_verification_id) return reply.send({ data: { kyc_status: lead?.kyc_status || 'NONE', documents: [] } });

    try {
      const kycRes = await kycFetch(`/api/admin/verifications/${lead.kyc_verification_id}`);
      const kycStatus = kycRes.status === 'completed' ? 'COMPLETED' : kycRes.status === 'in_progress' ? 'IN_PROGRESS' : kycRes.status === 'expired' ? 'EXPIRED' : 'SENT';

      // Update lead kyc_status if changed
      if (kycStatus !== lead.kyc_status) {
        const updateData: any = { kyc_status: kycStatus };
        if (kycStatus === 'COMPLETED') updateData.kyc_completed_at = new Date();
        await prisma.lead.update({ where: { id: leadId }, data: updateData });
        // Notify assigned agent when KYC completed
        if (kycStatus === 'COMPLETED' && lead.assigned_to) {
          await createNotification(tenantId, {
            for_user: lead.assigned_to, type: 'KYC_COMPLETED',
            title: `KYC completed: ${lead.first_name} ${lead.last_name}`,
            body: 'Documents uploaded and ready for review', link: lead.id,
          });
        }
      }

      reply.send({
        data: {
          kyc_status: kycStatus,
          kyc_url: lead.kyc_url,
          sent_at: lead.kyc_sent_at,
          completed_at: lead.kyc_completed_at,
          document_type: kycRes.documentType,
          documents: kycRes.documents || [],
        },
      });
    } catch (e: any) {
      reply.send({ data: { kyc_status: lead.kyc_status, documents: [], error: e.message } });
    }
  });

  // POST /api/v1/crm/kyc/approve/:leadId — manually approve KYC
  fastify.post('/api/v1/crm/kyc/approve/:leadId', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { leadId } = request.params as any;
    await prisma.lead.updateMany({ where: { id: leadId, tenant_id: tenantId }, data: { kyc_status: 'APPROVED' } });
    reply.send({ data: { kyc_status: 'APPROVED' } });
  });

  // POST /api/v1/crm/kyc/reject/:leadId — reject KYC
  fastify.post('/api/v1/crm/kyc/reject/:leadId', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { leadId } = request.params as any;
    const { reason } = (request.body || {}) as any;
    await prisma.lead.updateMany({ where: { id: leadId, tenant_id: tenantId }, data: { kyc_status: 'REJECTED' } });
    // Create note with rejection reason
    const { adminId } = getAgent(request);
    if (reason) {
      await prisma.note.create({ data: { tenant_id: tenantId, lead_id: leadId, author_id: adminId, content: `KYC Rejected: ${reason}`, type: 'SYSTEM' } });
    }
    reply.send({ data: { kyc_status: 'REJECTED' } });
  });

  // POST /api/v1/crm/kyc/resend/:leadId — resend KYC with specific docs
  fastify.post('/api/v1/crm/kyc/resend/:leadId', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { leadId } = request.params as any;
    const { requiredDocuments } = (request.body || {}) as any;

    const lead = await prisma.lead.findFirst({ where: { id: leadId, tenant_id: tenantId } });
    if (!lead) return reply.status(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const brokerDomain = tenant?.domain || 'localhost';

    const kycRes = await kycFetch('/api/admin/verifications', {
      method: 'POST',
      body: JSON.stringify({
        clientInfo: { lead_id: lead.id, email: lead.email, name: `${lead.first_name} ${lead.last_name}`, tenant_id: tenantId },
        expiresInHours: 72,
        requiredDocuments: requiredDocuments || ['id_front', 'id_back', 'proof_of_address', 'selfie'],
      }),
    });

    const kycUrl = `https://kyc.${brokerDomain}/verify/${kycRes.token}`;
    await prisma.lead.update({
      where: { id: leadId },
      data: { kyc_status: 'SENT', kyc_verification_id: kycRes.id, kyc_token: kycRes.token, kyc_url: kycUrl, kyc_sent_at: new Date(), kyc_completed_at: null },
    });

    reply.send({ data: { kyc_id: kycRes.id, kyc_url: kycUrl } });
  });

  // ═══════════════════════════════════════
  // BULK TRADE — send same trade to multiple clients
  // ═══════════════════════════════════════

  const BulkTradeSchema = z.object({
    client_ids: z.array(z.string().uuid()).min(1),
    symbol: z.string().min(1),
    side: z.enum(['BUY', 'SELL']),
    invest_pct: z.number().min(0.1).max(100),     // % of available balance
    outcome: z.enum(['open', 'win', 'lose']),
    pnl_pct: z.number().optional(),                // % gain/loss on invested amount
    close_after_seconds: z.number().int().min(0).optional(),
    reason: z.string().optional().default('Bulk trade from CRM'),
  });

  fastify.post('/api/v1/crm/bulk-trade', { preHandler: auth }, async (request, reply) => {
    const { tenantId, adminId } = request as any;
    const body = BulkTradeSchema.parse(request.body);

    const results: { client_id: string; name: string; success: boolean; error?: string; invest?: number; pnl?: number }[] = [];

    for (const clientId of body.client_ids) {
      try {
        // Get client account
        const account = await prisma.account.findFirst({ where: { user_id: clientId, tenant_id: tenantId } });
        if (!account) { results.push({ client_id: clientId, name: '', success: false, error: 'No account' }); continue; }

        const user = await prisma.user.findUnique({ where: { id: clientId }, select: { name: true } });
        const available = Number(account.balance) - Number(account.margin_used);
        if (available <= 0) { results.push({ client_id: clientId, name: user?.name || '', success: false, error: 'No available balance' }); continue; }

        // Calculate invest amount from %
        const investCents = Math.round(available * (body.invest_pct / 100));
        if (investCents < 100) { results.push({ client_id: clientId, name: user?.name || '', success: false, error: 'Amount too small' }); continue; }

        // Calculate P&L target from % of invested
        let pnlCents: number | undefined;
        if (body.outcome !== 'open' && body.pnl_pct) {
          const raw = Math.round(investCents * (body.pnl_pct / 100));
          pnlCents = body.outcome === 'win' ? Math.abs(raw) : -Math.abs(raw);
        }

        // Call dealer create-trade endpoint internally
        const dealerPayload: any = {
          user_id: clientId,
          symbol: body.symbol,
          side: body.side,
          volume: 0.1,
          invest_amount: investCents,
          reason: body.reason,
        };
        if (pnlCents !== undefined) dealerPayload.pnl_target = pnlCents;
        if (body.close_after_seconds && body.close_after_seconds > 0) dealerPayload.close_after_seconds = body.close_after_seconds;

        // Direct inject to dealer route via internal fetch
        const internalRes = await fastify.inject({
          method: 'POST',
          url: '/api/v1/dealer/create-trade',
          headers: {
            'content-type': 'application/json',
            authorization: request.headers.authorization as string,
            'x-tenant-id': tenantId,
          },
          payload: dealerPayload,
        });

        if (internalRes.statusCode >= 200 && internalRes.statusCode < 300) {
          results.push({ client_id: clientId, name: user?.name || '', success: true, invest: investCents / 100, pnl: pnlCents ? pnlCents / 100 : undefined });
        } else {
          const err = JSON.parse(internalRes.body);
          results.push({ client_id: clientId, name: user?.name || '', success: false, error: err.error || 'Failed' });
        }
      } catch (e: any) {
        results.push({ client_id: clientId, name: '', success: false, error: e.message });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    logger.info({ adminId, succeeded, total: body.client_ids.length, symbol: body.symbol }, '[CRM] Bulk trade executed');
    reply.send({ data: { results, succeeded, total: body.client_ids.length } });
  });

  // ═══════════════════════════════════════
  // TRADE PROGRAMS — scheduled auto-trading
  // ═══════════════════════════════════════

  const CreateProgramSchema = z.object({
    name: z.string().optional().default(''),
    client_ids: z.array(z.string().uuid()).min(1),
    instrument_type: z.enum(['CRYPTO', 'FOREX', 'INDICES', 'COMMODITIES', 'ALL']).optional().default('CRYPTO'),
    target_pct: z.number().min(-50).max(500),       // target % gain
    invest_pct: z.number().min(1).max(50),           // % of balance per trade
    period: z.enum(['1W', '2W', '1M', '2M', '3M']),
    trades_per_day: z.number().int().min(1).max(10).optional().default(3),
    min_trade_pct: z.number().optional().default(-8),  // min single trade %
    max_trade_pct: z.number().optional().default(20),  // max single trade %
  });

  fastify.post('/api/v1/crm/programs', { preHandler: auth }, async (request, reply) => {
    const { tenantId, adminId } = request as any;
    const body = CreateProgramSchema.parse(request.body);

    // Calculate end date
    const periodDays: Record<string, number> = { '1W': 7, '2W': 14, '1M': 30, '2M': 60, '3M': 90 };
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (periodDays[body.period] || 30));

    const program = await prisma.tradeProgram.create({
      data: {
        tenant_id: tenantId,
        name: body.name || `${body.instrument_type} +${body.target_pct}% / ${body.period}`,
        client_ids: JSON.stringify(body.client_ids),
        instrument_type: body.instrument_type,
        target_pct: body.target_pct,
        invest_pct: body.invest_pct,
        period: body.period,
        end_date: endDate,
        trades_per_day: body.trades_per_day,
        min_trade_pct: body.min_trade_pct,
        max_trade_pct: body.max_trade_pct,
        created_by: adminId,
      },
    });

    logger.info({ programId: program.id, clients: body.client_ids.length, target: body.target_pct }, '[CRM] Trade program created');
    reply.status(201).send({ data: program });
  });

  fastify.get('/api/v1/crm/programs', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const programs = await prisma.tradeProgram.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
    // Parse client_ids JSON
    const enriched = programs.map(p => ({
      ...p,
      client_ids_parsed: JSON.parse(p.client_ids) as string[],
      days_remaining: Math.max(0, Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86400000)),
      remaining_pct: p.target_pct - p.progress_pct,
    }));
    reply.send({ data: enriched });
  });

  fastify.patch('/api/v1/crm/programs/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    const { status } = (request.body || {}) as any;
    if (status) {
      await prisma.tradeProgram.updateMany({ where: { id, tenant_id: tenantId }, data: { status } });
    }
    const program = await prisma.tradeProgram.findUnique({ where: { id } });
    reply.send({ data: program });
  });

  // GET programs/execute — manually trigger daily trades for active programs (also called by cron)
  fastify.post('/api/v1/crm/programs/execute', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    await executeDailyProgramTrades(tenantId, fastify, request.headers.authorization as string);
    reply.send({ data: { ok: true } });
  });
}

// ═══════════════════════════════════════
// AUTO-TRADER ENGINE — generates daily trades for programs
// ═══════════════════════════════════════

async function executeDailyProgramTrades(tenantId: string, fastify: any, authHeader: string) {
  const logger = require('pino')({ name: 'auto-trader' });

  const programs = await prisma.tradeProgram.findMany({
    where: { tenant_id: tenantId, status: 'ACTIVE', end_date: { gt: new Date() } },
  });

  for (const program of programs) {
    const clientIds: string[] = JSON.parse(program.client_ids);
    const daysTotal = Math.ceil((new Date(program.end_date).getTime() - new Date(program.start_date).getTime()) / 86400000);
    const daysElapsed = Math.ceil((Date.now() - new Date(program.start_date).getTime()) / 86400000);
    const daysRemaining = Math.max(1, daysTotal - daysElapsed);

    // How much % we still need to achieve
    const remainingPct = program.target_pct - program.progress_pct;
    // Daily target % (spread remaining evenly, with some randomness)
    const dailyTargetPct = remainingPct / daysRemaining;

    // Instrument symbols by type
    const SYMBOLS_BY_TYPE: Record<string, string[]> = {
      CRYPTO: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'ADAUSD', 'DOGEUSD'],
      FOREX: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD'],
      INDICES: ['US500', 'US100', 'US30', 'DE40', 'UK100'],
      COMMODITIES: ['XAUUSD', 'XAGUSD', 'USOIL'],
      ALL: ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'XAUUSD', 'US500'],
    };
    const symbols = SYMBOLS_BY_TYPE[program.instrument_type] || SYMBOLS_BY_TYPE.ALL;

    // Generate trades for today
    let dailyAchieved = 0;
    const tradesPerDay = program.trades_per_day;

    for (let t = 0; t < tradesPerDay; t++) {
      // Determine this trade's P&L %
      const remainingForDay = dailyTargetPct - dailyAchieved;
      const isLastTrade = t === tradesPerDay - 1;

      let tradePnlPct: number;
      if (isLastTrade) {
        // Last trade of the day: hit remaining target exactly
        tradePnlPct = remainingForDay;
      } else {
        // Random trade, can be winner or loser
        const minPct = Math.max(program.min_trade_pct, -Math.abs(remainingForDay) * 2);
        const maxPct = Math.min(program.max_trade_pct, Math.abs(remainingForDay) * 3);
        tradePnlPct = minPct + Math.random() * (maxPct - minPct);
      }

      // Clamp
      tradePnlPct = Math.max(program.min_trade_pct, Math.min(program.max_trade_pct, tradePnlPct));

      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const durationSeconds = Math.floor(30 + Math.random() * 600); // 30s to 10min

      for (const clientId of clientIds) {
        try {
          const account = await prisma.account.findFirst({ where: { user_id: clientId, tenant_id: tenantId } });
          if (!account) continue;

          const available = Number(account.balance) - Number(account.margin_used);
          if (available <= 0) continue;

          const investCents = Math.round(available * (program.invest_pct / 100));
          if (investCents < 100) continue;

          const pnlCents = Math.round(investCents * (tradePnlPct / 100));

          await fastify.inject({
            method: 'POST',
            url: '/api/v1/dealer/create-trade',
            headers: { 'content-type': 'application/json', authorization: authHeader, 'x-tenant-id': tenantId },
            payload: {
              user_id: clientId,
              symbol,
              side,
              volume: 0.1,
              invest_amount: investCents,
              pnl_target: pnlCents,
              close_after_seconds: durationSeconds,
              reason: `Auto-trader: ${program.name} (trade ${t + 1}/${tradesPerDay})`,
            },
          });
        } catch {}
      }

      dailyAchieved += tradePnlPct;
    }

    // Update program progress
    await prisma.tradeProgram.update({
      where: { id: program.id },
      data: {
        progress_pct: program.progress_pct + dailyAchieved,
        total_trades: program.total_trades + tradesPerDay,
        status: daysRemaining <= 1 ? 'COMPLETED' : 'ACTIVE',
      },
    });

    logger.info({
      programId: program.id,
      dailyTarget: dailyTargetPct.toFixed(2),
      dailyAchieved: dailyAchieved.toFixed(2),
      totalProgress: (program.progress_pct + dailyAchieved).toFixed(2),
      target: program.target_pct,
    }, '[AutoTrader] Daily trades executed');
  }
}
