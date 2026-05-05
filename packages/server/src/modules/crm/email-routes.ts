import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAdmin } from '../../shared/middleware/auth';
import nodemailer from 'nodemailer';

const logger = require('pino')({ name: 'email' });

// ─── Variable replacement engine ───
function replaceVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] || match);
}

// ─── Get SMTP transporter for tenant ───
async function getTransporter(tenantId: string) {
  const config = await prisma.brokerConfig.findUnique({ where: { tenant_id: tenantId } });
  if (!config || !config.smtp_host) return null;
  return {
    transporter: nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth: { user: config.smtp_user, pass: config.smtp_pass },
    }),
    from: `"${config.smtp_from_name || config.company_name}" <${config.smtp_from_email || config.smtp_user}>`,
    config,
  };
}

// ─── Build default email wrapper with broker branding ───
function wrapEmailHtml(bodyHtml: string, config: any): string {
  const logo = config?.logo_url ? `<img src="${config.logo_url}" alt="${config.company_name}" style="max-height:50px;margin-bottom:20px;" />` : '';
  const color = config?.primary_color || '#6366f1';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;color:#1a1a2e;}
.container{max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);}
.header{background:${color};padding:30px 40px;text-align:center;}
.header img{display:block;margin:0 auto;}
.body{padding:32px 40px;line-height:1.7;font-size:15px;}
.footer{padding:24px 40px;background:#f8f9fa;text-align:center;font-size:12px;color:#8b8b9e;border-top:1px solid #eee;}
.btn{display:inline-block;padding:12px 28px;background:${color};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;}
h1,h2{color:#1a1a2e;margin-top:0;}
</style></head>
<body><div class="container">
<div class="header">${logo}</div>
<div class="body">${bodyHtml}</div>
<div class="footer">
${config?.company_name || ''}<br/>
${config?.address || ''}<br/>
${config?.support_email ? `<a href="mailto:${config.support_email}">${config.support_email}</a>` : ''}
${config?.support_phone ? ` · ${config.support_phone}` : ''}
${config?.website ? `<br/><a href="${config.website}">${config.website}</a>` : ''}
</div>
</div></body></html>`;
}

export async function emailRoutes(fastify: FastifyInstance) {
  const auth = [tenantResolver, requireAdmin];

  // ═══════════════════════════════════════
  // BROKER CONFIG
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/broker-config', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    let config = await prisma.brokerConfig.findUnique({ where: { tenant_id: tenantId } });
    if (!config) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      config = await prisma.brokerConfig.create({ data: { tenant_id: tenantId, company_name: tenant?.name || '' } });
    }
    reply.send({ data: config });
  });

  fastify.patch('/api/v1/crm/broker-config', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const body = request.body as any;
    // Only admin can update SMTP settings
    const ud = (request as any).userData || {};
    if (ud.role !== 'admin' && (body.smtp_host || body.smtp_user || body.smtp_pass)) {
      return reply.status(403).send({ error: 'Only admin can configure SMTP', code: 'FORBIDDEN' });
    }
    let config = await prisma.brokerConfig.findUnique({ where: { tenant_id: tenantId } });
    if (!config) {
      config = await prisma.brokerConfig.create({ data: { tenant_id: tenantId } });
    }
    const updated = await prisma.brokerConfig.update({ where: { tenant_id: tenantId }, data: body });
    reply.send({ data: updated });
  });

  // ═══════════════════════════════════════
  // EMAIL TEMPLATES
  // ═══════════════════════════════════════

  fastify.get('/api/v1/crm/email-templates', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const q = request.query as any;
    const where: any = { tenant_id: tenantId };
    if (q.category) where.category = q.category;
    if (q.active !== undefined) where.is_active = q.active === 'true';
    const templates = await prisma.emailTemplate.findMany({ where, orderBy: { created_at: 'desc' } });
    reply.send({ data: templates });
  });

  fastify.post('/api/v1/crm/email-templates', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const ud = (request as any).userData || {};
    const body = z.object({
      name: z.string().min(1),
      subject: z.string().min(1),
      body_html: z.string().min(1),
      category: z.string().optional().default('CUSTOM'),
    }).parse(request.body);

    const template = await prisma.emailTemplate.create({
      data: { tenant_id: tenantId, ...body, created_by: ud.sub || '' },
    });
    logger.info({ templateId: template.id, name: body.name }, '[Email] Template created');
    reply.status(201).send({ data: template });
  });

  fastify.patch('/api/v1/crm/email-templates/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    const body = request.body as any;
    await prisma.emailTemplate.updateMany({ where: { id, tenant_id: tenantId }, data: body });
    const template = await prisma.emailTemplate.findUnique({ where: { id } });
    reply.send({ data: template });
  });

  fastify.delete('/api/v1/crm/email-templates/:id', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const { id } = request.params as any;
    await prisma.emailTemplate.deleteMany({ where: { id, tenant_id: tenantId } });
    reply.send({ success: true });
  });

  // ═══════════════════════════════════════
  // SEND EMAIL
  // ═══════════════════════════════════════

  fastify.post('/api/v1/crm/email/send', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const ud = (request as any).userData || {};
    const body = z.object({
      lead_id: z.string().uuid().optional(),
      to_email: z.string().email(),
      to_name: z.string().optional().default(''),
      template_id: z.string().uuid().optional(),
      subject: z.string().optional(),
      body_html: z.string().optional(),
    }).parse(request.body);

    // Get broker config for branding + SMTP
    const config = await prisma.brokerConfig.findUnique({ where: { tenant_id: tenantId } });

    // Get lead info for variables
    let leadVars: Record<string, string> = {};
    if (body.lead_id) {
      const lead = await prisma.lead.findFirst({ where: { id: body.lead_id, tenant_id: tenantId } });
      if (lead) {
        leadVars = {
          first_name: lead.first_name,
          last_name: lead.last_name,
          full_name: `${lead.first_name} ${lead.last_name}`,
          email: lead.email,
          phone: lead.phone,
          country: lead.country,
          lead_number: String(lead.lead_number),
        };
      }
    }

    // Broker variables
    const brokerVars: Record<string, string> = {
      company_name: config?.company_name || '',
      website: config?.website || '',
      support_email: config?.support_email || '',
      support_phone: config?.support_phone || '',
      logo_url: config?.logo_url || '',
    };

    const allVars = { ...brokerVars, ...leadVars, to_name: body.to_name };

    // Resolve subject and body from template or direct input
    let subject = body.subject || '';
    let bodyHtml = body.body_html || '';

    if (body.template_id) {
      const template = await prisma.emailTemplate.findFirst({ where: { id: body.template_id, tenant_id: tenantId } });
      if (template) {
        subject = subject || template.subject;
        bodyHtml = bodyHtml || template.body_html;
      }
    }

    if (!subject || !bodyHtml) {
      return reply.status(400).send({ error: 'Subject and body required', code: 'INVALID' });
    }

    // Replace variables
    subject = replaceVariables(subject, allVars);
    bodyHtml = replaceVariables(bodyHtml, allVars);

    // Wrap in branded template
    const fullHtml = wrapEmailHtml(bodyHtml, config);

    // Try to send via SMTP
    let status = 'SENT';
    let error = '';

    const smtp = await getTransporter(tenantId);
    if (smtp) {
      try {
        await smtp.transporter.sendMail({
          from: smtp.from,
          to: `"${body.to_name}" <${body.to_email}>`,
          subject,
          html: fullHtml,
        });
        logger.info({ to: body.to_email, subject }, '[Email] Sent successfully');
      } catch (e: any) {
        status = 'FAILED';
        error = e.message;
        logger.error({ to: body.to_email, error: e.message }, '[Email] Send failed');
      }
    } else {
      // No SMTP configured — log as sent for demo (email stored in log)
      logger.warn({ tenantId }, '[Email] No SMTP configured — email logged but not actually sent');
    }

    // Log the email
    const log = await prisma.emailLog.create({
      data: {
        tenant_id: tenantId,
        lead_id: body.lead_id || null,
        template_id: body.template_id || null,
        to_email: body.to_email,
        to_name: body.to_name,
        subject,
        body_html: fullHtml,
        status,
        sent_by: ud.sub || '',
        error,
      },
    });

    // Add note to lead
    if (body.lead_id) {
      await prisma.note.create({
        data: { tenant_id: tenantId, lead_id: body.lead_id, author_id: ud.sub || '', content: `Email sent: "${subject}"`, type: 'EMAIL' },
      });
      await prisma.lead.update({ where: { id: body.lead_id }, data: { notes_count: { increment: 1 }, last_contact: new Date() } });
    }

    reply.send({ data: { id: log.id, status, error: error || undefined } });
  });

  // GET email history for a lead
  fastify.get('/api/v1/crm/email/history', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const q = request.query as any;
    const where: any = { tenant_id: tenantId };
    if (q.lead_id) where.lead_id = q.lead_id;
    const emails = await prisma.emailLog.findMany({ where, orderBy: { created_at: 'desc' }, take: parseInt(q.limit) || 50 });
    reply.send({ data: emails });
  });

  // GET available template variables
  fastify.get('/api/v1/crm/email/variables', { preHandler: auth }, async (request, reply) => {
    reply.send({
      data: {
        lead: ['first_name', 'last_name', 'full_name', 'email', 'phone', 'country', 'lead_number'],
        broker: ['company_name', 'website', 'support_email', 'support_phone', 'logo_url'],
        other: ['to_name'],
      },
    });
  });

  // ─── Seed default templates ───
  fastify.post('/api/v1/crm/email-templates/seed', { preHandler: auth }, async (request, reply) => {
    const { tenantId } = request as any;
    const ud = (request as any).userData || {};
    const defaults = [
      {
        name: 'Welcome', category: 'WELCOME',
        subject: 'Welcome to {{company_name}}, {{first_name}}!',
        body_html: `<h2>Welcome, {{first_name}}!</h2>
<p>We're excited to have you join <strong>{{company_name}}</strong>. Your account is ready for you to explore the world of trading.</p>
<p>Here's what you can do next:</p>
<ul><li>Complete your profile verification</li><li>Make your first deposit</li><li>Start trading on our platform</li></ul>
<a href="{{website}}" class="btn">Get Started</a>
<p>If you have any questions, our team is here to help.</p>
<p>Best regards,<br/>The {{company_name}} Team</p>`,
      },
      {
        name: 'KYC Request', category: 'KYC',
        subject: '{{first_name}}, please verify your identity',
        body_html: `<h2>Identity Verification Required</h2>
<p>Hi {{first_name}},</p>
<p>To activate your trading account and ensure the security of your funds, we need you to complete our identity verification process.</p>
<p>This only takes a few minutes. You'll need:</p>
<ul><li>A valid ID document (passport, national ID, or residence permit)</li><li>A proof of address (utility bill, bank statement)</li><li>A selfie for identity confirmation</li></ul>
<p>Your dedicated account manager is ready to assist you if needed.</p>
<p>Best regards,<br/>{{company_name}}</p>`,
      },
      {
        name: 'First Deposit Bonus', category: 'DEPOSIT',
        subject: '{{first_name}}, your trading bonus is waiting!',
        body_html: `<h2>Exclusive Deposit Bonus</h2>
<p>Hi {{first_name}},</p>
<p>Great news! We have a special offer just for you. Make your first deposit today and receive a <strong>bonus</strong> on your trading account.</p>
<p>Don't miss this opportunity to boost your trading capital.</p>
<a href="{{website}}" class="btn">Deposit Now</a>
<p>Need help? Contact us at <a href="mailto:{{support_email}}">{{support_email}}</a></p>
<p>Happy trading!<br/>{{company_name}}</p>`,
      },
      {
        name: 'Re-engagement', category: 'RETENTION',
        subject: 'We miss you, {{first_name}}!',
        body_html: `<h2>Come Back to Trading</h2>
<p>Hi {{first_name}},</p>
<p>We noticed you haven't traded in a while. The markets are moving and opportunities are everywhere!</p>
<p>Log in today and see what's happening:</p>
<ul><li>New instruments available</li><li>Improved trading conditions</li><li>Dedicated support for your portfolio</li></ul>
<a href="{{website}}" class="btn">Start Trading</a>
<p>We're here to support your trading journey.</p>
<p>Best regards,<br/>{{company_name}}</p>`,
      },
      {
        name: 'Promotion', category: 'PROMOTION',
        subject: 'Special offer for you, {{first_name}}!',
        body_html: `<h2>Limited Time Offer</h2>
<p>Hi {{first_name}},</p>
<p>We have an exclusive promotion available for a limited time. Take advantage of special trading conditions.</p>
<p>Contact your account manager for details.</p>
<a href="{{website}}" class="btn">Learn More</a>
<p>Best regards,<br/>{{company_name}}</p>`,
      },
    ];

    let created = 0;
    for (const t of defaults) {
      const exists = await prisma.emailTemplate.findFirst({ where: { tenant_id: tenantId, name: t.name } });
      if (!exists) {
        await prisma.emailTemplate.create({ data: { tenant_id: tenantId, ...t, created_by: ud.sub || '' } });
        created++;
      }
    }
    reply.send({ data: { created, total: defaults.length } });
  });
}
