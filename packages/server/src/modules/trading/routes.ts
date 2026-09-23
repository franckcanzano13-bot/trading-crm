import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateOrderSchema } from '@tradexlabel/shared';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth } from '../../shared/middleware/auth';
import { requireVerifiedEmail } from '../auth/email-verification';
import { serializeBigInt, logger, priceToInt, calculateMarginCents, calculatePnlCents } from '../../shared/utils/index';
import { executeOrder } from './engine';
import { prisma } from '../../shared/database/prisma';
import { audit } from '../../shared/audit';
import { recordTradePnl } from '../../shared/segregation';

const UpdateSLTPSchema = z.object({
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
});

// Sprint 5.4: trailing stop distance is a price-unit distance (not pips).
// null disables trailing.
const UpdateTrailingStopSchema = z.object({
  distance: z.number().positive().nullable(),
});

// Sprint 5.4: OCO (One-Cancels-the-Other). Creates two PENDING orders
// sharing a generated oco_group_id. When one fills, the sibling is cancelled.
const OcoLegSchema = z.object({
  type: z.enum(['LIMIT', 'STOP']),
  price: z.number().positive(),
});
const CreateOcoSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  volume: z.number().positive().max(100),
  primary: OcoLegSchema,
  secondary: OcoLegSchema,
});

