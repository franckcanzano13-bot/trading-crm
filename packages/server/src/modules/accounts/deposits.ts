/**
 * Phase 2.5a — Deposit declarations: the client tells the broker "I sent
 * X by <method>, reference <ref>"; staff confirm when the money has
 * arrived, and only then is the account credited — inside one transaction
 * with the DEPOSIT row and the segregation ledger. Until a payment
 * provider is connected (roadmap 2.5b), this is the honest version of the
 * deposit form: nothing is credited on a promise.
 *
 *   Trader (bearer, verified email)
 *     POST /api/v1/deposits            { amount, method, reference? }  → PENDING
 *     GET  /api/v1/deposits                                            → own declarations
 *     POST /api/v1/deposits/:id/cancel                                 → while PENDING
 *   Staff
 *     GET  /api/v1/admin/deposits?status=PENDING
 *     POST /api/v1/admin/deposits/:id/confirm  { amount_received? }   → credits the account
 *     POST /api/v1/admin/deposits/:id/reject   { reason }
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../shared/database/prisma';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth, requireAdmin } from '../../shared/middleware/auth';
import { requireVerifiedEmail } from '../auth/email-verification';
import { recordDeposit } from '../../shared/segregation';
import { audit } from '../../shared/audit';
import { serializeBigInt, logger } from '../../shared/utils/index';
import { notify } from '../notifications/service';

const DeclareSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  method: z.string().min(1).max(40),
  reference: z.string().max(255).optional().default(''),
});
const ConfirmSchema = z.object({ amount_received: z.number().positive().max(10_000_000).optional() });
const RejectSchema = z.object({ reason: z.string().min(1).max(500) });

export const MIN_DEPOSIT_CENTS = 1000n; // $10, matches the client UI

export async function depositRoutes(fastify: FastifyInstance) {
  // ── Trader ────────────────────────────────────────────────────────────────
  fastify.post('/api/v1/deposits', {
    preHandler: [tenantResolver, requireAuth, requireVerifiedEmail],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const parsed = DeclareSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const tenantId = request.tenantId!;
    const userId = request.userData!.sub;
    const tq = request.tenantQuery!;
    const user = await tq.findUserById(userId);
    if (!user) return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
    if (user.status === 'BLOCKED') return reply.status(403).send({ error: 'Account blocked', code: 'ACCOUNT_BLOCKED' });
    const account = await tq.findAccountByUserId(userId);
    if (!account) return reply.status(400).send({ error: 'No trading account', code: 'NO_ACCOUNT' });
    const amountCents = BigInt(Math.round(parsed.data.amount * 100));
    if (amountCents < MIN_DEPOSIT_CENTS) return reply.status(400).send({ error: `Minimum deposit is $${Number(MIN_DEPOSIT_CENTS) / 100}`, code: 'BELOW_MINIMUM' });

    const dr = await prisma.depositRequest.create({
      data: { tenant_id: tenantId, account_id: account.id, user_id: userId, amount_cents: amountCents, method: parsed.data.method, reference: parsed.data.reference, status: 'PENDING' },
    });
    await audit.log({ tenantId, actorId: userId, actorType: 'trader', action: 'DEPOSIT_DECLARED', target: `deposit:${dr.id}`, details: { amount_cents: amountCents, method: parsed.data.method }, ip: request.ip });
    logger.info({ tenantId, userId, depositId: dr.id }, '[deposits] declared');
    return reply.status(201).send({ data: serializeBigInt(dr) });
  });

  fastify.get('/api/v1/deposits', { preHandler: [tenantResolver, requireAuth] }, async (request, reply) => {
    const rows = await prisma.depositRequest.findMany({ where: { tenant_id: request.tenantId!, user_id: request.userData!.sub }, orderBy: { declared_at: 'desc' }, take: 100 });
    return reply.send({ data: serializeBigInt(rows) });
  });

  fastify.post<{ Params: { id: string } }>('/api/v1/deposits/:id/cancel', { preHandler: [tenantResolver, requireAuth] }, async (request, reply) => {
    const tenantId = request.tenantId!; const userId = request.userData!.sub;
    const res = await prisma.depositRequest.updateMany({ where: { id: request.params.id, tenant_id: tenantId, user_id: userId, status: 'PENDING' }, data: { status: 'CANCELLED', decided_at: new Date(), decided_by: userId } });
    if (res.count === 0) return reply.status(404).send({ error: 'No pending declaration with this id', code: 'NOT_FOUND' });
    await audit.log({ tenantId, actorId: userId, actorType: 'trader', action: 'DEPOSIT_CANCELLED', target: `deposit:${request.params.id}`, ip: request.ip });
    return reply.send({ data: { ok: true } });
  });

  // ── Staff ─────────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { status?: string } }>('/api/v1/admin/deposits', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const rows = await prisma.depositRequest.findMany({ where: { tenant_id: request.tenantId!, ...(request.query.status ? { status: request.query.status } : {}) }, orderBy: { declared_at: 'desc' }, take: 200 });
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, tenant_id: request.tenantId! }, select: { id: true, name: true, email: true, kyc_status: true } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return reply.send({ data: serializeBigInt(rows.map((r) => ({ ...r, user: byId.get(r.user_id) || null }))) });
  });

  fastify.post<{ Params: { id: string } }>('/api/v1/admin/deposits/:id/confirm', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const parsed = ConfirmSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const tenantId = request.tenantId!; const adminId = request.userData!.sub; const id = request.params.id;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const dr = await tx.depositRequest.findFirst({ where: { id, tenant_id: tenantId } });
        if (!dr) throw new Error('NOT_FOUND');
        if (dr.status !== 'PENDING') throw new Error('NOT_PENDING');
        const account = await tx.account.findFirst({ where: { id: dr.account_id, tenant_id: tenantId } });
        if (!account) throw new Error('ACCOUNT_NOT_FOUND');
        // Staff may confirm a different amount than declared (bank fees, partial payment); the credited amount is what arrived.
        const credited = parsed.data.amount_received !== undefined ? BigInt(Math.round(parsed.data.amount_received * 100)) : dr.amount_cents;
        if (credited <= 0n) throw new Error('INVALID_AMOUNT');
        const newBalance = BigInt(account.balance) + credited;
        await tx.account.updateMany({ where: { id: account.id, tenant_id: tenantId }, data: { balance: newBalance, equity: BigInt(account.equity) + credited } });
        const transaction = await tx.transaction.create({ data: { tenant_id: tenantId, account_id: account.id, type: 'DEPOSIT', amount: credited, description: `Deposit ${dr.method}${dr.reference ? ` ref ${dr.reference}` : ''} (declaration ${dr.id})` } });
        await recordDeposit(tx, { tenantId, accountId: account.id, amountCents: credited, reference: `transaction:${transaction.id}`, description: `Deposit via ${dr.method}` });
        const marked = await tx.depositRequest.updateMany({ where: { id: dr.id, tenant_id: tenantId, status: 'PENDING' }, data: { status: 'CONFIRMED', credited_cents: credited, decided_at: new Date(), decided_by: adminId, transaction_id: transaction.id } });
        if (marked.count === 0) throw new Error('NOT_PENDING');
        return { dr, credited, transaction, newBalance };
      });
      await audit.log({ tenantId, actorId: adminId, actorType: 'admin', action: 'DEPOSIT_CONFIRMED', target: `deposit:${id}`, details: { declared_cents: result.dr.amount_cents, credited_cents: result.credited, transaction_id: result.transaction.id, user_id: result.dr.user_id }, ip: request.ip });
      notify({ userId: result.dr.user_id, type: 'DEPOSIT', message: `Deposit of $${(Number(result.credited) / 100).toFixed(2)} credited`, details: { deposit_id: id } });
      return reply.send({ data: { id, status: 'CONFIRMED', credited_cents: result.credited.toString(), transaction_id: result.transaction.id, new_balance_cents: result.newBalance.toString() } });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ERROR';
      const map: Record<string, [number, string]> = { NOT_FOUND: [404, 'Deposit declaration not found'], NOT_PENDING: [409, 'Declaration is no longer pending'], ACCOUNT_NOT_FOUND: [404, 'Account not found'], INVALID_AMOUNT: [400, 'Amount must be positive'] };
      if (map[code]) return reply.status(map[code][0]).send({ error: map[code][1], code });
      throw err;
    }
  });

  fastify.post<{ Params: { id: string } }>('/api/v1/admin/deposits/:id/reject', { preHandler: [tenantResolver, requireAdmin] }, async (request, reply) => {
    const parsed = RejectSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'A reason is required', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    const tenantId = request.tenantId!; const adminId = request.userData!.sub; const id = request.params.id;
    const dr = await prisma.depositRequest.findFirst({ where: { id, tenant_id: tenantId } });
    if (!dr) return reply.status(404).send({ error: 'Deposit declaration not found', code: 'NOT_FOUND' });
    const res = await prisma.depositRequest.updateMany({ where: { id, tenant_id: tenantId, status: 'PENDING' }, data: { status: 'REJECTED', decided_at: new Date(), decided_by: adminId, reason: parsed.data.reason } });
    if (res.count === 0) return reply.status(409).send({ error: 'Declaration is no longer pending', code: 'NOT_PENDING' });
    await audit.log({ tenantId, actorId: adminId, actorType: 'admin', action: 'DEPOSIT_REJECTED', target: `deposit:${id}`, details: { reason: parsed.data.reason, user_id: dr.user_id }, ip: request.ip });
    notify({ userId: dr.user_id, type: 'DEPOSIT', message: `Deposit declaration declined: ${parsed.data.reason}`, details: { deposit_id: id } });
    return reply.send({ data: { id, status: 'REJECTED' } });
  });
}
