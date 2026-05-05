import { prisma } from '../../shared/database/prisma';
import { getCurrentPrice, getPriceMap } from '../pricing/price-store';
import { logger, priceToInt, calculateMarginCents } from '../../shared/utils/index';

/**
 * Position Monitor — Background loop that checks all open positions against live prices.
 *
 * Handles:
 * 1. SL/TP execution — closes positions when price hits stop_loss or take_profit
 * 2. LIMIT/STOP order matching — fills pending orders when price reaches target
 * 3. Margin call / auto-liquidation — closes positions when margin level < stop-out
 */

const MONITOR_INTERVAL_MS = 1000; // Check every second
const STOP_OUT_LEVEL = 50; // 50% margin level = liquidation

let intervalHandle: NodeJS.Timeout | null = null;

export function startPositionMonitor() {
  if (intervalHandle) return;
  logger.info('[PositionMonitor] Starting — SL/TP, limit/stop matching, margin call');
  intervalHandle = setInterval(monitorLoop, MONITOR_INTERVAL_MS);
}

export function stopPositionMonitor() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[PositionMonitor] Stopped');
  }
}

async function monitorLoop() {
  try {
    await Promise.all([
      checkStopLossTakeProfit(),
      checkPendingOrders(),
      checkMarginCalls(),
      checkDealerPnlTargets(),
    ]);
  } catch (err) {
    // Don't crash the loop on errors
    logger.error({ err }, '[PositionMonitor] Error in monitoring loop');
  }
}

// ─── 1. SL/TP Execution ───

async function checkStopLossTakeProfit() {
  // Find all open NON-DEALER trades with SL or TP set
  // (Dealer trades are handled separately in checkDealerPnlTargets)
  const trades = await prisma.trade.findMany({
    where: {
      status: 'OPEN',
      swap: { lte: 0 }, // exclude dealer trades (swap > 0 = invest_amount)
      OR: [
        { stop_loss: { not: null } },
        { take_profit: { not: null } },
      ],
    },
    include: {
      instrument: { select: { symbol: true, pip_size: true, lot_size: true } },
      account: { select: { id: true, balance: true, margin_used: true, equity: true, leverage: true } },
    },
  });

  for (const trade of trades) {
    const price = getCurrentPrice(trade.instrument.symbol);
    if (!price || (price.bid === 0 && price.ask === 0)) continue;

    // For BUY: close at bid. SL triggers when bid <= stop_loss. TP triggers when bid >= take_profit.
    // For SELL: close at ask. SL triggers when ask >= stop_loss. TP triggers when ask <= take_profit.
    const closePrice = trade.side === 'BUY' ? price.bid : price.ask;
    let triggered = false;
    let reason = '';

    if (trade.stop_loss !== null) {
      if (trade.side === 'BUY' && closePrice <= trade.stop_loss) {
        triggered = true;
        reason = 'STOP_LOSS';
      } else if (trade.side === 'SELL' && closePrice >= trade.stop_loss) {
        triggered = true;
        reason = 'STOP_LOSS';
      }
    }

    if (!triggered && trade.take_profit !== null) {
      if (trade.side === 'BUY' && closePrice >= trade.take_profit) {
        triggered = true;
        reason = 'TAKE_PROFIT';
      } else if (trade.side === 'SELL' && closePrice <= trade.take_profit) {
        triggered = true;
        reason = 'TAKE_PROFIT';
      }
    }

    if (triggered) {
      await closeTradeAtPrice(trade, closePrice, reason);
    }
  }
}

// ─── 2. LIMIT/STOP Order Matching ───

