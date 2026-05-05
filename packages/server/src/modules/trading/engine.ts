import { FastifyInstance } from 'fastify';
import { TenantQuery } from '../../shared/database/tenant-queries';
import { priceToInt, calculateMarginCents, logger } from '../../shared/utils/index';
import { getCurrentPrice } from '../pricing/price-store';
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
  const { tenantQuery, userId, account, instrument, order, executionMode } = params;

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

  // Calculate required margin
  const marginRequired = calculateMarginCents(finalPrice, order.volume, instrument.lot_size, account.leverage);
  const availableMargin = BigInt(account.balance) - BigInt(account.margin_used);

  if (marginRequired > availableMargin) {
    throw new Error('Insufficient margin');
  }

  const commissionCents = BigInt(0);

  const trade = await tenantQuery.createTrade({
    user_id: userId,
    account_id: account.id,
    instrument_id: instrument.id,
    side: order.side,
    volume: order.volume,
    open_price: priceToInt(finalPrice, 5),
    stop_loss: order.stop_loss,
    take_profit: order.take_profit,
    commission: commissionCents,
  });

  const newMarginUsed = BigInt(account.margin_used) + marginRequired;
  const newEquity = BigInt(account.balance) - commissionCents;
  await tenantQuery.updateAccountBalance(account.id, BigInt(account.balance) - commissionCents, newMarginUsed, newEquity);

  const filledOrder = await tenantQuery.createOrder({
    user_id: userId,
    instrument_id: instrument.id,
    type: 'MARKET',
    side: order.side,
    volume: order.volume,
    price: priceToInt(finalPrice, 5),
    stop_loss: order.stop_loss,
    take_profit: order.take_profit,
  });
  await tenantQuery.updateOrderStatus(filledOrder.id, 'FILLED');

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
  const { tenantQuery, userId, account, instrument, order } = params;

  const investCents = BigInt(Math.round(order.invest_amount!));
  const availableBalance = BigInt(account.balance) - BigInt(account.margin_used);

  if (investCents > availableBalance) {
    throw new Error('Insufficient balance for this investment');
  }

  // Mid price: no spread bias for simulation
  const midPrice = (price.bid + price.ask) / 2;
  if (midPrice <= 0) {
    throw new Error('No price available for this instrument');
  }

  // Always store prices with precision 5 for consistency
  const trade = await tenantQuery.createTrade({
    user_id: userId,
    account_id: account.id,
    instrument_id: instrument.id,
    side: order.side,
    volume: order.volume,
    open_price: priceToInt(midPrice, 5),
    commission: BigInt(0),
    swap: investCents, // store invest_amount for client display + simulation
  });

  // Hold invest_amount as margin
  const newMarginUsed = BigInt(account.margin_used) + investCents;
  const newEquity = BigInt(account.balance) - newMarginUsed;
  await tenantQuery.updateAccountBalance(account.id, BigInt(account.balance), newMarginUsed, newEquity);

  const filledOrder = await tenantQuery.createOrder({
    user_id: userId,
    instrument_id: instrument.id,
    type: 'MARKET',
    side: order.side,
    volume: order.volume,
    price: priceToInt(midPrice, 5),
  });
  await tenantQuery.updateOrderStatus(filledOrder.id, 'FILLED');

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
