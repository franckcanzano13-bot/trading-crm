/**
 * Phase 1.2 — Email verification for trader accounts.
 *
 *   register → user created with email_verified_at = null, verification
 *              email sent (purpose EMAIL_VERIFY, 24 h, single use)
 *   POST /api/v1/auth/email/verify   { token }      → marks the address verified
 *   POST /api/v1/auth/email/resend   (bearer)       → new link, 3 / hour / IP
 *
 * What an unverified account can do: log in, see prices, browse. What it
 * cannot do: place orders (requireVerifiedEmail on POST /orders and
 * /orders/oco → 403 EMAIL_NOT_VERIFIED). Deposits are admin-side today, so
 * nothing else is gated. Brokers can opt out per tenant with
 * `{"require_email_verification": false}` in tenant.config; staff can also
 * mark a client verified manually (PATCH /admin/clients/:id).
 *
 * Existing users are grandfathered by the migration (email_verified_at set
 * to the migration time), so nobody already trading gets locked out.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../../shared/database/prisma';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth } from '../../shared/middleware/auth';
import { audit } from '../../shared/audit';
import { logger } from '../../shared/utils/index';
import { sendTenantEmail } from '../notifications/mailer';
import { hashToken } from './password-reset';

export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

const VerifySchema = z.object({ token: z.string().min(32).max(128) });

/** Per-tenant opt-out: `{"require_email_verification": false}` in tenant.config. */
export function tenantRequiresEmailVerification(configJson: string | undefined | null): boolean {
  if (!configJson) return true;
  try {
    const cfg = JSON.parse(configJson) as { require_email_verification?: unknown };
    return cfg.require_email_verification !== false;
  } catch {
    return true;
  }
}

async function webBaseUrl(tenantId: string): Promise<string> {
  if (process.env.WEB_BASE_URL) return process.env.WEB_BASE_URL.replace(/\/$/, '');
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { domain: true } });
  return tenant?.domain ? `https://${tenant.domain}` : '';
}

/**
 * Issue a fresh EMAIL_VERIFY token for a user (invalidating live ones) and
 * send the link. Returns the raw token so tests and admin tooling can use it.
 * Never throws: registration must succeed even if SMTP is down.
 */
export async function issueEmailVerification(params: { tenantId: string; userId: string; email: string; name: string; ip?: string }) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
  await prisma.$transaction([
    // tenant-scope: row already selected by its globally unique token hash
    prisma.authToken.updateMany({
      where: { tenant_id: params.tenantId, purpose: 'EMAIL_VERIFY', subject_type: 'USER', subject_id: params.userId, used_at: null },
      data: { used_at: new Date() },
    }),
    prisma.authToken.create({
      data: {
        tenant_id: params.tenantId, purpose: 'EMAIL_VERIFY', subject_type: 'USER', subject_id: params.userId,
        token_hash: hashToken(raw), expires_at: expiresAt, request_ip: params.ip || '',
      },
    }),
  ]);
  const base = await webBaseUrl(params.tenantId);
  const link = `${base}/verify-email?tenant=${params.tenantId}&token=${raw}`;
  const result = await sendTenantEmail(params.tenantId, {
    to: params.email, toName: params.name, subject: 'Confirm your email address',
    bodyHtml: `
      <h2>Welcome${params.name ? `, ${params.name}` : ''}</h2>
      <p>Please confirm your email address to activate trading on your account. This link is valid for 24 hours.</p>
      <p><a class="btn" href="${link}">Confirm my email</a></p>
      <p style="font-size:13px;color:#666">If the button does not work, copy this address into your browser:<br/>${link}</p>`,
  });
  if (result.status !== 'SENT' && process.env.NODE_ENV !== 'production') {
    logger.warn({ tenantId: params.tenantId, to: params.email, link }, '[email-verify] SMTP unavailable — verification link logged (non-production only)');
  }
  await audit.log({ tenantId: params.tenantId, actorId: params.userId, actorType: 'trader', action: 'EMAIL_VERIFICATION_SENT', target: `user:${params.userId}`, details: { delivery: result.status }, ip: params.ip });
  return { raw, expiresAt, delivery: result.status };
}

/**
 * preHandler for money-moving trader routes. Runs after tenantResolver +
 * requireAuth. One indexed query per call (users.id is the PK).
 */
export async function requireVerifiedEmail(request: FastifyRequest, reply: FastifyReply) {
  if (!tenantRequiresEmailVerification(request.tenantConfig)) return;
  const userId = request.userData?.sub;
  if (!userId) return reply.status(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  const user = await prisma.user.findFirst({ where: { id: userId, tenant_id: request.tenantId! }, select: { email_verified_at: true } });
  if (!user) return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
  if (!user.email_verified_at) {
    return reply.status(403).send({
      error: 'Please confirm your email address before trading. Check your inbox or request a new link.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
}

export async function emailVerificationRoutes(fastify: FastifyInstance) {
  // Public: the token identifies tenant + user on its own.
  fastify.post('/api/v1/auth/email/verify', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = VerifySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const row = await prisma.authToken.findUnique({ where: { token_hash: hashToken(parsed.data.token) } });
    if (!row || row.purpose !== 'EMAIL_VERIFY' || row.subject_type !== 'USER') {
      return reply.status(400).send({ error: 'Invalid verification link', code: 'INVALID_TOKEN' });
    }
    if (row.used_at) return reply.status(400).send({ error: 'This verification link has already been used', code: 'TOKEN_USED' });
    if (row.expires_at.getTime() < Date.now()) return reply.status(400).send({ error: 'This verification link has expired', code: 'TOKEN_EXPIRED' });

    const ok = await prisma.$transaction(async (tx) => {
      // tenant-scope: row already selected by its globally unique token hash
      const marked = await tx.authToken.updateMany({ where: { id: row.id, used_at: null }, data: { used_at: new Date() } });
      if (marked.count === 0) return false;
      await tx.user.updateMany({ where: { id: row.subject_id, tenant_id: row.tenant_id, email_verified_at: null }, data: { email_verified_at: new Date() } });
      return true;
    });
    if (!ok) return reply.status(400).send({ error: 'This verification link has already been used', code: 'TOKEN_USED' });

    await audit.log({ tenantId: row.tenant_id, actorId: row.subject_id, actorType: 'trader', action: 'EMAIL_VERIFIED', target: `user:${row.subject_id}`, ip: request.ip });
    logger.info({ tenantId: row.tenant_id, userId: row.subject_id }, '[email-verify] verified');
    return reply.send({ data: { ok: true } });
  });

  // Authenticated: resend the link to the account's address.
  fastify.post('/api/v1/auth/email/resend', {
    preHandler: [tenantResolver, requireAuth],
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const user = await request.tenantQuery!.findUserById(request.userData!.sub);
    if (!user) return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
    if (user.email_verified_at) return reply.send({ data: { ok: true, already_verified: true } });
    const { delivery } = await issueEmailVerification({ tenantId, userId: user.id, email: user.email, name: user.name, ip: request.ip });
    return reply.send({ data: { ok: true, delivery } });
  });
}