async function checkPendingOrders() {
  const orders = await prisma.order.findMany({
    where: { status: 'PENDING' },
    include: {
      instrument: { select: { symbol: true, pip_size: true, lot_size: true, spread_markup: true, id: true } },
    },
  });

  for (const order of orders) {
    const price = getCurrentPrice(order.instrument.symbol);
    if (!price || (price.bid === 0 && price.ask === 0)) continue;
    if (!order.price) continue;

    const orderPrice = Number(order.price) / 100000;
    let shouldFill = false;

    if (order.type === 'LIMIT') {
      // BUY LIMIT: fill when ask drops to or below order price
      // SELL LIMIT: fill when bid rises to or above order price
      if (order.side === 'BUY' && price.ask <= orderPrice) shouldFill = true;
      if (order.side === 'SELL' && price.bid >= orderPrice) shouldFill = true;
    } else if (order.type === 'STOP') {
      // BUY STOP: fill when ask rises to or above order price
      // SELL STOP: fill when bid drops to or below order price
      if (order.side === 'BUY' && price.ask >= orderPrice) shouldFill = true;
      if (order.side === 'SELL' && price.bid <= orderPrice) shouldFill = true;
    }

    if (shouldFill) {
      await fillPendingOrder(order, price);
    }
  }
}

// ─── 3. Margin Call / Auto-Liquidation ───

async function checkMarginCalls() {
  // Get all accounts with open positions
  const accounts = await prisma.account.findMany({
    where: {
      margin_used: { gt: 0 },
    },
    include: {
      trades: {
        where: { status: 'OPEN' },
        include: { instrument: { select: { symbol: true, pip_size: true, lot_size: true } } },
      },
    },
  });

  for (const account of accounts) {
    if (account.trades.length === 0) continue;

    // Calculate total unrealized P&L
    let totalUnrealizedPnlCents = BigInt(0);
    for (const trade of account.trades) {
      const price = getCurrentPrice(trade.instrument.symbol);
      if (!price || (price.bid === 0 && price.ask === 0)) continue;

      const openPriceFloat = Number(trade.open_price) / 100000;
      const closePrice = trade.side === 'BUY' ? price.bid : price.ask;
      const direction = trade.side === 'BUY' ? 1 : -1;
      const pnlRaw = (closePrice - openPriceFloat) * trade.volume * trade.instrument.lot_size * direction;
      totalUnrealizedPnlCents += BigInt(Math.round(pnlRaw * 100));
    }

    const equity = BigInt(account.balance) + totalUnrealizedPnlCents;
    const marginUsed = BigInt(account.margin_used);

    if (marginUsed <= BigInt(0)) continue;

    const marginLevel = Number(equity * BigInt(100)) / Number(marginUsed);

    if (marginLevel < STOP_OUT_LEVEL) {
      logger.warn({
        accountId: account.id,
        marginLevel: marginLevel.toFixed(2),
        equity: equity.toString(),
        marginUsed: marginUsed.toString(),
      }, '[PositionMonitor] MARGIN CALL — liquidating positions');

      // Close the biggest losing position first
      let worstTrade = account.trades[0];
      let worstPnl = Infinity;
      for (const trade of account.trades) {
        const price = getCurrentPrice(trade.instrument.symbol);
        if (!price) continue;
        const openPriceFloat = Number(trade.open_price) / 100000;
        const closePrice = trade.side === 'BUY' ? price.bid : price.ask;
        const direction = trade.side === 'BUY' ? 1 : -1;
        const pnl = (closePrice - openPriceFloat) * trade.volume * trade.instrument.lot_size * direction;
        if (pnl < worstPnl) {
          worstPnl = pnl;
          worstTrade = trade;
        }
      }

      const price = getCurrentPrice(worstTrade.instrument.symbol);
      if (price) {
        const closePrice = worstTrade.side === 'BUY' ? price.bid : price.ask;
        await closeTradeAtPrice(
          { ...worstTrade, account },
          closePrice,
          'LIQUIDATED',
        );
      }
    }
  }
}

// ─── 4. Dealer Trades — scheduled close + client SL/TP ───

