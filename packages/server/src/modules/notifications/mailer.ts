/**
 * Phase 1.1 — Tenant-branded transactional email.
 *
 * Extracted from crm/email-routes.ts so that non-CRM flows (password reset,
 * later withdrawal confirmations and KYC decisions) send through the same
 * per-broker SMTP settings and the same branded wrapper, and land in the
 * same email_logs table.
 */
import nodemailer from 'nodemailer';
import { prisma } from '../../shared/database/prisma';
import { decrypt } from '../../shared/crypto';
import { logger } from '../../shared/utils/index';

export type BrandingConfig = {
  logo_url?: string;
  company_name?: string;
  primary_color?: string;
  address?: string;
  support_email?: string;
  support_phone?: string;
  website?: string;
};

/** SMTP transporter for a tenant, or null when the broker has not configured SMTP. */
export async function getTransporter(tenantId: string) {
  const config = await prisma.brokerConfig.findUnique({ where: { tenant_id: tenantId } });
  if (!config || !config.smtp_host) return null;
  // Sprint 2.4: smtp_pass stored encrypted — decrypt before use
  const smtpPass = decrypt(config.smtp_pass || '');
  return {
    transporter: nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth: { user: config.smtp_user, pass: smtpPass },
    }),
    from: `"${config.smtp_from_name || config.company_name}" <${config.smtp_from_email || config.smtp_user}>`,
    config,
  };
}

/** Wrap an HTML body in the broker's branded email layout. */
export function wrapEmailHtml(bodyHtml: string, config: BrandingConfig | null | undefined): string {
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

export interface TransactionalEmail {
  to: string;
  toName?: string;
  subject: string;
  /** Inner HTML; the branded wrapper is applied here. */
  bodyHtml: string;
  /** Who triggered it, for email_logs.sent_by ('system' for automated flows). */
  sentBy?: string;
}

export type SendResult = { status: 'SENT' | 'FAILED' | 'NO_SMTP'; error?: string };

/**
 * Send a branded transactional email through the tenant's SMTP and record it
 * in email_logs. Never throws: callers decide whether NO_SMTP/FAILED matters.
 */
export async function sendTenantEmail(tenantId: string, mail: TransactionalEmail): Promise<SendResult> {
  const smtp = await getTransporter(tenantId);
  if (!smtp) {
    logger.warn({ tenantId, to: mail.to, subject: mail.subject }, '[mailer] no SMTP configured for tenant — email not sent');
    return { status: 'NO_SMTP' };
  }
  const html = wrapEmailHtml(mail.bodyHtml, smtp.config);
  let status: 'SENT' | 'FAILED' = 'SENT';
  let error = '';
  try {
    await smtp.transporter.sendMail({ from: smtp.from, to: mail.to, subject: mail.subject, html });
  } catch (err) {
    status = 'FAILED';
    error = err instanceof Error ? err.message : String(err);
    logger.error({ tenantId, to: mail.to, err: error }, '[mailer] send failed');
  }
  await prisma.emailLog.create({
    data: {
      tenant_id: tenantId,
      to_email: mail.to,
      to_name: mail.toName || '',
      subject: mail.subject,
      body_html: html,
      status,
      sent_by: mail.sentBy || 'system',
      error,
    },
  }).catch((err: unknown) => logger.error({ err }, '[mailer] email_logs write failed'));
  return status === 'SENT' ? { status } : { status, error };
}
