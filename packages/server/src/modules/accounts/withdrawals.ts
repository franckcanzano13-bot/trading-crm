/**
 * Phase 1.5 — Withdrawal requests: client asks, staff decides, money moves
 * only on approval, inside one transaction with the segregation ledger.
 *
 *   Trader (bearer, verified email, KYC approved)
 *     POST   /api/v1/withdrawals              { amount }        → PENDING request
 *     GET    /api/v1/withdrawals                                → own requests
 *     POST   /api/v1/withdrawals/:id/cancel                     → while PENDING
 *   Staff (admin)
 *     GET    /api/v1/admin/withdrawals?status=PENDING
 *     POST   /api/v1/admin/withdrawals/:id/approve              → debit + WITHDRAWAL transaction + ledger
 *     POST   /api/v1/admin/withdrawals/:id/reject  { reason }
 *
 * Available for withdrawal = balance − margin_used − sum(other PENDING
 * requests). Approval re-checks inside the transaction so a trade opened
 * in between cannot push the account negative. Everything is audited:
 * WITHDRAWAL_REQUESTED / _CANCELLED / _APPROVED / _REJECTED.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth, requireAdmin } from '../../shared/middleware/auth';
import { requireVerifiedEmail } from '../auth/email-verification';
import { recordWithdrawal } from '../../shared/segregation';
import { audit } from '../../shared/audit';
import { serializeBigInt, logger } from '../../shared/utils/index';
import { notify } from '../notifications/service';
import { sendTenantEmail } from '../notifications/mailer';

const RequestSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  method: z.string().max(40).optional().default(''),
  destination: z.string().max(255).optional().default(''),
});
const RejectSchema = z.object({ reason: z.string().min(1).max(500) });

export const MIN_WITHDRAWAL_CENTS = 5000n; // $50, matches the client UI

/** Cents available for a new request on this account (never negative). */
export async function availableForWithdrawal(tenantId: string, accountId: string, excludeRequestId?: string): Promise<bigint> {
  const account = await prisma.account.findFirst({ where: { id: accountId, tenant_id: tenantId } });
  if (!account) return 0n;
  const pending = await prisma.withdrawalRequest.aggregate({
    where: { tenant_id: tenantId, account_id: accountId, status: 'PENDING', ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}) },
    _sum: { amount_cents: true },
  });
  const reserved = pending._sum.amount_cents ?? 0n;
  const free = BigInt(account.balance) - BigInt(account.margin_used) - reserved;
  return free < 0n ? 0n : free;
}