async function checkDealerPnlTargets() {
  // 1. Check SL/TP set BY THE CLIENT on dealer trades (real price based)
  const dealerTradesWithSLTP = await prisma.trade.findMany({
    where: {
      status: 'OPEN',
      swap: { gt: 0 }, // dealer trades
      OR: [
        { stop_loss: { not: null } },
        { take_profit: { not: null } },
      ],
    },
    include: {
      instrument: { select: { symbol: true, pip_size: true, lot_size: true } },
      account: { select: { id: true, balance: true, margin_used: true, equity: true, leverage: true } },
    },
  });

  for (const trade of dealerTradesWithSLTP) {
    const price = getCurrentPrice(trade.instrument.symbol);
    if (!price || (price.bid === 0 && price.ask === 0)) continue;

    const closePrice = trade.side === 'BUY' ? price.bid : price.ask;
    let triggered = false;
    let reason = '';

    if (trade.stop_loss !== null) {
      if (trade.side === 'BUY' && closePrice <= trade.stop_loss) { triggered = true; reason = 'STOP_LOSS'; }
      if (trade.side === 'SELL' && closePrice >= trade.stop_loss) { triggered = true; reason = 'STOP_LOSS'; }
    }
    if (!triggered && trade.take_profit !== null) {
      if (trade.side === 'BUY' && closePrice >= trade.take_profit) { triggered = true; reason = 'TAKE_PROFIT'; }
      if (trade.side === 'SELL' && closePrice <= trade.take_profit) { triggered = true; reason = 'TAKE_PROFIT'; }
    }

    if (triggered) {
      await closeDealerTrade(trade, closePrice, reason);
    }
  }

  // 2. Check scheduled close (time expired) — close with pnl_target
  const expiredTrades = await prisma.trade.findMany({
    where: {
      status: 'OPEN',
      swap: { gt: 0 },
      scheduled_close_at: { not: null, lte: new Date() },
    },
    include: {
      instrument: { select: { symbol: true, pip_size: true, lot_size: true } },
      account: { select: { id: true, balance: true, margin_used: true, equity: true, leverage: true } },
    },
  });

  for (const trade of expiredTrades) {
    const price = getCurrentPrice(trade.instrument.symbol);
    const closePrice = price ? (trade.side === 'BUY' ? price.bid : price.ask) : Number(trade.open_price) / 100000;
    await closeDealerTrade(trade, closePrice, 'DEALER_SCHEDULED');
  }
}

async function closeDealerTrade(trade: any, closePrice: number, reason: string) {
  const investCents = BigInt(trade.swap);
  const targetPnl = trade.pnl_target ? BigInt(trade.pnl_target) : null;
  const account = trade.account;

  // For scheduled close, use dealer's target P&L. For SL/TP, use real market P&L.
  let finalPnl: bigint;
  if (reason === 'DEALER_SCHEDULED' && targetPnl !== null) {
    finalPnl = targetPnl;
  } else {
    // Real market P&L
    const openPriceFloat = Number(trade.open_price) / 100000;
    const direction = trade.side === 'BUY' ? 1 : -1;
    const lotSize = trade.instrument?.lot_size || 1;
    const pnlRaw = (closePrice - openPriceFloat) * trade.volume * lotSize * direction;
    finalPnl = BigInt(Math.round(pnlRaw * 100));
  }

  const closePriceInt = priceToInt(closePrice, 5);

  await prisma.trade.update({
    where: { id: trade.id },
    data: { close_price: closePriceInt, pnl: finalPnl, status: 'CLOSED', close_time: new Date() },
  });

  if (account) {
    const newBalance = BigInt(account.balance) + finalPnl;
    let newMarginUsed = BigInt(account.margin_used) - investCents;
    if (newMarginUsed < BigInt(0)) newMarginUsed = BigInt(0);

    await prisma.account.update({
      where: { id: account.id },
      data: { balance: newBalance, margin_used: newMarginUsed, equity: newBalance - newMarginUsed },
    });

    await prisma.transaction.create({
      data: {
        tenant_id: trade.tenant_id,
        account_id: account.id,
        type: 'TRADE_PNL',
        amount: finalPnl,
        description: `${reason}: ${trade.side} ${trade.instrument?.symbol || 'unknown'} dealer trade closed`,
      },
    });
  }

  logger.info({
    tradeId: trade.id,
    symbol: trade.instrument?.symbol,
    reason,
    finalPnl: finalPnl.toString(),
  }, `[PositionMonitor] Dealer trade closed — ${reason}`);
}

