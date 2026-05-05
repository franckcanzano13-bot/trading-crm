import { FastifyInstance } from 'fastify';
import { TenantQuery } from '../../shared/database/tenant-queries';
import { prisma } from '../../shared/database/prisma';
import { priceToInt, calculateMarginCents, logger } from '../../shared/utils/index';
import { getCurrentPrice } from '../pricing/price-store';
import { clampLeverage } from '../../shared/compliance/leverage-caps';
import type { CreateOrderInput } from '@tradexlabel/shared';

export interface ExecuteOrderParams {
  tenantQuery: TenantQuery;
  tenantId: string;
  tenantSlug: string;
  userId: string;
  account: any;
  instrument: any;
  order: CreateOrderInput;
  executionMode?: string;
  fastify: FastifyInstance;
}

/**
 * Standard B-Book execution engine.
 * Executes market orders at current price + spread.
 * Creates pending orders for limit/stop types.
 */
export async function executeOrder(params: ExecuteOrderParams) {
  const { tenantQuery, userId, instrument, order } = params;

  if (order.type === 'MARKET') {
    return executeMarketOrder(params);
  }

  // For LIMIT and STOP orders, create a pending order
  const pendingOrder = await tenantQuery.createOrder({
    user_id: userId,
    instrument_id: instrument.id,
    type: order.type,
    side: order.side,
    volume: order.volume,
    price: order.price ? priceToInt(order.price, 5) : undefined,
    stop_loss: order.stop_loss,
    take_profit: order.take_profit,
  });

  return { order: pendingOrder, type: 'PENDING' };
}

async function executeMarketOrder(params: ExecuteOrderParams) {
  const { tenantId, userId, account, instrument, order, executionMode } = params;

  // Dealer-mode: invest_amount present + B_BOOK_DEALER tenant
  const isDealerMode = executionMode === 'B_BOOK_DEALER' && order.invest_amount && order.invest_amount > 0;

  // Get current market price
  const price = getCurrentPrice(instrument.symbol);

  if (isDealerMode) {
    return executeDealerMarketOrder(params, price);
  }

  const executionPrice = order.side === 'BUY' ? price.ask : price.bid;

  if (executionPrice <= 0) {
    throw new Error('No price available for this instrument');
  }

  // Apply broker spread markup
  const spreadMarkup = instrument.spread_markup * instrument.pip_size;
  const finalPrice = order.side === 'BUY'
    ? executionPrice + spreadMarkup / 2
    : executionPrice - spreadMarkup / 2;

  // Sprint 2.5: ESMA / FCA / ASIC leverage cap by client jurisdiction × instrument
  const user = await prisma.user.findFirst({ where: { id: userId, tenant_id: tenantId }, select: { country: true } });
  const leverageCheck = clampLeverage(
    user?.country || '',
    instrument.symbol,
    instrument.type,
    account.leverage,
  );
  if (leverageCheck.capped) {
    logger.warn({
      userId, country: user?.country, symbol: instrument.symbol,
      requested: account.leverage, capped_to: leverageCheck.effective,
      jurisdiction: leverageCheck.jurisdiction,
    }, '[ESMA] leverage capped by jurisdiction');
  }
  const effectiveLeverage = leverageCheck.effective;

  // Calculate required margin (with capped leverage)
  const marginRequired = calculateMarginCents(finalPrice, order.volume, instrument.lot_size, effectiveLeverage);
  const finalPriceInt = priceToInt(finalPrice, 5);
  const commissionCents = BigInt(0);

  // EXEC-001: Atomic — all or nothing. Re-reads account inside tx to avoid TOCTOU.
  const { trade, filledOrder } = await prisma.$transaction(async (tx) => {
    const freshAccount = await tx.account.findFirst({
      where: { id: account.id, tenant_id: tenantId },
    });
    if (!freshAccount) {
      throw new Error('Account not found');
    }

    const availableMargin = BigInt(freshAccount.balance) - BigInt(freshAccount.margin_used);
    if (marginRequired > availableMargin) {
      throw new Error('Insufficient margin');
    }

    const newTrade = await tx.trade.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        account_id: freshAccount.id,
        instrument_id: instrument.id,
        side: order.side,
        volume: order.volume,
        open_price: finalPriceInt,
        stop_loss: order.stop_loss ?? null,
        take_profit: order.take_profit ?? null,
        commission: commissionCents,
      },
    });

    const newBalanceRaw = BigInt(freshAccount.balance) - commissionCents;
    const newMarginUsedRaw = BigInt(freshAccount.margin_used) + marginRequired;
    const newEquityRaw = newBalanceRaw;

    // ESMA Negative Balance Protection: clamp to 0
    const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
    const safeMargin = newMarginUsedRaw < 0n ? 0n : newMarginUsedRaw;
    const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

    await tx.account.updateMany({
      where: { id: freshAccount.id, tenant_id: tenantId },
      data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
    });

    const newOrder = await tx.order.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        instrument_id: instrument.id,
        type: 'MARKET',
        side: order.side,
        volume: order.volume,
        price: finalPriceInt,
        stop_loss: order.stop_loss ?? null,
        take_profit: order.take_profit ?? null,
        status: 'FILLED',
        filled_at: new Date(),
      },
    });

    return { trade: newTrade, filledOrder: newOrder };
  });

  logger.info({
    tradeId: trade.id,
    symbol: instrument.symbol,
    side: order.side,
    volume: order.volume,
    price: finalPrice,
    margin: marginRequired.toString(),
  }, 'Market order executed');

  return { trade, order: filledOrder, type: 'FILLED' };
}

