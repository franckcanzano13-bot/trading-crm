import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAdmin } from '../../shared/middleware/auth';
import { serializeBigInt } from '../../shared/utils/index';
import { prisma } from '../../shared/database/prisma';

const UpdateClientSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']).optional(),
  kyc_status: z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
  name: z.string().min(1).optional(),
});

export async function adminClientRoutes(fastify: FastifyInstance) {
  // List clients (admin)
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/api/v1/admin/clients', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 200);
    const offset = parseInt(request.query.offset || '0', 10);
    const users = await request.tenantQuery!.listUsers(limit, offset);
    return reply.send({ data: serializeBigInt(users) });
  });

  // Update client (admin)
  fastify.patch<{ Params: { id: string } }>('/api/v1/admin/clients/:id', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const parsed = UpdateClientSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const user = await request.tenantQuery!.updateUser(request.params.id, parsed.data);
    if (!user) {
      return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    return reply.send({ data: serializeBigInt(user) });
  });

  // Dashboard stats (admin)
  fastify.get('/api/v1/admin/dashboard', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const stats = await request.tenantQuery!.getDashboardStats();
    return reply.send({ data: serializeBigInt(stats) });
  });

  // List instruments (admin)
  fastify.get('/api/v1/admin/instruments', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const instruments = await request.tenantQuery!.listInstruments(false);
    return reply.send({ data: instruments });
  });

  // Update instrument (admin)
  fastify.patch<{ Params: { id: string } }>('/api/v1/admin/instruments/:id', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as any;
    const instrument = await request.tenantQuery!.updateInstrument(request.params.id, {
      spread_markup: body.spread_markup,
      is_active: body.is_active,
      min_volume: body.min_volume,
      max_volume: body.max_volume,
    });
    return reply.send({ data: instrument });
  });

  // Deposit to account (admin)
  fastify.post<{ Params: { id: string } }>('/api/v1/admin/accounts/:id/deposit', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const { amount, description } = request.body as { amount: number; description?: string };
    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: 'Invalid amount', code: 'INVALID_AMOUNT' });
    }

    const amountCents = BigInt(Math.round(amount * 100));
    const tenantId = request.tenantId!;
    const accountId = request.params.id;

    // EXEC-001: Atomic deposit — re-reads account inside tx to avoid TOCTOU.
    let newBalance: bigint;
    try {
      newBalance = await prisma.$transaction(async (tx) => {
        const account = await tx.account.findFirst({
          where: { id: accountId, tenant_id: tenantId },
        });
        if (!account) {
          throw new Error('ACCOUNT_NOT_FOUND');
        }

        const balanceRaw = BigInt(account.balance) + amountCents;
        // ESMA Negative Balance Protection: clamp to 0
        const safeBalance = balanceRaw < 0n ? 0n : balanceRaw;
        const safeEquity = safeBalance;

        await tx.account.updateMany({
          where: { id: account.id, tenant_id: tenantId },
          data: { balance: safeBalance, margin_used: BigInt(account.margin_used), equity: safeEquity },
        });

        await tx.transaction.create({
          data: {
            tenant_id: tenantId,
            account_id: account.id,
            type: 'DEPOSIT',
            amount: amountCents,
            description: description || 'Manual deposit',
          },
        });

        return safeBalance;
      });
    } catch (err: any) {
      if (err?.message === 'ACCOUNT_NOT_FOUND') {
        return reply.status(404).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
      }
      throw err;
    }

    return reply.send({ data: { balance: newBalance.toString() } });
  });

  // Withdraw from account (admin)
  fastify.post<{ Params: { id: string } }>('/api/v1/admin/accounts/:id/withdraw', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const { amount, description } = request.body as { amount: number; description?: string };
    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: 'Invalid amount', code: 'INVALID_AMOUNT' });
    }

    const amountCents = BigInt(Math.round(amount * 100));
    const tenantId = request.tenantId!;
    const accountId = request.params.id;

    // EXEC-001: Atomic withdraw — re-reads account inside tx and re-checks balance.
    let newBalance: bigint;
    try {
      newBalance = await prisma.$transaction(async (tx) => {
        const account = await tx.account.findFirst({
          where: { id: accountId, tenant_id: tenantId },
        });
        if (!account) {
          throw new Error('ACCOUNT_NOT_FOUND');
        }

        const currentBalance = BigInt(account.balance);
        if (amountCents > currentBalance) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        const balanceRaw = currentBalance - amountCents;
        // ESMA Negative Balance Protection: clamp to 0
        const safeBalance = balanceRaw < 0n ? 0n : balanceRaw;
        const safeEquity = safeBalance;

        await tx.account.updateMany({
          where: { id: account.id, tenant_id: tenantId },
          data: { balance: safeBalance, margin_used: BigInt(account.margin_used), equity: safeEquity },
        });

        await tx.transaction.create({
          data: {
            tenant_id: tenantId,
            account_id: account.id,
            type: 'WITHDRAWAL',
            amount: -amountCents,
            description: description || 'Manual withdrawal',
          },
        });

        return safeBalance;
      });
    } catch (err: any) {
      if (err?.message === 'ACCOUNT_NOT_FOUND') {
        return reply.status(404).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
      }
      if (err?.message === 'INSUFFICIENT_BALANCE') {
        return reply.status(400).send({ error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' });
      }
      throw err;
    }

    return reply.send({ data: { balance: newBalance.toString() } });
  });

  // List all open positions across all clients (admin)
  fastify.get('/api/v1/admin/positions', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const { prisma: db } = await import('../../shared/database/prisma');
    const trades = await db.trade.findMany({
      where: { tenant_id: request.tenantId!, status: 'OPEN' },
      include: {
        user: { select: { name: true, email: true } },
        instrument: { select: { symbol: true, display_name: true, pip_size: true } },
      },
      orderBy: { open_time: 'desc' },
      take: 200,
    });
    const data = trades.map((t) => ({
      ...t,
      open_price: t.open_price.toString(),
      close_price: t.close_price?.toString() ?? null,
      pnl: t.pnl.toString(),
      commission: t.commission.toString(),
      swap: t.swap.toString(),
      user_name: t.user.name,
      user_email: t.user.email,
      symbol: t.instrument.symbol,
      display_name: t.instrument.display_name,
    }));
    return reply.send({ data });
  });

  // List all transactions across all clients (admin)
  fastify.get('/api/v1/admin/transactions', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const { prisma: db } = await import('../../shared/database/prisma');
    const transactions = await db.transaction.findMany({
      where: { tenant_id: request.tenantId! },
      include: {
        account: {
          select: {
            user: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    const data = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount.toString(),
      description: t.description,
      created_at: t.created_at,
      user_name: t.account.user.name,
      user_email: t.account.user.email,
    }));
    return reply.send({ data });
  });

  // List all trades (closed) across all clients (admin)
  fastify.get('/api/v1/admin/trades', {
    preHandler: [tenantResolver, requireAdmin],
  }, async (request, reply) => {
    const { prisma: db } = await import('../../shared/database/prisma');
    const trades = await db.trade.findMany({
      where: { tenant_id: request.tenantId!, NOT: { status: 'OPEN' } },
      include: {
        user: { select: { name: true, email: true } },
        instrument: { select: { symbol: true, display_name: true } },
      },
      orderBy: { close_time: 'desc' },
      take: 200,
    });
    const data = trades.map((t) => ({
      ...t,
      open_price: t.open_price.toString(),
      close_price: t.close_price?.toString() ?? null,
      pnl: t.pnl.toString(),
      commission: t.commission.toString(),
      swap: t.swap.toString(),
      user_name: t.user.name,
      user_email: t.user.email,
      symbol: t.instrument.symbol,
      display_name: t.instrument.display_name,
    }));
    return reply.send({ data });
  });

  // Admin login (separate from trader login)
  fastify.post('/api/v1/admin/login', async (request, reply) => {
    const { email, password, tenant_id } = request.body as { email: string; password: string; tenant_id: string };

    if (!email || !password || !tenant_id) {
      return reply.status(400).send({ error: 'Missing fields', code: 'VALIDATION_ERROR' });
    }

    const bcrypt = await import('bcrypt');

    const admin = await (await import('../../shared/database/prisma')).prisma.tenantAdmin.findFirst({
      where: { email, tenant_id },
    });

    if (!admin || !admin.is_active) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const jwtRole = ['admin', 'seller', 'retention'].includes(admin.role) ? admin.role : 'admin';
    const token = fastify.jwt.sign(
      { sub: admin.id, email: admin.email, role: jwtRole, tenantId: admin.tenant_id },
      { expiresIn: '4h' }
    );
    const refreshToken = fastify.jwt.sign(
      { sub: admin.id, email: admin.email, role: jwtRole, tenantId: admin.tenant_id },
      { expiresIn: '7d' }
    );

    return reply.send({
      data: {
        admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
        token,
        refreshToken,
      },
    });
  });

  // SuperAdmin login
  fastify.post('/api/v1/super/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing fields', code: 'VALIDATION_ERROR' });
    }

    const bcrypt = await import('bcrypt');

    const superadmin = await (await import('../../shared/database/prisma')).prisma.superAdmin.findUnique({
      where: { email },
    });

    if (!superadmin) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(password, superadmin.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const token = fastify.jwt.sign(
      { sub: superadmin.id, email: superadmin.email, role: 'superadmin' },
      { expiresIn: '4h' }
    );
    const refreshToken = fastify.jwt.sign(
      { sub: superadmin.id, email: superadmin.email, role: 'superadmin' },
      { expiresIn: '7d' }
    );

    return reply.send({
      data: {
        superadmin: { id: superadmin.id, email: superadmin.email, name: superadmin.name },
        token,
        refreshToken,
      },
    });
  });
}