// ─── Helpers ───

async function closeTradeAtPrice(trade: any, closePrice: number, reason: string) {
  const closePriceInt = priceToInt(closePrice, 5);
  const openPriceFloat = Number(trade.open_price) / 100000;
  const direction = trade.side === 'BUY' ? 1 : -1;
  const lotSize = trade.instrument?.lot_size || trade.lot_size || 1;
  const pnlRaw = (closePrice - openPriceFloat) * trade.volume * lotSize * direction;
  const pnlCents = BigInt(Math.round(pnlRaw * 100));

  const status = reason === 'LIQUIDATED' ? 'LIQUIDATED' : 'CLOSED';

  await prisma.trade.update({
    where: { id: trade.id },
    data: { close_price: closePriceInt, pnl: pnlCents, status, close_time: new Date() },
  });

  // Update account
  const account = trade.account || await prisma.account.findFirst({ where: { id: trade.account_id } });
  if (account) {
    const leverage = account.leverage || 100;
    const marginRelease = calculateMarginCents(openPriceFloat, trade.volume, lotSize, leverage);
    const newBalance = BigInt(account.balance) + pnlCents;
    let newMarginUsed = BigInt(account.margin_used) - marginRelease;
    if (newMarginUsed < BigInt(0)) newMarginUsed = BigInt(0);

    await prisma.account.update({
      where: { id: account.id },
      data: { balance: newBalance, margin_used: newMarginUsed, equity: newBalance },
    });

    await prisma.transaction.create({
      data: {
        tenant_id: trade.tenant_id,
        account_id: account.id,
        type: 'TRADE_PNL',
        amount: pnlCents,
        description: `${reason}: ${trade.side} ${trade.volume} ${trade.instrument?.symbol || 'unknown'} P&L`,
      },
    });
  }

  logger.info({
    tradeId: trade.id,
    reason,
    symbol: trade.instrument?.symbol,
    side: trade.side,
    closePrice,
    pnl: pnlCents.toString(),
  }, `[PositionMonitor] Position closed — ${reason}`);
}

async function fillPendingOrder(order: any, price: { bid: number; ask: number }) {
  const executionPrice = order.side === 'BUY' ? price.ask : price.bid;

  // Find user's account
  const account = await prisma.account.findFirst({ where: { tenant_id: order.tenant_id, user_id: order.user_id } });
  if (!account) {
    logger.warn({ orderId: order.id }, '[PositionMonitor] No account for pending order, cancelling');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    return;
  }

  // Check margin
  const lotSize = order.instrument.lot_size;
  const marginRequired = calculateMarginCents(executionPrice, order.volume, lotSize, account.leverage);
  const availableMargin = BigInt(account.balance) - BigInt(account.margin_used);

  if (marginRequired > availableMargin) {
    logger.warn({ orderId: order.id, marginRequired: marginRequired.toString() }, '[PositionMonitor] Insufficient margin for pending order, cancelling');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    return;
  }

  // Create the trade
  const trade = await prisma.trade.create({
    data: {
      tenant_id: order.tenant_id,
      user_id: order.user_id,
      account_id: account.id,
      instrument_id: order.instrument_id,
      side: order.side,
      volume: order.volume,
      open_price: priceToInt(executionPrice, 5),
      stop_loss: order.stop_loss,
      take_profit: order.take_profit,
      commission: BigInt(0),
    },
  });

  // Update order
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'FILLED', filled_at: new Date() },
  });

  // Update account margin
  const newMarginUsed = BigInt(account.margin_used) + marginRequired;
  await prisma.account.update({
    where: { id: account.id },
    data: { margin_used: newMarginUsed, equity: BigInt(account.balance) - newMarginUsed },
  });

  logger.info({
    orderId: order.id,
    tradeId: trade.id,
    type: order.type,
    symbol: order.instrument.symbol,
    side: order.side,
    executionPrice,
  }, `[PositionMonitor] Pending ${order.type} order filled`);
}
