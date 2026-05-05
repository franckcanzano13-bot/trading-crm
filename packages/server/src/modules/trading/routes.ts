import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateOrderSchema } from '@tradexlabel/shared';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth } from '../../shared/middleware/auth';
import { serializeBigInt, logger, priceToInt, calculateMarginCents } from '../../shared/utils/index';
import { executeOrder } from './engine';

const UpdateSLTPSchema = z.object({
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
});

export async function tradingRoutes(fastify: FastifyInstance) {
  // Place an order
  fastify.post('/api/v1/orders', {
    preHandler: [tenantResolver, requireAuth],
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
    } catch (err: any) {
      logger.error({ err, userId, symbol: parsed.data.symbol }, 'Order execution failed');
      return reply.status(400).send({ error: err.message, code: 'EXECUTION_ERROR' });
    }
  });

  // Cancel pending order
  fastify.delete<{ Params: { id: string } }>('/api/v1/orders/:id', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const tq = request.tenantQuery!;
    const order = await tq.updateOrderStatus(request.params.id, 'CANCELLED');
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
    const pnlRaw = (closePrice - openPriceFloat) * trade.volume * trade.lot_size * direction;
    const pnlCents = BigInt(Math.round(pnlRaw * 100));

    const closedTrade = await tq.closeTrade(trade.id, closePriceInt, pnlCents);

    // Update account balance
    const account = await tq.findAccountById(trade.account_id);
    if (account) {
      const newBalance = BigInt(account.balance) + pnlCents;
      const marginRelease = calculateMarginCents(openPriceFloat, trade.volume, trade.lot_size, account.leverage);
      const newMarginUsed = BigInt(account.margin_used) - marginRelease;
      await tq.updateAccountBalance(
        account.id,
        newBalance,
        newMarginUsed < BigInt(0) ? BigInt(0) : newMarginUsed,
        newBalance
      );
      await tq.createTransaction({
        account_id: account.id,
        type: 'TRADE_PNL',
        amount: pnlCents,
        description: `Closed ${trade.side} ${trade.volume} ${trade.symbol} P&L`,
      });
    }

    logger.info({ tradeId: trade.id, pnl: pnlCents.toString() }, 'Position closed');
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
    return reply.send({ data: serializeBigInt(updated) });
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
