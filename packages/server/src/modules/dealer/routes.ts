import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DealerInterventionSchema } from '@tradexlabel/shared';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAdmin } from '../../shared/middleware/auth';
import { serializeBigInt, priceToInt, logger } from '../../shared/utils/index';
import { getCurrentPrice } from '../pricing/price-store';
import { TenantQuery } from '../../shared/database/tenant-queries';
import { prisma } from '../../shared/database/prisma';

/**
 * Middleware: enforce that dealer routes only work for tenants with
 * execution_mode = B_BOOK_DEALER. A_BOOK and B_BOOK tenants get 403.
 * Must run AFTER tenantResolver (needs request.tenantId).
 */
async function requireDealerMode(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = (request as any).tenantId;
  if (!tenantId) {
    return reply.status(400).send({ error: 'Tenant not resolved', code: 'TENANT_REQUIRED' });
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { execution_mode: true },
  });
  if (!tenant || tenant.execution_mode !== 'B_BOOK_DEALER') {
    return reply.status(403).send({
      error: 'Dealer module not enabled for this tenant',
      code: 'DEALER_DISABLED',
    });
  }
}

/**
 * Close a dealer-scheduled trade by ID.
 * Used both by in-memory setTimeout and the periodic DB checker.
 */
async function closeDealerTrade(tenantId: string, tradeId: string) {
  const tq = new TenantQuery(tenantId);
  const trade = await tq.findTradeById(tradeId);
  if (!trade || trade.status !== 'OPEN') {
    logger.warn({ tradeId }, 'Scheduled close skipped — trade already closed or not found');
    return;
  }

  const targetPnlCents = trade.pnl_target ? BigInt(trade.pnl_target) : BigInt(0);
  const symbol = trade.symbol || '';
  const side = trade.side;

  // Get current price for realism
  const livePrice = getCurrentPrice(symbol);
  const closeDecimals = trade.pip_size < 0.001 ? 5 : 2;
  const closePriceFloat = livePrice && livePrice.bid > 0
    ? (side === 'BUY' ? livePrice.bid : livePrice.ask)
    : Number(trade.open_price) / Math.pow(10, closeDecimals);
  const closePriceCents = priceToInt(closePriceFloat, closeDecimals);
  const investCents = BigInt(trade.swap || 0);

  // EXEC-001: Atomic close + balance update + transaction + intervention.
  // Idempotent — only closes if still OPEN (prevents double-close races between
  // in-memory setTimeout and the periodic checker).
  const closed = await prisma.$transaction(async (tx) => {
    const closeResult = await tx.trade.updateMany({
      where: { id: tradeId, tenant_id: tenantId, status: 'OPEN' },
      data: { close_price: closePriceCents, pnl: targetPnlCents, status: 'CLOSED', close_time: new Date() },
    });
    if (closeResult.count === 0) {
      return false;
    }

    const account = await tx.account.findFirst({
      where: { id: trade.account_id, tenant_id: tenantId },
    });
    if (account) {
      const releasedMargin = BigInt(account.margin_used) - investCents;
      const newBalanceRaw = BigInt(account.balance) + targetPnlCents;
      const finalMargin = releasedMargin < 0n ? 0n : releasedMargin;
      const newEquityRaw = newBalanceRaw - finalMargin;

      // ESMA Negative Balance Protection: clamp to 0
      const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
      const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

      await tx.account.updateMany({
        where: { id: account.id, tenant_id: tenantId },
        data: { balance: safeBalance, margin_used: finalMargin, equity: safeEquity },
      });
    }

    await tx.transaction.create({
      data: {
        tenant_id: tenantId,
        account_id: trade.account_id,
        type: targetPnlCents >= 0n ? 'TRADE_PROFIT' : 'TRADE_LOSS',
        amount: targetPnlCents < 0n ? -targetPnlCents : targetPnlCents,
        description: `Dealer trade ${symbol} ${side} ${trade.volume} lot — P&L: $${(Number(targetPnlCents) / 100).toFixed(2)}`,
      },
    });

    await tx.dealerIntervention.create({
      data: {
        tenant_id: tenantId,
        trade_id: tradeId,
        dealer_id: 'system',
        action: 'PNL_OVERRIDE',
        original_price: trade.open_price,
        modified_price: closePriceCents,
        reason: `Scheduled auto-close — target P&L: $${(Number(targetPnlCents) / 100).toFixed(2)}`,
      },
    });

    return true;
  });

  if (!closed) {
    logger.warn({ tradeId }, 'Scheduled close skipped — already closed by another worker');
    return;
  }

  logger.info({ tradeId, pnl: Number(targetPnlCents) }, 'Scheduled trade closed successfully');
}