export async function tradingRoutes(fastify: FastifyInstance) {
  // Place an order
  fastify.post('/api/v1/orders', {
    preHandler: [tenantResolver, requireAuth, requireVerifiedEmail],
  }, async (request, reply) => {
    const parsed = CreateOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const tq = request.tenantQuery!;
    const userId = request.userData!.sub;

    const instrument = await tq.findInstrumentBySymbol(parsed.data.symbol);
    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found', code: 'INSTRUMENT_NOT_FOUND' });
    }

    if (!instrument.is_active) {
      return reply.status(400).send({ error: 'Instrument is not active', code: 'INSTRUMENT_INACTIVE' });
    }

    const account = await tq.findAccountByUserId(userId);
    if (!account) {
      return reply.status(400).send({ error: 'No trading account', code: 'NO_ACCOUNT' });
    }

    // Volume validation
    if (parsed.data.volume < instrument.min_volume || parsed.data.volume > instrument.max_volume) {
      return reply.status(400).send({
        error: `Volume must be between ${instrument.min_volume} and ${instrument.max_volume}`,
        code: 'INVALID_VOLUME',
      });
    }

    try {
      const result = await executeOrder({
        tenantQuery: tq,
        tenantId: request.tenantId!,
        tenantSlug: request.tenantSlug!,
        userId,
        account,
        instrument,
        order: parsed.data,
        executionMode: request.tenantExecutionMode,
        fastify,
      });

      logger.info({ userId, symbol: parsed.data.symbol, side: parsed.data.side, volume: parsed.data.volume }, 'Order executed');
      return reply.status(201).send({ data: serializeBigInt(result) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, userId, symbol: parsed.data.symbol }, 'Order execution failed');
      return reply.status(400).send({ error: message, code: 'EXECUTION_ERROR' });
    }
  });

  // Cancel pending order — VULN-003 fix: scope to user_id to prevent IDOR
  fastify.delete<{ Params: { id: string } }>('/api/v1/orders/:id', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const tq = request.tenantQuery!;
    const userId = request.userData!.sub;
    const order = await tq.updateOrderStatus(request.params.id, 'CANCELLED', userId);
    if (!order) {
      return reply.status(404).send({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    return reply.send({ data: serializeBigInt(order) });
  });

  // Get open positions
  fastify.get('/api/v1/positions', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const trades = await request.tenantQuery!.findOpenTrades(request.userData!.sub);
    return reply.send({ data: serializeBigInt(trades) });
  });

  // Close a position
  fastify.post<{ Params: { id: string } }>('/api/v1/positions/:id/close', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const tq = request.tenantQuery!;
    const tenantId = request.tenantId!;
    const trade = await tq.findTradeById(request.params.id);

    if (!trade || trade.status !== 'OPEN') {
      return reply.status(404).send({ error: 'Open position not found', code: 'POSITION_NOT_FOUND' });
    }

    if (trade.user_id !== request.userData!.sub) {
      return reply.status(403).send({ error: 'Not your position', code: 'FORBIDDEN' });
    }

    // Get current price from Redis or use a mock price
    const { getCurrentPrice } = await import('../pricing/price-store');
    const currentPrice = getCurrentPrice(trade.symbol);
    const closePrice = trade.side === 'BUY' ? currentPrice.bid : currentPrice.ask;
    const closePriceInt = priceToInt(closePrice, 5);

    const direction = trade.side === 'BUY' ? 1 : -1;
    const openPriceFloat = Number(trade.open_price) / 100000;
    // Sprint 4.3: decimal.js-backed precision (no IEEE-754 cumulative error)
    const pnlCents = calculatePnlCents(openPriceFloat, closePrice, trade.volume, trade.lot_size, direction as 1 | -1);

    // EXEC-001: Atomic close + balance update + transaction.
    // The trade.update is idempotent (status='OPEN' guard) which prevents double-close races.
    let closedTrade;
    try {
      closedTrade = await prisma.$transaction(async (tx) => {
        // Idempotent close — status='OPEN' guard prevents double-close
        const closeResult = await tx.trade.updateMany({
          where: { id: trade.id, tenant_id: tenantId, status: 'OPEN' },
          data: { close_price: closePriceInt, pnl: pnlCents, status: 'CLOSED', close_time: new Date() },
        });
        if (closeResult.count === 0) {
          throw new Error('TRADE_ALREADY_CLOSED');
        }

        const account = await tx.account.findFirst({
          where: { id: trade.account_id, tenant_id: tenantId },
        });
        if (account) {
          const marginRelease = calculateMarginCents(openPriceFloat, trade.volume, trade.lot_size, account.leverage);
          const newBalanceRaw = BigInt(account.balance) + pnlCents;
          const newMarginUsedRaw = BigInt(account.margin_used) - marginRelease;
          const newEquityRaw = newBalanceRaw;

          // ESMA Negative Balance Protection: clamp to 0
          const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
          const safeMargin = newMarginUsedRaw < 0n ? 0n : newMarginUsedRaw;
          const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

          await tx.account.updateMany({
            where: { id: account.id, tenant_id: tenantId },
            data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
          });

          await tx.transaction.create({
            data: {
              tenant_id: tenantId,
              account_id: account.id,
              type: 'TRADE_PNL',
              amount: pnlCents,
              description: `Closed ${trade.side} ${trade.volume} ${trade.symbol} P&L`,
            },
          });

          // Sprint 7.6: paired ledger entries between CLIENT_TRUST and
          // BROKER_OPERATING. Sum across both pools is always zero
          // (conservation of money under B-Book).
          await recordTradePnl(tx, {
            tenantId, accountId: account.id,
            pnlCents, reference: `trade:${trade.id}`,
            description: `Closed ${trade.side} ${trade.volume} ${trade.symbol}`,
          });
        }

        return tx.trade.findUnique({ where: { id: trade.id } });
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'TRADE_ALREADY_CLOSED') {
        return reply.status(409).send({ error: 'Position already closed', code: 'ALREADY_CLOSED' });
      }
      throw err;
    }

    logger.info({ tradeId: trade.id, pnl: pnlCents.toString() }, 'Position closed');

    // Sprint 4.4: audit trader-initiated close (financial event, MiFID II)
    await audit.log({
      tenantId: request.tenantId!, actorId: request.userData!.sub, actorType: 'trader',
      action: 'POSITION_CLOSE',
      target: `trade:${trade.id}`,
      details: {
        symbol: trade.symbol, side: trade.side, volume: trade.volume,
        open_price: trade.open_price?.toString(), close_price: closePriceInt.toString(),
        pnl_cents: pnlCents.toString(),
      },
      ip: request.ip,
    });

    return reply.send({ data: serializeBigInt(closedTrade) });
  });

  // Modify SL/TP on an open position
  fastify.patch<{ Params: { id: string } }>('/api/v1/positions/:id/sltp', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const parsed = UpdateSLTPSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const tq = request.tenantQuery!;
    const trade = await tq.findTradeById(request.params.id);

    if (!trade || trade.status !== 'OPEN') {
      return reply.status(404).send({ error: 'Open position not found', code: 'POSITION_NOT_FOUND' });
    }

    if (trade.user_id !== request.userData!.sub) {
      return reply.status(403).send({ error: 'Not your position', code: 'FORBIDDEN' });
    }

    // Validate SL/TP direction
    const { getCurrentPrice } = await import('../pricing/price-store');
    const currentPrice = getCurrentPrice(trade.symbol);
    const midPrice = (currentPrice.bid + currentPrice.ask) / 2;

    const sl = parsed.data.stop_loss !== undefined ? parsed.data.stop_loss : trade.stop_loss;
    const tp = parsed.data.take_profit !== undefined ? parsed.data.take_profit : trade.take_profit;

    if (sl !== null && sl !== undefined) {
      if (trade.side === 'BUY' && sl >= midPrice) {
        return reply.status(400).send({ error: 'Stop Loss must be below current price for BUY', code: 'INVALID_SL' });
      }
      if (trade.side === 'SELL' && sl <= midPrice) {
        return reply.status(400).send({ error: 'Stop Loss must be above current price for SELL', code: 'INVALID_SL' });
      }
    }

    if (tp !== null && tp !== undefined) {
      if (trade.side === 'BUY' && tp <= midPrice) {
        return reply.status(400).send({ error: 'Take Profit must be above current price for BUY', code: 'INVALID_TP' });
      }
      if (trade.side === 'SELL' && tp >= midPrice) {
        return reply.status(400).send({ error: 'Take Profit must be below current price for SELL', code: 'INVALID_TP' });
      }
    }

    const updated = await tq.updateTradeSLTP(trade.id, sl ?? null, tp ?? null);
    logger.info({ tradeId: trade.id, sl, tp }, 'SL/TP updated');

    // Sprint 4.4: audit SL/TP modifications
    await audit.log({
      tenantId: request.tenantId!, actorId: request.userData!.sub, actorType: 'trader',
      action: 'SLTP_UPDATE', target: `trade:${trade.id}`,
      details: {
        previous_sl: trade.stop_loss, previous_tp: trade.take_profit,
        new_sl: sl ?? null, new_tp: tp ?? null,
      },
      ip: request.ip,
    });

    return reply.send({ data: serializeBigInt(updated) });
  });

  // Sprint 5.4: set/clear trailing stop on an open position
  fastify.patch<{ Params: { id: string } }>('/api/v1/positions/:id/trailing-stop', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const parsed = UpdateTrailingStopSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const tq = request.tenantQuery!;
    const trade = await tq.findTradeById(request.params.id);

    if (!trade || trade.status !== 'OPEN') {
      return reply.status(404).send({ error: 'Open position not found', code: 'POSITION_NOT_FOUND' });
    }
    if (trade.user_id !== request.userData!.sub) {
      return reply.status(403).send({ error: 'Not your position', code: 'FORBIDDEN' });
    }

    const distance = parsed.data.distance;
    // Initialize trailing_stop_high to current open price when activating.
    // Clear both fields on disable.
    const openPriceFloat = Number(trade.open_price) / 100000;
    const result = await prisma.trade.updateMany({
      where: { id: trade.id, tenant_id: request.tenantId!, status: 'OPEN' },
      data: {
        trailing_stop_distance: distance,
        trailing_stop_high: distance === null ? null : openPriceFloat,
      },
    });
    if (result.count === 0) {
      return reply.status(404).send({ error: 'Open position not found', code: 'POSITION_NOT_FOUND' });
    }

    logger.info({ tradeId: trade.id, distance }, 'Trailing stop updated');

    await audit.log({
      tenantId: request.tenantId!, actorId: request.userData!.sub, actorType: 'trader',
      action: 'TRAILING_STOP_UPDATE', target: `trade:${trade.id}`,
      details: {
        previous_distance: trade.trailing_stop_distance ?? null,
        new_distance: distance,
        anchor_price: distance === null ? null : openPriceFloat,
      },
      ip: request.ip,
    });

    const updated = await prisma.trade.findUnique({ where: { id: trade.id } });
    return reply.send({ data: serializeBigInt(updated) });
  });

  // Sprint 5.4: create an OCO pair — two PENDING orders sharing oco_group_id.
  fastify.post('/api/v1/orders/oco', {
    preHandler: [tenantResolver, requireAuth, requireVerifiedEmail],
  }, async (request, reply) => {
    const parsed = CreateOcoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const tq = request.tenantQuery!;
    const userId = request.userData!.sub;
    const tenantId = request.tenantId!;

    const instrument = await tq.findInstrumentBySymbol(parsed.data.symbol);
    if (!instrument || !instrument.is_active) {
      return reply.status(404).send({ error: 'Instrument not found or inactive', code: 'INSTRUMENT_NOT_FOUND' });
    }

    if (parsed.data.volume < instrument.min_volume || parsed.data.volume > instrument.max_volume) {
      return reply.status(400).send({
        error: `Volume must be between ${instrument.min_volume} and ${instrument.max_volume}`,
        code: 'INVALID_VOLUME',
      });
    }

    const account = await tq.findAccountByUserId(userId);
    if (!account) {
      return reply.status(400).send({ error: 'No trading account', code: 'NO_ACCOUNT' });
    }

    // Generate a shared group id. Two PENDING orders are created atomically.
    const ocoGroupId = (globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID()) as string;

    const [primary, secondary] = await prisma.$transaction([
      prisma.order.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          instrument_id: instrument.id,
          type: parsed.data.primary.type,
          side: parsed.data.side,
          volume: parsed.data.volume,
          price: priceToInt(parsed.data.primary.price, 5),
          oco_group_id: ocoGroupId,
        },
      }),
      prisma.order.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          instrument_id: instrument.id,
          type: parsed.data.secondary.type,
          side: parsed.data.side,
          volume: parsed.data.volume,
          price: priceToInt(parsed.data.secondary.price, 5),
          oco_group_id: ocoGroupId,
        },
      }),
    ]);

    logger.info({ ocoGroupId, primary: primary.id, secondary: secondary.id, symbol: instrument.symbol }, 'OCO pair created');

    await audit.log({
      tenantId, actorId: userId, actorType: 'trader',
      action: 'OCO_CREATE', target: `oco:${ocoGroupId}`,
      details: {
        symbol: instrument.symbol, side: parsed.data.side, volume: parsed.data.volume,
        primary: { id: primary.id, type: parsed.data.primary.type, price: parsed.data.primary.price },
        secondary: { id: secondary.id, type: parsed.data.secondary.type, price: parsed.data.secondary.price },
      },
      ip: request.ip,
    });

    return reply.status(201).send({ data: serializeBigInt({ oco_group_id: ocoGroupId, primary, secondary }) });
  });

  // Trade history
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/api/v1/trades/history', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);
    const trades = await request.tenantQuery!.findTradeHistory(request.userData!.sub, limit, offset);
    return reply.send({ data: serializeBigInt(trades) });
  });
}
