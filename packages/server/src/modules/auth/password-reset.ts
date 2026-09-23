/**
 * Phase 1.1 — "Forgot password" for traders (USER) and broker staff (ADMIN).
 *
 * Flow:
 *   POST /api/v1/auth/password/forgot   { email }               → always 200
 *   POST /api/v1/admin/password/forgot  { email, tenant_id }    → always 200
 *   POST /api/v1/auth/password/reset    { token, password }     → 200 | 400
 *   POST /api/v1/admin/password/reset   { token, password }     → 200 | 400
 *
 * Security properties:
 *   - No account enumeration: forgot returns the same 200 whether or not the
 *     email exists; the only difference is whether an email goes out.
 *   - Token is 32 random bytes, sent once in the email link; only its SHA-256
 *     is stored. Single use, 30 minute TTL, previous tokens for the same
 *     subject are invalidated when a new one is issued.
 *   - Rate-limited per IP (3 / 15 min) on the forgot endpoints.
 *   - Every step is audited: PASSWORD_RESET_REQUESTED / _COMPLETED / _REJECTED.
 *   - Reset also clears nothing else on purpose (2FA stays enabled for staff).
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@tradexlabel/shared';
import { prisma } from '../../shared/database/prisma';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { audit } from '../../shared/audit';
import { logger } from '../../shared/utils/index';
import { sendTenantEmail } from '../notifications/mailer';

export type ResetSubjectType = 'USER' | 'ADMIN';

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const ForgotSchema = z.object({ email: z.string().email() });
const AdminForgotSchema = ForgotSchema.extend({ tenant_id: z.string().uuid() });
const ResetSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(128),
});

export const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

/**
 * Issue a new token for a subject, invalidating any still-valid previous
 * ones. Returns the RAW token (never stored). Exported for tests and for
 * an eventual admin-triggered "send reset link" action.
 */
export async function issuePasswordResetToken(params: {
  tenantId: string; subjectType: ResetSubjectType; subjectId: string; ip?: string;
}): Promise<{ raw: string; expiresAt: Date }> {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { tenant_id: params.tenantId, subject_type: params.subjectType, subject_id: params.subjectId, used_at: null },
      data: { used_at: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        tenant_id: params.tenantId,
        subject_type: params.subjectType,
        subject_id: params.subjectId,
        token_hash: hashToken(raw),
        expires_at: expiresAt,
        request_ip: params.ip || '',
      },
    }),
  ]);
  return { raw, expiresAt };
}

/** Base URL of the broker's web app, for the link in the email. */
async function webBaseUrl(tenantId: string): Promise<string> {
  if (process.env.WEB_BASE_URL) return process.env.WEB_BASE_URL.replace(/\/$/, '');
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { domain: true } });
  return tenant?.domain ? `https://${tenant.domain}` : '';
}

async function sendResetEmail(params: {
  tenantId: string; to: string; name: string; raw: string; subjectType: ResetSubjectType; expiresAt: Date;
}) {
  const base = await webBaseUrl(params.tenantId);
  const path = params.subjectType === 'ADMIN' ? '/reset-password?type=admin' : '/reset-password?type=user';
  const link = `${base}${path}&tenant=${params.tenantId}&token=${params.raw}`;
  const minutes = Math.round(RESET_TOKEN_TTL_MS / 60000);
  const result = await sendTenantEmail(params.tenantId, {
    to: params.to,
    toName: params.name,
    subject: 'Reset your password',
    bodyHtml: `
      <h2>Reset your password</h2>
      <p>Hello ${params.name || ''},</p>
      <p>We received a request to reset the password of your account. This link is valid for ${minutes} minutes and can be used once.</p>
      <p><a class="btn" href="${link}">Choose a new password</a></p>
      <p style="font-size:13px;color:#666">If the button does not work, copy this address into your browser:<br/>${link}</p>
      <p style="font-size:13px;color:#666">If you did not ask for this, you can ignore this email. Your password has not changed.</p>`,
  });
  if (result.status !== 'SENT') {
    // Dev/staging without SMTP: keep the flow testable without leaking the
    // token in production logs.
    if (process.env.NODE_ENV !== 'production') {
      logger.warn({ tenantId: params.tenantId, to: params.to, link }, '[password-reset] SMTP unavailable — reset link logged (non-production only)');
    }
  }
  return result;
}

/** Look the token up, validate it, and return the row (or a rejection reason). */
async function consumeToken(raw: string, subjectType: ResetSubjectType) {
  const row = await prisma.passwordResetToken.findUnique({ where: { token_hash: hashToken(raw) } });
  if (!row || row.subject_type !== subjectType) return { error: 'INVALID_TOKEN' as const };
  if (row.used_at) return { error: 'TOKEN_USED' as const, row };
  if (row.expires_at.getTime() < Date.now()) return { error: 'TOKEN_EXPIRED' as const, row };
  return { row };
}

const ip = (request: FastifyRequest) => request.ip || '';