export async function withdrawalRoutes(fastify: FastifyInstance) {
  // ── Trader ────────────────────────────────────────────────────────────────
  fastify.post('/api/v1/withdrawals', {
    preHandler: [tenantResolver, requireAuth, requireVerifiedEmail],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = RequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const tenantId = request.tenantId!;
    const userId = request.userData!.sub;
    const tq = request.tenantQuery!;

    const user = await tq.findUserById(userId);
    if (!user) return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
    if (user.status === 'BLOCKED') return reply.status(403).send({ error: 'Account blocked', code: 'ACCOUNT_BLOCKED' });
    if (user.kyc_status !== 'APPROVED') {
      return reply.status(403).send({ error: 'Identity verification (KYC) must be approved before withdrawing.', code: 'KYC_REQUIRED' });
    }
    const account = await tq.findAccountByUserId(userId);
    if (!account) return reply.status(400).send({ error: 'No trading account', code: 'NO_ACCOUNT' });

    const amountCents = BigInt(Math.round(parsed.data.amount * 100));
    if (amountCents < MIN_WITHDRAWAL_CENTS) {
      return reply.status(400).send({ error: `Minimum withdrawal is $${Number(MIN_WITHDRAWAL_CENTS) / 100}`, code: 'BELOW_MINIMUM' });
    }
    const available = await availableForWithdrawal(tenantId, account.id);
    if (amountCents > available) {
      return reply.status(400).send({
        error: `Insufficient funds: $${(Number(available) / 100).toFixed(2)} available after margin and pending requests.`,
        code: 'INSUFFICIENT_FUNDS',
        available_cents: available.toString(),
      });
    }

    const wr = await prisma.withdrawalRequest.create({
      data: {
        tenant_id: tenantId, account_id: account.id, user_id: userId,
        amount_cents: amountCents, method: parsed.data.method, destination: parsed.data.destination, status: 'PENDING',
      },
    });
    await audit.log({ tenantId, actorId: userId, actorType: 'trader', action: 'WITHDRAWAL_REQUESTED', target: `withdrawal:${wr.id}`, details: { amount_cents: amountCents, account_id: account.id }, ip: request.ip });
    logger.info({ tenantId, userId, withdrawalId: wr.id, amountCents: amountCents.toString() }, '[withdrawals] requested');
    return reply.status(201).send({ data: serializeBigInt(wr) });
  });

  fastify.get('/api/v1/withdrawals', { preHandler: [tenantResolver, requireAuth] }, async (request, reply) => {
    const rows = await prisma.withdrawalRequest.findMany({
      where: { tenant_id: request.tenantId!, user_id: request.userData!.sub },
      orderBy: { requested_at: 'desc' }, take: 100,
    });
    return reply.send({ data: serializeBigInt(rows) });
  });

  fastify.post<{ Params: { id: string } }>('/api/v1/withdrawals/:id/cancel', { preHandler: [tenantResolver, requireAuth] }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const userId = request.userData!.sub;
    const res = await prisma.withdrawalRequest.updateMany({
      where: { id: request.params.id, tenant_id: tenantId, user_id: userId, status: 'PENDING' },
      data: { status: 'CANCELLED', decided_at: new Date(), decided_by: userId },
    });
    if (res.count === 0) return reply.status(404).send({ error: 'No pending request with this id', code: 'NOT_FOUND' });
    await audit.log({ tenantId, actorId: userId, actorType: 'trader', action: 'WITHDRAWAL_CANCELLED', target: `withdrawal:${request.params.id}`, ip: request.ip });
    return reply.send({ data: { ok: true } });
  });

  // ── Staff ─────────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { status?: string } }>('/api/v1/admin/withdrawals', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const status = request.query.status;
    const rows = await prisma.withdrawalRequest.findMany({
      where: { tenant_id: request.tenantId!, ...(status ? { status } : {}) },
      orderBy: { requested_at: 'desc' }, take: 200,
    });
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds }, tenant_id: request.tenantId! }, select: { id: true, name: true, email: true, kyc_status: true } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return reply.send({ data: serializeBigInt(rows.map((r) => ({ ...r, user: byId.get(r.user_id) || null }))) });
  });

  fastify.post<{ Params: { id: string } }>('/api/v1/admin/withdrawals/:id/approve', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const adminId = request.userData!.sub;
    const id = request.params.id;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const wr = await tx.withdrawalRequest.findFirst({ where: { id, tenant_id: tenantId } });
        if (!wr) throw new Error('NOT_FOUND');
        if (wr.status !== 'PENDING') throw new Error('NOT_PENDING');
        const account = await tx.account.findFirst({ where: { id: wr.account_id, tenant_id: tenantId } });
        if (!account) throw new Error('ACCOUNT_NOT_FOUND');
        const free = BigInt(account.balance) - BigInt(account.margin_used);
        if (wr.amount_cents > free) throw new Error('INSUFFICIENT_FUNDS');

        const newBalance = BigInt(account.balance) - wr.amount_cents;
        await tx.account.updateMany({ where: { id: account.id, tenant_id: tenantId }, data: { balance: newBalance, equity: BigInt(account.equity) - wr.amount_cents } });
        const transaction = await tx.transaction.create({
          data: { tenant_id: tenantId, account_id: account.id, type: 'WITHDRAWAL', amount: -wr.amount_cents, description: `Withdrawal request ${wr.id}` },
        });
        await recordWithdrawal(tx, { tenantId, accountId: account.id, amountCents: wr.amount_cents, reference: `transaction:${transaction.id}`, description: `Withdrawal request ${wr.id}` });
        const marked = await tx.withdrawalRequest.updateMany({
          where: { id: wr.id, tenant_id: tenantId, status: 'PENDING' },
          data: { status: 'APPROVED', decided_at: new Date(), decided_by: adminId, transaction_id: transaction.id },
        });
        if (marked.count === 0) throw new Error('NOT_PENDING');
        return { wr, transaction, newBalance };
      });

      await audit.log({ tenantId, actorId: adminId, actorType: 'admin', action: 'WITHDRAWAL_APPROVED', target: `withdrawal:${id}`, details: { amount_cents: result.wr.amount_cents, transaction_id: result.transaction.id, user_id: result.wr.user_id }, ip: request.ip });
      notify({ userId: result.wr.user_id, type: 'WITHDRAWAL', message: `Withdrawal of $${(Number(result.wr.amount_cents) / 100).toFixed(2)} approved`, details: { withdrawal_id: id } });
      const user = await prisma.user.findUnique({ where: { id: result.wr.user_id }, select: { email: true, name: true } });
      if (user) {
        await sendTenantEmail(tenantId, { to: user.email, toName: user.name, subject: 'Your withdrawal has been approved', sentBy: adminId,
          bodyHtml: `<h2>Withdrawal approved</h2><p>Hello ${user.name || ''},</p><p>Your withdrawal of <strong>$${(Number(result.wr.amount_cents) / 100).toFixed(2)}</strong> has been approved and is being processed.</p>` });
      }
      return reply.send({ data: { id, status: 'APPROVED', transaction_id: result.transaction.id, new_balance_cents: result.newBalance.toString() } });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ERROR';
      const map: Record<string, [number, string]> = {
        NOT_FOUND: [404, 'Withdrawal request not found'], NOT_PENDING: [409, 'Request is no longer pending'],
        ACCOUNT_NOT_FOUND: [404, 'Account not found'], INSUFFICIENT_FUNDS: [400, 'Insufficient free balance at approval time'],
      };
      if (map[code]) return reply.status(map[code][0]).send({ error: map[code][1], code });
      throw err;
    }
  });

  fastify.post<{ Params: { id: string } }>('/api/v1/admin/withdrawals/:id/reject', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const parsed = RejectSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'A reason is required', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const tenantId = request.tenantId!;
    const adminId = request.userData!.sub;
    const id = request.params.id;
    const wr = await prisma.withdrawalRequest.findFirst({ where: { id, tenant_id: tenantId } });
    if (!wr) return reply.status(404).send({ error: 'Withdrawal request not found', code: 'NOT_FOUND' });
    const res = await prisma.withdrawalRequest.updateMany({
      where: { id, tenant_id: tenantId, status: 'PENDING' },
      data: { status: 'REJECTED', decided_at: new Date(), decided_by: adminId, reason: parsed.data.reason },
    });
    if (res.count === 0) return reply.status(409).send({ error: 'Request is no longer pending', code: 'NOT_PENDING' });
    await audit.log({ tenantId, actorId: adminId, actorType: 'admin', action: 'WITHDRAWAL_REJECTED', target: `withdrawal:${id}`, details: { reason: parsed.data.reason, user_id: wr.user_id }, ip: request.ip });
    notify({ userId: wr.user_id, type: 'WITHDRAWAL', message: `Withdrawal request declined: ${parsed.data.reason}`, details: { withdrawal_id: id } });
    return reply.send({ data: { id, status: 'REJECTED' } });
  });
}
