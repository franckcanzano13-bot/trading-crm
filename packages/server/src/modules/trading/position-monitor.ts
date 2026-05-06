import { prisma } from '../../shared/database/prisma';
import { getCurrentPrice } from '../pricing/price-store';
import { logger, priceToInt, calculateMarginCents, calculatePnlCents } from '../../shared/utils/index';
import { audit } from '../../shared/audit';

/**
 * Position Monitor — Background loop that checks all open positions against live prices.
 *
 * Handles:
 * 1. SL/TP execution — closes positions when price hits stop_loss or take_profit
 * 2. LIMIT/STOP order matching — fills pending orders when price reaches target
 * 3. Margin call / auto-liquidation — closes positions when margin level < stop-out
 */

// Sprint 4 bonus: 250ms is closer to industry standard (cTrader/MT5 sub-second).
// Auditor flagged 1s as too slow for crypto volatility.
// Configurable via env to allow tuning under load.
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS) || 250;
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
      checkTrailingStops(),
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

// ─── 1b. Sprint 5.4 — Trailing Stop ───

/**
 * Pure decision function for a trailing stop.
 * Given the trade side, current price, distance, and the recorded
 * favorable extreme, returns the new extreme and whether the trade
 * should close.
 *
 * BUY:  trail_high = max(prev, currentPrice). effective SL = trail_high - distance.
 *        Close if currentPrice <= effective SL.
 * SELL: trail_low  = min(prev, currentPrice). effective SL = trail_low + distance.
 *        Close if currentPrice >= effective SL.
 *
 * Exported for unit-testing in isolation from the DB layer.
 */
export function evaluateTrailingStop(params: {
  side: 'BUY' | 'SELL';
  currentPrice: number;
  distance: number;
  trailingHigh: number; // for BUY: highest seen; for SELL: lowest seen
}): { newTrailingHigh: number; shouldClose: boolean; effectiveStop: number } {
  const { side, currentPrice, distance, trailingHigh } = params;

  if (side === 'BUY') {
    const newTrailingHigh = currentPrice > trailingHigh ? currentPrice : trailingHigh;
    const effectiveStop = newTrailingHigh - distance;
    const shouldClose = currentPrice <= effectiveStop;
    return { newTrailingHigh, shouldClose, effectiveStop };
  }

  // SELL: trailingHigh actually stores the lowest price seen since open
  const newTrailingHigh = currentPrice < trailingHigh ? currentPrice : trailingHigh;
  const effectiveStop = newTrailingHigh + distance;
  const shouldClose = currentPrice >= effectiveStop;
  return { newTrailingHigh, shouldClose, effectiveStop };
}

async function checkTrailingStops() {
  const trades = await prisma.trade.findMany({
    where: {
      status: 'OPEN',
      swap: { lte: 0 }, // exclude dealer trades
      trailing_stop_distance: { not: null },
    },
    include: {
      instrument: { select: { symbol: true, pip_size: true, lot_size: true } },
      account: { select: { id: true, balance: true, margin_used: true, equity: true, leverage: true } },
    },
  });

  const updates: Array<{ id: string; newHigh: number }> = [];

  for (const trade of trades) {
    const price = getCurrentPrice(trade.instrument.symbol);
    if (!price || (price.bid === 0 && price.ask === 0)) continue;

    const distance = trade.trailing_stop_distance as number;
    const openPriceFloat = Number(trade.open_price) / 100000;
    const trailingHigh = trade.trailing_stop_high ?? openPriceFloat;

    // Use bid for BUY (close-at-bid) and ask for SELL (close-at-ask) — same
    // convention as fixed SL/TP.
    const currentPrice = trade.side === 'BUY' ? price.bid : price.ask;

    const decision = evaluateTrailingStop({
      side: trade.side as 'BUY' | 'SELL',
      currentPrice,
      distance,
      trailingHigh,
    });

    if (decision.shouldClose) {
      await closeTradeAtPrice(trade, currentPrice, 'TRAILING_STOP');
      continue;
    }

    if (decision.newTrailingHigh !== trailingHigh) {
      updates.push({ id: trade.id, newHigh: decision.newTrailingHigh });
    }
  }

  // Batch the trailing_stop_high updates so the hot path stays cheap.
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.trade.update({ where: { id: u.id }, data: { trailing_stop_high: u.newHigh } })
      )
    );
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

/**
 * Sprint 5.4 — Cancel all PENDING siblings of an OCO group (excluding the
 * order that just filled). Exported for direct invocation by other code paths
 * (e.g. tests, manual fill helpers).
 */