/**
 * Dealer Routes — registered globally, but each route runs requireDealerMode
 * middleware which checks tenant.execution_mode === 'B_BOOK_DEALER'.
 */
export async function dealerRoutes(fastify: FastifyInstance) {
  // Get all open positions (dealer view)
  fastify.get('/api/v1/dealer/positions', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const trades = await request.tenantQuery!.findOpenTrades();
    return reply.send({ data: serializeBigInt(trades) });
  });

  // Intervene on a trade
  fastify.post<{ Params: { tradeId: string } }>('/api/v1/dealer/intervene/:tradeId', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const parsed = DealerInterventionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const tq = request.tenantQuery!;
    const trade = await tq.findTradeById(request.params.tradeId);
    if (!trade) {
      return reply.status(404).send({ error: 'Trade not found', code: 'TRADE_NOT_FOUND' });
    }

    const intervention = parsed.data;
    let modifiedPrice: bigint | undefined;

    switch (intervention.action) {
      case 'SLIPPAGE':
        if (intervention.modified_price) {
          modifiedPrice = priceToInt(intervention.modified_price, 5);
        }
        break;
      case 'REQUOTE':
        // Mark trade for requote — in a real system this would notify the client
        break;
      case 'SPREAD_OVERRIDE':
        // Apply spread multiplier to the instrument for this tenant
        break;
      case 'PNL_OVERRIDE':
        if (intervention.pnl_override !== undefined) {
          const pnlCents = BigInt(Math.round(intervention.pnl_override * 100));
          await tq.closeTrade(trade.id, trade.open_price, pnlCents, 'CLOSED');
        }
        break;
      case 'DELAY':
        // Log the delay — actual delay is applied by the execution engine
        break;
    }

    const record = await tq.createDealerIntervention({
      trade_id: trade.id,
      dealer_id: request.userData!.sub,
      action: intervention.action,
      original_price: trade.open_price,
      modified_price: modifiedPrice,
      reason: intervention.reason,
    });

    logger.info({ tradeId: trade.id, action: intervention.action, dealerId: request.userData!.sub }, 'Dealer intervention');

    return reply.status(201).send({ data: serializeBigInt(record) });
  });

  // ─── Create trade for a client (dealer opens position) ───
  fastify.post('/api/v1/dealer/create-trade', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as {
      user_id: string;
      symbol: string;
      side: 'BUY' | 'SELL';
      volume: number;
      open_price?: number;
      invest_amount?: number; // cents to deduct from available balance as margin
      pnl_target?: number;
      close_after_seconds?: number; // delay before auto-closing (trade stays open, P&L fluctuates, then closes at target)
      reason: string;
    };

    if (!body.user_id || !body.symbol || !body.side || !body.volume || !body.reason) {
      return reply.status(400).send({ error: 'Missing required fields', code: 'VALIDATION_ERROR' });
    }

    const tq = request.tenantQuery!;
    const account = await tq.findAccountByUserId(body.user_id);
    if (!account) {
      return reply.status(404).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    }

    const instrument = await tq.findInstrumentBySymbol(body.symbol);
    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found', code: 'INSTRUMENT_NOT_FOUND' });
    }

    // Check invest amount doesn't exceed available balance
    const availableBalance = BigInt(account.balance) - BigInt(account.margin_used);
    const investCents = body.invest_amount ? BigInt(Math.round(body.invest_amount)) : BigInt(0);

    if (investCents > 0 && investCents > availableBalance) {
      return reply.status(400).send({ error: 'Insufficient available balance', code: 'INSUFFICIENT_BALANCE' });
    }

    const decimals = instrument.pip_size < 0.001 ? 5 : 2;
    // Use current market price if none specified
    let openPriceFloat = body.open_price || 1.0;
    if (!body.open_price) {
      const livePrice = getCurrentPrice(body.symbol);
      if (livePrice && livePrice.bid > 0) {
        // Use mid price so client-side simulation starts near $0 P&L (no spread bias)
        openPriceFloat = (livePrice.bid + livePrice.ask) / 2;
      }
    }
    const openPriceCents = priceToInt(openPriceFloat, decimals);

    // Compute scheduled close time if delay is specified
    const hasScheduledClose = body.pnl_target !== undefined && body.pnl_target !== null
      && body.close_after_seconds && body.close_after_seconds > 0;
    const scheduledCloseAt = hasScheduledClose
      ? new Date(Date.now() + body.close_after_seconds! * 1000)
      : undefined;
    const targetPnlCents = (body.pnl_target !== undefined && body.pnl_target !== null)
      ? BigInt(Math.round(body.pnl_target))
      : undefined;

    // EXEC-001: Atomic — createTrade + reserve margin + record intervention.
    // Re-reads account inside tx to avoid TOCTOU on the balance check.
    const tenantId = request.tenantId!;
    let trade;
    try {
      trade = await prisma.$transaction(async (tx) => {
        const freshAccount = await tx.account.findFirst({
          where: { id: account.id, tenant_id: tenantId },
        });
        if (!freshAccount) {
          throw new Error('ACCOUNT_NOT_FOUND');
        }

        if (investCents > 0n) {
          const freshAvailable = BigInt(freshAccount.balance) - BigInt(freshAccount.margin_used);
          if (investCents > freshAvailable) {
            throw new Error('INSUFFICIENT_BALANCE');
          }
        }

        const newTrade = await tx.trade.create({
          data: {
            tenant_id: tenantId,
            user_id: body.user_id,
            account_id: freshAccount.id,
            instrument_id: instrument.id,
            side: body.side,
            volume: body.volume,
            open_price: openPriceCents,
            commission: BigInt(Math.floor(body.volume * 700)),
            swap: investCents,
            pnl_target: targetPnlCents ?? null,
            scheduled_close_at: scheduledCloseAt ?? null,
          },
        });

        if (investCents > 0n) {
          const newMarginRaw = BigInt(freshAccount.margin_used) + investCents;
          const newBalanceRaw = BigInt(freshAccount.balance);
          const newEquityRaw = newBalanceRaw - newMarginRaw;

          // ESMA Negative Balance Protection: clamp to 0
          const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
          const safeMargin = newMarginRaw < 0n ? 0n : newMarginRaw;
          const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

          await tx.account.updateMany({
            where: { id: freshAccount.id, tenant_id: tenantId },
            data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
          });
        }

        await tx.dealerIntervention.create({
          data: {
            tenant_id: tenantId,
            trade_id: newTrade.id,
            dealer_id: request.userData!.sub,
            action: 'TRADE_CREATE',
            original_price: openPriceCents,
            reason: `${body.reason}${investCents > 0n ? ` | Invest: $${(Number(investCents) / 100).toFixed(2)}` : ''}`,
          },
        });

        return newTrade;
      });
    } catch (err: any) {
      if (err?.message === 'ACCOUNT_NOT_FOUND') {
        return reply.status(404).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
      }
      if (err?.message === 'INSUFFICIENT_BALANCE') {
        return reply.status(400).send({ error: 'Insufficient available balance', code: 'INSUFFICIENT_BALANCE' });
      }
      throw err;
    }

    // If pnl_target is set with a delay, schedule in-memory timer (+ persistent DB check as backup)
    if (hasScheduledClose) {
      const delayMs = body.close_after_seconds! * 1000;
      const tradeId = trade.id;

      logger.info({
        tradeId, delayMs, targetPnl: body.pnl_target, invest: Number(investCents),
        scheduledCloseAt: scheduledCloseAt?.toISOString(),
        dealerId: request.userData!.sub,
      }, 'Dealer created trade — scheduled close');

      // In-memory timer for responsiveness (backup: periodic DB checker)
      setTimeout(() => {
        closeDealerTrade(tenantId, tradeId).catch((err) => {
          logger.error({ tradeId, err }, 'Failed to execute scheduled trade close');
        });
      }, delayMs);

      return reply.status(201).send({ data: serializeBigInt(trade) });
    }

    // If pnl_target is set WITHOUT delay, close immediately
    if (body.pnl_target !== undefined && body.pnl_target !== null) {
      const pnlCents = BigInt(Math.round(body.pnl_target));

      // EXEC-001: Atomic — close trade + release margin + record transaction.
      const closedTrade = await prisma.$transaction(async (tx) => {
        const closeResult = await tx.trade.updateMany({
          where: { id: trade.id, tenant_id: tenantId, status: 'OPEN' },
          data: { close_price: openPriceCents, pnl: pnlCents, status: 'CLOSED', close_time: new Date() },
        });
        if (closeResult.count === 0) {
          throw new Error('TRADE_ALREADY_CLOSED');
        }

        // Re-read account inside tx — margin reservation just happened, but we want
        // a fresh view in case anything else modified balance concurrently.
        const freshAccount = await tx.account.findFirst({
          where: { id: account.id, tenant_id: tenantId },
        });
        if (freshAccount) {
          // Release the invest_amount margin we just reserved (if any), and apply pnl
          const newMarginRaw = BigInt(freshAccount.margin_used) - investCents;
          const newBalanceRaw = BigInt(freshAccount.balance) + pnlCents;
          const finalMargin = newMarginRaw < 0n ? 0n : newMarginRaw;
          const newEquityRaw = newBalanceRaw - finalMargin;

          // ESMA Negative Balance Protection: clamp to 0
          const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
          const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

          await tx.account.updateMany({
            where: { id: freshAccount.id, tenant_id: tenantId },
            data: { balance: safeBalance, margin_used: finalMargin, equity: safeEquity },
          });
        }

        await tx.transaction.create({
          data: {
            tenant_id: tenantId,
            account_id: account.id,
            type: pnlCents >= 0n ? 'TRADE_PROFIT' : 'TRADE_LOSS',
            amount: pnlCents < 0n ? -pnlCents : pnlCents,
            description: `Dealer trade ${body.symbol} ${body.side} ${body.volume} lot — P&L: $${(Number(pnlCents) / 100).toFixed(2)}${investCents > 0n ? ` | Invest: $${(Number(investCents) / 100).toFixed(2)}` : ''}`,
          },
        });

        return tx.trade.findUnique({ where: { id: trade.id } });
      });

      logger.info({ tradeId: trade.id, pnl: body.pnl_target, invest: Number(investCents), dealerId: request.userData!.sub }, 'Dealer created & closed trade (instant)');

      return reply.status(201).send({ data: serializeBigInt(closedTrade || trade) });
    }

    logger.info({ tradeId: trade.id, invest: Number(investCents), dealerId: request.userData!.sub }, 'Dealer created open trade');
    return reply.status(201).send({ data: serializeBigInt(trade) });
  });

  // ─── Close trade with custom P&L (dealer decides win/loss) ───
  fastify.post<{ Params: { tradeId: string } }>('/api/v1/dealer/close-trade/:tradeId', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as { pnl: number; close_price?: number; reason: string };

    if (body.pnl === undefined || !body.reason) {
      return reply.status(400).send({ error: 'Missing pnl or reason', code: 'VALIDATION_ERROR' });
    }

    const tq = request.tenantQuery!;
    const trade = await tq.findTradeById(request.params.tradeId);
    if (!trade || trade.status !== 'OPEN') {
      return reply.status(404).send({ error: 'Open trade not found', code: 'TRADE_NOT_FOUND' });
    }

    const pnlCents = BigInt(Math.round(body.pnl));
    const closePriceCents = body.close_price
      ? priceToInt(body.close_price, trade.pip_size < 0.001 ? 5 : 2)
      : trade.open_price;
    const tenantId = request.tenantId!;

    // EXEC-001: Atomic close + balance update + intervention.
    // Idempotent — only closes if still OPEN (prevents double-close races).
    try {
      await prisma.$transaction(async (tx) => {
        const closeResult = await tx.trade.updateMany({
          where: { id: trade.id, tenant_id: tenantId, status: 'OPEN' },
          data: { close_price: closePriceCents, pnl: pnlCents, status: 'CLOSED', close_time: new Date() },
        });
        if (closeResult.count === 0) {
          throw new Error('TRADE_ALREADY_CLOSED');
        }

        const account = await tx.account.findFirst({
          where: { id: trade.account_id, tenant_id: tenantId },
        });
        if (account) {
          const newBalanceRaw = BigInt(account.balance) + pnlCents;
          const newEquityRaw = newBalanceRaw - BigInt(account.margin_used);

          // ESMA Negative Balance Protection: clamp to 0
          const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
          const safeMargin = BigInt(account.margin_used) < 0n ? 0n : BigInt(account.margin_used);
          const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

          await tx.account.updateMany({
            where: { id: account.id, tenant_id: tenantId },
            data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
          });
        }

        await tx.dealerIntervention.create({
          data: {
            tenant_id: tenantId,
            trade_id: trade.id,
            dealer_id: request.userData!.sub,
            action: 'PNL_OVERRIDE',
            original_price: trade.open_price,
            modified_price: closePriceCents,
            reason: body.reason,
          },
        });
      });
    } catch (err: any) {
      if (err?.message === 'TRADE_ALREADY_CLOSED') {
        return reply.status(409).send({ error: 'Trade already closed', code: 'ALREADY_CLOSED' });
      }
      throw err;
    }

    logger.info({ tradeId: trade.id, pnl: body.pnl, dealerId: request.userData!.sub }, 'Dealer closed trade');

    return reply.send({ data: { success: true, pnl: pnlCents.toString() } });
  });

  // ─── List clients for dealer ───
  fastify.get('/api/v1/dealer/clients', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const users = await request.tenantQuery!.listUsers(200, 0);
    return reply.send({ data: serializeBigInt(users) });
  });

  // Get intervention history
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/api/v1/dealer/interventions', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 200);
    const offset = parseInt(request.query.offset || '0', 10);
    const interventions = await request.tenantQuery!.findDealerInterventions(limit, offset);
    return reply.send({ data: serializeBigInt(interventions) });
  });

  // Get/update dealer settings
  fastify.get('/api/v1/dealer/settings', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const settings = await request.tenantQuery!.getDealerSettings(request.tenantId!);
    return reply.send({ data: settings });
  });

  fastify.patch('/api/v1/dealer/settings', {
    preHandler: [tenantResolver, requireDealerMode, requireAdmin],
  }, async (request, reply) => {
    const body = request.body as any;
    const settings = await request.tenantQuery!.upsertDealerSettings(request.tenantId!, {
      max_slippage: body.max_slippage,
      requote_enabled: body.requote_enabled,
      spread_multiplier: body.spread_multiplier,
      auto_delay_ms: body.auto_delay_ms,
    });
    return reply.send({ data: settings });
  });

  // ─── Periodic checker for scheduled trade closes (survives server restart) ───
  const checkInterval = setInterval(async () => {
    try {
      // Check all B_BOOK_DEALER tenants for trades due for close
      const { prisma } = await import('../../shared/database/prisma');
      const tenants = await prisma.tenant.findMany({
        where: { execution_mode: 'B_BOOK_DEALER', is_active: true },
        select: { id: true },
      });

      for (const tenant of tenants) {
        const tq = new TenantQuery(tenant.id);
        const dueTradesRaw = await tq.findTradesDueForClose();
        for (const trade of dueTradesRaw) {
          logger.info({ tradeId: trade.id, tenantId: tenant.id }, 'Periodic checker: closing overdue trade');
          await closeDealerTrade(tenant.id, trade.id).catch((err) => {
            logger.error({ tradeId: trade.id, err }, 'Periodic checker: failed to close trade');
          });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Periodic scheduled-close checker error');
    }
  }, 5000); // Check every 5 seconds

  // Clean up on server shutdown
  fastify.addHook('onClose', () => {
    clearInterval(checkInterval);
  });

}