/**
 * Dealer-mode market order execution.
 * - Uses mid price (no spread bias for client P&L simulation)
 * - Stores invest_amount in swap field
 * - Uses invest_amount as margin hold
 * - Correct decimal precision per instrument type
 */
async function executeDealerMarketOrder(params: ExecuteOrderParams, price: { bid: number; ask: number }) {
  const { tenantId, userId, account, instrument, order } = params;

  const investCents = BigInt(Math.round(order.invest_amount!));

  // Mid price: no spread bias for simulation
  const midPrice = (price.bid + price.ask) / 2;
  if (midPrice <= 0) {
    throw new Error('No price available for this instrument');
  }

  // Always store prices with precision 5 for consistency
  const midPriceInt = priceToInt(midPrice, 5);

  // EXEC-001: Atomic — all or nothing. Re-reads account inside tx to avoid TOCTOU.
  const { trade, filledOrder } = await prisma.$transaction(async (tx) => {
    const freshAccount = await tx.account.findFirst({
      where: { id: account.id, tenant_id: tenantId },
    });
    if (!freshAccount) {
      throw new Error('Account not found');
    }

    const availableBalance = BigInt(freshAccount.balance) - BigInt(freshAccount.margin_used);
    if (investCents > availableBalance) {
      throw new Error('Insufficient balance for this investment');
    }

    const newTrade = await tx.trade.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        account_id: freshAccount.id,
        instrument_id: instrument.id,
        side: order.side,
        volume: order.volume,
        open_price: midPriceInt,
        commission: BigInt(0),
        swap: investCents, // store invest_amount for client display + simulation
      },
    });

    // Hold invest_amount as margin
    const newMarginUsedRaw = BigInt(freshAccount.margin_used) + investCents;
    const newBalanceRaw = BigInt(freshAccount.balance);
    const newEquityRaw = newBalanceRaw - newMarginUsedRaw;

    // ESMA Negative Balance Protection: clamp to 0
    const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
    const safeMargin = newMarginUsedRaw < 0n ? 0n : newMarginUsedRaw;
    const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

    await tx.account.updateMany({
      where: { id: freshAccount.id, tenant_id: tenantId },
      data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
    });

    const newOrder = await tx.order.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        instrument_id: instrument.id,
        type: 'MARKET',
        side: order.side,
        volume: order.volume,
        price: midPriceInt,
        status: 'FILLED',
        filled_at: new Date(),
      },
    });

    return { trade: newTrade, filledOrder: newOrder };
  });

  logger.info({
    tradeId: trade.id,
    symbol: instrument.symbol,
    side: order.side,
    investCents: investCents.toString(),
    midPrice,
    precision: 5,
  }, 'Dealer-mode market order executed');

  return { trade, order: filledOrder, type: 'FILLED' };
}