export async function cancelOcoSiblings(ocoGroupId: string, filledOrderId: string): Promise<number> {
  if (!ocoGroupId) return 0;
  const result = await prisma.order.updateMany({
    where: {
      oco_group_id: ocoGroupId,
      status: 'PENDING',
      NOT: { id: filledOrderId },
    },
    data: { status: 'CANCELLED', filled_at: null },
  });
  if (result.count > 0) {
    logger.info({ ocoGroupId, filledOrderId, cancelled: result.count }, '[PositionMonitor] OCO siblings cancelled');
  }
  return result.count;
}

// ─── 3. Margin Call / Auto-Liquidation ───

/**
 * Compute total unrealized P&L (cents) and rank trades worst-first.
 * Returns null if no live price is available for the trade list.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function computeAccountState(trades: Array<any>) {
  let totalUnrealizedPnlCents = BigInt(0);
  const ranked: Array<{ trade: any; pnlCents: bigint; closePrice: number }> = [];

  for (const trade of trades) {
    const price = getCurrentPrice(trade.instrument.symbol);
    if (!price || (price.bid === 0 && price.ask === 0)) continue;
    const openPriceFloat = Number(trade.open_price) / 100000;
    const closePrice = trade.side === 'BUY' ? price.bid : price.ask;
    const direction = trade.side === 'BUY' ? 1 : -1;
    // Sprint 4.3: decimal.js-backed precision
    const pnlCents = calculatePnlCents(openPriceFloat, closePrice, trade.volume, trade.instrument.lot_size, direction as 1 | -1);
    totalUnrealizedPnlCents += pnlCents;
    ranked.push({ trade, pnlCents, closePrice });
  }

  // Sort worst-first (largest negative P&L first)
  ranked.sort((a, b) => (a.pnlCents < b.pnlCents ? -1 : a.pnlCents > b.pnlCents ? 1 : 0));
  return { totalUnrealizedPnlCents, ranked };
}

/**
 * EXEC-003: Cascade liquidation. Close worst-first trades repeatedly within
 * a single tick until margin level recovers above STOP_OUT_LEVEL or there are
 * no positions left. Prevents the 1-trade-per-second cap that exposed clients
 * during crashes (10 positions × 1s = 10s of further losses).
 */