export async function passwordResetRoutes(fastify: FastifyInstance) {
  // ── Trader: forgot ────────────────────────────────────────────────────────
  fastify.post('/api/v1/auth/password/forgot', {
    preHandler: [tenantResolver],
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = ForgotSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const tenantId = request.tenantId!;
    const user = await request.tenantQuery!.findUserByEmail(parsed.data.email);
    if (user && user.status !== 'BLOCKED') {
      const { raw, expiresAt } = await issuePasswordResetToken({ tenantId, subjectType: 'USER', subjectId: user.id, ip: ip(request) });
      await sendResetEmail({ tenantId, to: user.email, name: user.name, raw, subjectType: 'USER', expiresAt });
      await audit.log({ tenantId, actorId: user.id, actorType: 'trader', action: 'PASSWORD_RESET_REQUESTED', target: `user:${user.id}`, ip: ip(request) });
    }
    return reply.send({ data: { ok: true, message: 'If an account exists for this email, a reset link has been sent.' } });
  });

  // ── Staff: forgot (tenant given in body, same shape as /admin/login) ──────
  fastify.post('/api/v1/admin/password/forgot', {
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = AdminForgotSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const { email, tenant_id: tenantId } = parsed.data;
    const admin = await prisma.tenantAdmin.findFirst({ where: { tenant_id: tenantId, email, is_active: true } });
    if (admin) {
      const { raw, expiresAt } = await issuePasswordResetToken({ tenantId, subjectType: 'ADMIN', subjectId: admin.id, ip: ip(request) });
      await sendResetEmail({ tenantId, to: admin.email, name: admin.name, raw, subjectType: 'ADMIN', expiresAt });
      await audit.log({ tenantId, actorId: admin.id, actorType: 'admin', action: 'PASSWORD_RESET_REQUESTED', target: `tenant_admin:${admin.id}`, ip: ip(request) });
    }
    return reply.send({ data: { ok: true, message: 'If an account exists for this email, a reset link has been sent.' } });
  });

  // ── Reset (both) ─────────────────────────────────────────────────────────
  const handleReset = (subjectType: ResetSubjectType) => async (request: FastifyRequest, reply: import('fastify').FastifyReply) => {
    const parsed = ResetSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const { token, password } = parsed.data;

    const found = await consumeToken(token, subjectType);
    if (found.error) {
      if (found.row) {
        await audit.log({
          tenantId: found.row.tenant_id, actorId: found.row.subject_id, actorType: subjectType === 'ADMIN' ? 'admin' : 'trader',
          action: 'PASSWORD_RESET_REJECTED', target: `${subjectType === 'ADMIN' ? 'tenant_admin' : 'user'}:${found.row.subject_id}`,
          details: { reason: found.error }, ip: ip(request),
        });
      }
      const messages = { INVALID_TOKEN: 'Invalid reset link', TOKEN_USED: 'This reset link has already been used', TOKEN_EXPIRED: 'This reset link has expired' };
      return reply.status(400).send({ error: messages[found.error], code: found.error });
    }
    const row = found.row;
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Mark used + update the password atomically; a concurrent second submit
    // of the same token loses on updateMany count and gets TOKEN_USED.
    const ok = await prisma.$transaction(async (tx) => {
      const marked = await tx.passwordResetToken.updateMany({ where: { id: row.id, used_at: null }, data: { used_at: new Date() } });
      if (marked.count === 0) return false;
      if (subjectType === 'ADMIN') {
        await tx.tenantAdmin.update({ where: { id: row.subject_id }, data: { password_hash: passwordHash } });
      } else {
        await tx.user.update({ where: { id: row.subject_id }, data: { password_hash: passwordHash } });
      }
      return true;
    });
    if (!ok) return reply.status(400).send({ error: 'This reset link has already been used', code: 'TOKEN_USED' });

    await audit.log({
      tenantId: row.tenant_id, actorId: row.subject_id, actorType: subjectType === 'ADMIN' ? 'admin' : 'trader',
      action: 'PASSWORD_RESET_COMPLETED', target: `${subjectType === 'ADMIN' ? 'tenant_admin' : 'user'}:${row.subject_id}`, ip: ip(request),
    });

    // Best-effort confirmation email.
    const subject = subjectType === 'ADMIN'
      ? await prisma.tenantAdmin.findUnique({ where: { id: row.subject_id }, select: { email: true, name: true } })
      : await prisma.user.findUnique({ where: { id: row.subject_id }, select: { email: true, name: true } });
    if (subject) {
      await sendTenantEmail(row.tenant_id, {
        to: subject.email, toName: subject.name, subject: 'Your password was changed',
        bodyHtml: `<h2>Password changed</h2><p>Hello ${subject.name || ''},</p><p>The password of your account was just changed. If this was not you, contact support immediately.</p>`,
      });
    }
    logger.info({ tenantId: row.tenant_id, subjectType, subjectId: row.subject_id }, '[password-reset] completed');
    return reply.send({ data: { ok: true } });
  };

  fastify.post('/api/v1/auth/password/reset', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, handleReset('USER'));
  fastify.post('/api/v1/admin/password/reset', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, handleReset('ADMIN'));
}
