import { TenantQuery } from '../../shared/database/tenant-queries';
import { prisma } from '../../shared/database/prisma';
import { getCurrentPrice } from '../pricing/price-store';
import { calculatePnlCents, calculateMarginCents, logger } from '../../shared/utils/index';

export interface RiskCheck {
  equity: bigint;
  marginUsed: bigint;
  marginLevel: number; // percentage
  isMarginCall: boolean;
  isStopOut: boolean;
}

/**
 * Calculate real-time risk metrics for an account.
 */
export async function calculateAccountRisk(
  tenantQuery: TenantQuery,
  accountId: string,
  marginCallLevel = 100,
  stopOutLevel = 50
): Promise<RiskCheck> {
  const account = await tenantQuery.findAccountById(accountId);
  if (!account) {
    throw new Error('Account not found');
  }

  // Get all open trades for this account's user
  const openTrades = await tenantQuery.findOpenTrades(account.user_id);

  let unrealizedPnl = BigInt(0);
  let totalMargin = BigInt(0);

  for (const trade of openTrades) {
    if (trade.account_id !== accountId) continue;

    const price = getCurrentPrice(trade.symbol);
    const currentPrice = trade.side === 'BUY' ? price.bid : price.ask;
    const openPriceFloat = Number(trade.open_price) / 100000;

    if (currentPrice > 0) {
      const direction = trade.side === 'BUY' ? 1 : -1;
      const pnl = calculatePnlCents(openPriceFloat, currentPrice, trade.volume, trade.lot_size, direction as 1 | -1);
      unrealizedPnl += pnl;
    }

    const marginForTrade = calculateMarginCents(
      Number(trade.open_price) / 100000,
      trade.volume,
      trade.lot_size,
      account.leverage
    );
    totalMargin += marginForTrade;
  }

  const balance = BigInt(account.balance);
  const equity = balance + unrealizedPnl;
  const marginLevel = totalMargin > BigInt(0)
    ? Number(equity * BigInt(10000) / totalMargin) / 100
    : Infinity;

  return {
    equity,
    marginUsed: totalMargin,
    marginLevel,
    isMarginCall: marginLevel <= marginCallLevel && marginLevel > stopOutLevel,
    isStopOut: marginLevel <= stopOutLevel,
  };
}

/**
 * Check and liquidate positions if stop-out level is breached.
 */
export async function checkAndLiquidate(
  tenantQuery: TenantQuery,
  userId: string,
  accountId: string,
  stopOutLevel = 50
): Promise<string[]> {
  const liquidated: string[] = [];
  const risk = await calculateAccountRisk(tenantQuery, accountId, 100, stopOutLevel);

  if (!risk.isStopOut) return liquidated;

  logger.warn({ accountId, marginLevel: risk.marginLevel }, 'Stop-out triggered');

  // Get open trades sorted by loss (liquidate biggest losers first)
  type OpenTrade = Awaited<ReturnType<TenantQuery['findOpenTrades']>>[number];
  type TradeWithPnl = OpenTrade & { currentPrice: number; pnl: bigint };
  const openTrades: OpenTrade[] = await tenantQuery.findOpenTrades(userId);
  const tradesWithPnl: TradeWithPnl[] = openTrades
    .filter((t) => t.account_id === accountId)
    .map((trade) => {
      const price = getCurrentPrice(trade.symbol);
      const currentPrice = trade.side === 'BUY' ? price.bid : price.ask;
      const openPriceFloat = Number(trade.open_price) / 100000;
      const direction = trade.side === 'BUY' ? 1 : -1;
      const pnl = calculatePnlCents(openPriceFloat, currentPrice, trade.volume, trade.lot_size, direction as 1 | -1);
      return { ...trade, currentPrice, pnl };
    })
    .sort((a, b) => Number(a.pnl - b.pnl)); // Worst P&L first

  // Resolve tenantId from the TenantQuery instance (private field) for atomicity below
  const tenantId = (tenantQuery as unknown as { tenantId: string }).tenantId;

  for (const trade of tradesWithPnl) {
    const closePriceInt = BigInt(Math.round(trade.currentPrice * 100000));

    // EXEC-001: Atomic liquidation — close + balance update + transaction.
    // Idempotent — only closes if still OPEN.
    const didClose = await prisma.$transaction(async (tx) => {
      const closeResult = await tx.trade.updateMany({
        where: { id: trade.id, tenant_id: tenantId, status: 'OPEN' },
        data: { close_price: closePriceInt, pnl: trade.pnl, status: 'LIQUIDATED', close_time: new Date() },
      });
      if (closeResult.count === 0) {
        return false;
      }

      const account = await tx.account.findFirst({
        where: { id: accountId, tenant_id: tenantId },
      });
      if (account) {
        const margin = calculateMarginCents(
          Number(trade.open_price) / 100000,
          trade.volume,
          trade.lot_size,
          account.leverage
        );
        const newBalanceRaw = BigInt(account.balance) + trade.pnl;
        const newMarginRaw = BigInt(account.margin_used) - margin;

        // ESMA Negative Balance Protection: clamp to 0
        const safeBalance = newBalanceRaw < 0n ? 0n : newBalanceRaw;
        const safeMargin = newMarginRaw < 0n ? 0n : newMarginRaw;
        const safeEquity = safeBalance;

        await tx.account.updateMany({
          where: { id: account.id, tenant_id: tenantId },
          data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
        });

        await tx.transaction.create({
          data: {
            tenant_id: tenantId,
            account_id: accountId,
            type: 'TRADE_PNL',
            amount: trade.pnl,
            description: `Liquidated ${trade.side} ${trade.volume} ${trade.symbol}`,
          },
        });
      }
      return true;
    });

    if (!didClose) continue;

    liquidated.push(trade.id);
    logger.info({ tradeId: trade.id, pnl: trade.pnl.toString() }, 'Position liquidated');

    // Re-check risk after each liquidation
    const updatedRisk = await calculateAccountRisk(tenantQuery, accountId, 100, stopOutLevel);
    if (!updatedRisk.isStopOut) break;
  }

  return liquidated;
}