async function checkMarginCalls() {
  const accounts = await prisma.account.findMany({
    where: { margin_used: { gt: 0 } },
    include: {
      trades: {
        where: { status: 'OPEN' },
        include: { instrument: { select: { symbol: true, pip_size: true, lot_size: true } } },
      },
    },
  });

  const MAX_LIQUIDATIONS_PER_TICK = 50; // safety cap to bound a single tick

  for (const account of accounts) {
    if (account.trades.length === 0) continue;

    let liveTrades = account.trades.slice();
    let liveBalance = BigInt(account.balance);
    let liveMarginUsed = BigInt(account.margin_used);
    let iterations = 0;

    while (iterations < MAX_LIQUIDATIONS_PER_TICK) {
      iterations++;
      if (liveTrades.length === 0) break;
      if (liveMarginUsed <= BigInt(0)) break;

      const { totalUnrealizedPnlCents, ranked } = computeAccountState(liveTrades);
      const equity = liveBalance + totalUnrealizedPnlCents;
      const marginLevel = Number(equity * BigInt(100)) / Number(liveMarginUsed);

      if (marginLevel >= STOP_OUT_LEVEL) break; // recovered

      if (ranked.length === 0) break; // no priceable trades, abort

      logger.warn({
        accountId: account.id,
        marginLevel: marginLevel.toFixed(2),
        equity: equity.toString(),
        marginUsed: liveMarginUsed.toString(),
        iteration: iterations,
        remainingPositions: liveTrades.length,
      }, '[PositionMonitor] MARGIN CALL — cascade liquidation in progress');

      const worst = ranked[0];
      const closeResult = await closeTradeAtPrice(
        { ...worst.trade, account },
        worst.closePrice,
        'LIQUIDATED',
      );

      // Track post-close state in memory so the next iteration uses fresh figures
      // without re-querying. closeTradeAtPrice returns the new account snapshot
      // when successful; if it didn't, fall back to a manual estimate.
      if (closeResult && typeof closeResult === 'object' && 'newBalance' in closeResult) {
        liveBalance = (closeResult as { newBalance: bigint }).newBalance;
        liveMarginUsed = (closeResult as { newMarginUsed: bigint }).newMarginUsed;
      } else {
        // Best-effort estimate: pnl + balance, release the worst trade's margin
        liveBalance = liveBalance + worst.pnlCents;
        if (liveBalance < BigInt(0)) liveBalance = BigInt(0); // ESMA NBP
        // We don't know exact margin release without re-querying; reset by re-fetch next loop.
        const refreshed = await prisma.account.findUnique({ where: { id: account.id } });
        if (refreshed) {
          liveBalance = BigInt(refreshed.balance);
          liveMarginUsed = BigInt(refreshed.margin_used);
        }
      }

      // Drop the just-closed trade from the working set
      liveTrades = liveTrades.filter(t => t.id !== worst.trade.id);
    }

    if (iterations >= MAX_LIQUIDATIONS_PER_TICK) {
      logger.error({ accountId: account.id }, '[PositionMonitor] cascade liquidation hit safety cap');
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
    // Real market P&L — Sprint 4.3 decimal precision
    const openPriceFloat = Number(trade.open_price) / 100000;
    const direction = trade.side === 'BUY' ? 1 : -1;
    const lotSize = trade.instrument?.lot_size || 1;
    finalPnl = calculatePnlCents(openPriceFloat, closePrice, trade.volume, lotSize, direction as 1 | -1);
  }

  const closePriceInt = priceToInt(closePrice, 5);

  // EXEC-001: Atomic close + balance update + transaction.
  // Idempotent — only closes if still OPEN (prevents double-close races between
  // SL/TP, scheduled timer, and periodic checker).
  await prisma.$transaction(async (tx) => {
    const closeResult = await tx.trade.updateMany({
      where: { id: trade.id, status: 'OPEN' },
      data: { close_price: closePriceInt, pnl: finalPnl, status: 'CLOSED', close_time: new Date() },
    });
    if (closeResult.count === 0) {
      // Already closed by another worker — bail out without further side effects
      return;
    }

    if (account) {
      const newBalanceRaw = BigInt(account.balance) + finalPnl;
      const newMarginUsedRaw = BigInt(account.margin_used) - investCents;

      // ESMA Negative Balance Protection: clamp to 0
      const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
      const safeMargin = newMarginUsedRaw < 0n ? 0n : newMarginUsedRaw;
      const safeEquity = safeBalance - safeMargin < 0n ? 0n : safeBalance - safeMargin;

      await tx.account.updateMany({
        where: { id: account.id, tenant_id: trade.tenant_id },
        data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
      });

      await tx.transaction.create({
        data: {
          tenant_id: trade.tenant_id,
          account_id: account.id,
          type: 'TRADE_PNL',
          amount: finalPnl,
          description: `${reason}: ${trade.side} ${trade.instrument?.symbol || 'unknown'} dealer trade closed`,
        },
      });
    }
  });

  logger.info({
    tradeId: trade.id,
    symbol: trade.instrument?.symbol,
    reason,
    finalPnl: finalPnl.toString(),
  }, `[PositionMonitor] Dealer trade closed — ${reason}`);
}

// ─── Helpers ───

async function closeTradeAtPrice(
  trade: any,
  closePrice: number,
  reason: string,
): Promise<{ closed: boolean; newBalance?: bigint; newMarginUsed?: bigint }> {
  const closePriceInt = priceToInt(closePrice, 5);
  const openPriceFloat = Number(trade.open_price) / 100000;
  const direction = trade.side === 'BUY' ? 1 : -1;
  const lotSize = trade.instrument?.lot_size || trade.lot_size || 1;
  // Sprint 4.3: decimal.js for cumulative-error-free P&L
  const pnlCents = calculatePnlCents(openPriceFloat, closePrice, trade.volume, lotSize, direction as 1 | -1);

  const status = reason === 'LIQUIDATED' ? 'LIQUIDATED' : 'CLOSED';
  const accountId = trade.account?.id || trade.account_id;

  const result = await prisma.$transaction(async (tx) => {
    const closeResult = await tx.trade.updateMany({
      where: { id: trade.id, status: 'OPEN' },
      data: { close_price: closePriceInt, pnl: pnlCents, status, close_time: new Date() },
    });
    if (closeResult.count === 0) {
      return { closed: false } as const;
    }

    const account = await tx.account.findFirst({ where: { id: accountId, tenant_id: trade.tenant_id } });
    if (!account) return { closed: true } as const;

    const leverage = account.leverage || 100;
    const marginRelease = calculateMarginCents(openPriceFloat, trade.volume, lotSize, leverage);
    const newBalanceRaw = BigInt(account.balance) + pnlCents;
    const newMarginUsedRaw = BigInt(account.margin_used) - marginRelease;

    // ESMA Negative Balance Protection: clamp to 0
    const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
    const safeMargin = newMarginUsedRaw < 0n ? 0n : newMarginUsedRaw;
    const safeEquity = safeBalance;

    await tx.account.updateMany({
      where: { id: account.id, tenant_id: trade.tenant_id },
      data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
    });

    await tx.transaction.create({
      data: {
        tenant_id: trade.tenant_id,
        account_id: account.id,
        type: 'TRADE_PNL',
        amount: pnlCents,
        description: `${reason}: ${trade.side} ${trade.volume} ${trade.instrument?.symbol || 'unknown'} P&L`,
      },
    });

    return { closed: true, newBalance: safeBalance, newMarginUsed: safeMargin } as const;
  });

  logger.info({
    tradeId: trade.id,
    reason,
    symbol: trade.instrument?.symbol,
    side: trade.side,
    closePrice,
    pnl: pnlCents.toString(),
  }, `[PositionMonitor] Position closed — ${reason}`);

  // Sprint 4.4: audit system-triggered closes (SL, TP, LIQUIDATION)
  if (result.closed) {
    await audit.log({
      tenantId: trade.tenant_id, actorId: 'system', actorType: 'system',
      action: `POSITION_${reason}`, target: `trade:${trade.id}`,
      details: {
        user_id: trade.user_id, account_id: accountId,
        symbol: trade.instrument?.symbol, side: trade.side, volume: trade.volume,
        open_price: trade.open_price?.toString(), close_price: closePriceInt.toString(),
        pnl_cents: pnlCents.toString(),
      },
    });
  }

  return result;
}

async function fillPendingOrder(order: any, price: { bid: number; ask: number }) {
  const executionPrice = order.side === 'BUY' ? price.ask : price.bid;
  const lotSize = order.instrument.lot_size;

  // EXEC-001: Atomic fill — create trade + update order + reserve margin.
  // Idempotent — only fills if order still PENDING.
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Re-check order is still pending
      const fresh = await tx.order.findFirst({ where: { id: order.id, status: 'PENDING' } });
      if (!fresh) {
        return { skipped: true } as const;
      }

      const account = await tx.account.findFirst({
        where: { tenant_id: order.tenant_id, user_id: order.user_id },
      });
      if (!account) {
        await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        return { cancelled: 'NO_ACCOUNT' } as const;
      }

      const marginRequired = calculateMarginCents(executionPrice, order.volume, lotSize, account.leverage);
      const availableMargin = BigInt(account.balance) - BigInt(account.margin_used);

      if (marginRequired > availableMargin) {
        await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        return { cancelled: 'INSUFFICIENT_MARGIN', marginRequired } as const;
      }

      const trade = await tx.trade.create({
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

      await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'FILLED', filled_at: new Date() },
      });

      const newMarginUsedRaw = BigInt(account.margin_used) + marginRequired;
      const newBalanceRaw = BigInt(account.balance);
      const newEquityRaw = newBalanceRaw - newMarginUsedRaw;

      // ESMA Negative Balance Protection: clamp to 0
      const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
      const safeMargin = newMarginUsedRaw < 0n ? 0n : newMarginUsedRaw;
      const safeEquity = newEquityRaw < 0n ? 0n : newEquityRaw;

      await tx.account.updateMany({
        where: { id: account.id, tenant_id: order.tenant_id },
        data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
      });

      return { trade } as const;
    });

    if ('skipped' in result) return;
    if ('cancelled' in result) {
      if (result.cancelled === 'NO_ACCOUNT') {
        logger.warn({ orderId: order.id }, '[PositionMonitor] No account for pending order, cancelling');
      } else {
        logger.warn(
          { orderId: order.id, marginRequired: (result as { marginRequired?: bigint }).marginRequired?.toString() },
          '[PositionMonitor] Insufficient margin for pending order, cancelling'
        );
      }
      return;
    }

    logger.info({
      orderId: order.id,
      tradeId: result.trade.id,
      type: order.type,
      symbol: order.instrument.symbol,
      side: order.side,
      executionPrice,
    }, `[PositionMonitor] Pending ${order.type} order filled`);

    // Sprint 5.4: cancel OCO sibling(s) on successful fill.
    if (order.oco_group_id) {
      await cancelOcoSiblings(order.oco_group_id, order.id);
    }
  } catch (err) {
    logger.error({ err, orderId: order.id }, '[PositionMonitor] Failed to fill pending order');
  }
}
