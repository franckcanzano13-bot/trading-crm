import { prisma } from './prisma';

/**
 * Tenant-scoped query helper using Prisma ORM with tenant_id filtering.
 */
export class TenantQuery {
  constructor(private tenantId: string) {}

  // ─── Users ───
  async findUserByEmail(email: string) {
    return prisma.user.findFirst({ where: { tenant_id: this.tenantId, email } });
  }

  async findUserById(id: string) {
    return prisma.user.findFirst({ where: { id, tenant_id: this.tenantId } });
  }

  async createUser(data: { email: string; password_hash: string; name: string }) {
    return prisma.user.create({
      data: { ...data, tenant_id: this.tenantId },
    });
  }

  async listUsers(limit = 50, offset = 0) {
    return prisma.user.findMany({
      where: { tenant_id: this.tenantId },
      select: {
        id: true, email: true, name: true, status: true, kyc_status: true, created_at: true,
        accounts: { select: { id: true, balance: true, equity: true, margin_used: true, leverage: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async updateUser(id: string, data: { status?: string; kyc_status?: string; name?: string }) {
    // VULN tenant_id filter: ensure update is scoped to current tenant
    const result = await prisma.user.updateMany({
      where: { id, tenant_id: this.tenantId },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.kyc_status && { kyc_status: data.kyc_status }),
        ...(data.name && { name: data.name }),
      },
    });
    if (result.count === 0) return null;
    return prisma.user.findUnique({ where: { id } });
  }

  // ─── Accounts ───
  async createAccount(userId: string, leverage = 100) {
    return prisma.account.create({
      data: { tenant_id: this.tenantId, user_id: userId, leverage, balance: BigInt(0), equity: BigInt(0) },
    });
  }

  async findAccountByUserId(userId: string) {
    return prisma.account.findFirst({ where: { tenant_id: this.tenantId, user_id: userId } });
  }

  async findAccountById(id: string) {
    return prisma.account.findFirst({ where: { id, tenant_id: this.tenantId } });
  }

  async updateAccountBalance(accountId: string, balance: bigint, marginUsed: bigint, equity: bigint) {
    // ESMA Negative Balance Protection: clamp balance and equity to 0
    const safeBalance = balance < BigInt(0) ? BigInt(0) : balance;
    const safeEquity = equity < BigInt(0) ? BigInt(0) : equity;
    const safeMargin = marginUsed < BigInt(0) ? BigInt(0) : marginUsed;
    const result = await prisma.account.updateMany({
      where: { id: accountId, tenant_id: this.tenantId },
      data: { balance: safeBalance, margin_used: safeMargin, equity: safeEquity },
    });
    if (result.count === 0) return null;
    return prisma.account.findUnique({ where: { id: accountId } });
  }

  // ─── Instruments ───
  async listInstruments(activeOnly = true) {
    return prisma.instrument.findMany({
      where: { tenant_id: this.tenantId, ...(activeOnly && { is_active: true }) },
      orderBy: { symbol: 'asc' },
    });
  }

  async findInstrumentBySymbol(symbol: string) {
    return prisma.instrument.findFirst({ where: { tenant_id: this.tenantId, symbol } });
  }

  async findInstrumentById(id: string) {
    return prisma.instrument.findFirst({ where: { id, tenant_id: this.tenantId } });
  }

  async upsertInstrument(data: {
    symbol: string; display_name: string; type: string;
    pip_size: number; lot_size: number; base_spread: number;
  }) {
    const existing = await prisma.instrument.findFirst({
      where: { tenant_id: this.tenantId, symbol: data.symbol },
    });
    if (existing) {
      return prisma.instrument.update({
        where: { id: existing.id },
        data: { display_name: data.display_name, type: data.type, pip_size: data.pip_size, lot_size: data.lot_size, base_spread: data.base_spread },
      });
    }
    return prisma.instrument.create({
      data: { ...data, tenant_id: this.tenantId },
    });
  }

  async updateInstrument(id: string, data: { spread_markup?: number; is_active?: boolean; min_volume?: number; max_volume?: number }) {
    const result = await prisma.instrument.updateMany({
      where: { id, tenant_id: this.tenantId },
      data: {
        ...(data.spread_markup !== undefined && { spread_markup: data.spread_markup }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        ...(data.min_volume !== undefined && { min_volume: data.min_volume }),
        ...(data.max_volume !== undefined && { max_volume: data.max_volume }),
      },
    });
    if (result.count === 0) return null;
    return prisma.instrument.findUnique({ where: { id } });
  }

  // ─── Trades ───
  async createTrade(data: {
    user_id: string; account_id: string; instrument_id: string;
    side: string; volume: number; open_price: bigint;
    stop_loss?: number; take_profit?: number; commission?: bigint;
    swap?: bigint; // reused to store invest_amount for dealer trades
    pnl_target?: bigint; scheduled_close_at?: Date;
  }) {
    return prisma.trade.create({
      data: {
        tenant_id: this.tenantId,
        user_id: data.user_id,
        account_id: data.account_id,
        instrument_id: data.instrument_id,
        side: data.side,
        volume: data.volume,
        open_price: data.open_price,
        stop_loss: data.stop_loss ?? null,
        take_profit: data.take_profit ?? null,
        commission: data.commission ?? BigInt(0),
        swap: data.swap ?? BigInt(0),
        pnl_target: data.pnl_target ?? null,
        scheduled_close_at: data.scheduled_close_at ?? null,
      },
    });
  }

  /** Find dealer trades that are past their scheduled close time */
  async findTradesDueForClose() {
    return prisma.trade.findMany({
      where: {
        tenant_id: this.tenantId,
        status: 'OPEN',
        scheduled_close_at: { not: null, lte: new Date() },
        pnl_target: { not: null },
      },
      include: {
        instrument: { select: { symbol: true, pip_size: true, lot_size: true } },
      },
    });
  }

  async findOpenTrades(userId?: string) {
    const trades = await prisma.trade.findMany({
      where: {
        tenant_id: this.tenantId,
        status: 'OPEN',
        ...(userId && { user_id: userId }),
      },
      include: {
        instrument: { select: { symbol: true, display_name: true, pip_size: true, lot_size: true } },
      },
      orderBy: { open_time: 'desc' },
    });
    return trades.map((t) => ({
      ...t,
      symbol: t.instrument.symbol,
      display_name: t.instrument.display_name,
      pip_size: t.instrument.pip_size,
      lot_size: t.instrument.lot_size,
    }));
  }

  async updateTradeSLTP(id: string, stopLoss: number | null, takeProfit: number | null) {
    const result = await prisma.trade.updateMany({
      where: { id, tenant_id: this.tenantId },
      data: { stop_loss: stopLoss, take_profit: takeProfit },
    });
    if (result.count === 0) return null;
    return prisma.trade.findUnique({ where: { id } });
  }

  async closeTrade(id: string, closePrice: bigint, pnl: bigint, status = 'CLOSED') {
    // Idempotent close: only updates if still OPEN — prevents double-close races
    const result = await prisma.trade.updateMany({
      where: { id, tenant_id: this.tenantId, status: 'OPEN' },
      data: { close_price: closePrice, pnl, status, close_time: new Date() },
    });
    if (result.count === 0) return null;
    return prisma.trade.findUnique({ where: { id } });
  }

  async findTradeById(id: string) {
    const trade = await prisma.trade.findFirst({
      where: { id, tenant_id: this.tenantId },
      include: {
        instrument: { select: { symbol: true, display_name: true, pip_size: true, lot_size: true } },
      },
    });
    if (!trade) return null;
    return {
      ...trade,
      symbol: trade.instrument.symbol,
      display_name: trade.instrument.display_name,
      pip_size: trade.instrument.pip_size,
      lot_size: trade.instrument.lot_size,
    };
  }

  async findTradeHistory(userId: string, limit = 50, offset = 0) {
    const trades = await prisma.trade.findMany({
      where: { tenant_id: this.tenantId, user_id: userId, NOT: { status: 'OPEN' } },
      include: { instrument: { select: { symbol: true, display_name: true } } },
      orderBy: { close_time: 'desc' },
      take: limit,
      skip: offset,
    });
    return trades.map((t) => ({ ...t, symbol: t.instrument.symbol, display_name: t.instrument.display_name }));
  }

  // ─── Orders ───
  async createOrder(data: {
    user_id: string; instrument_id: string; type: string; side: string;
    volume: number; price?: bigint; stop_loss?: number; take_profit?: number;
  }) {
    return prisma.order.create({
      data: {
        tenant_id: this.tenantId,
        user_id: data.user_id,
        instrument_id: data.instrument_id,
        type: data.type,
        side: data.side,
        volume: data.volume,
        price: data.price ?? null,
        stop_loss: data.stop_loss ?? null,
        take_profit: data.take_profit ?? null,
      },
    });
  }

  async findPendingOrders(userId?: string) {
    return prisma.order.findMany({
      where: { tenant_id: this.tenantId, status: 'PENDING', ...(userId && { user_id: userId }) },
      include: { instrument: { select: { symbol: true, display_name: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Update order status.
   * @param id Order ID
   * @param status New status
   * @param userId Optional: also enforce ownership (prevents IDOR — VULN-003)
   */
  async updateOrderStatus(id: string, status: string, userId?: string) {
    const result = await prisma.order.updateMany({
      where: { id, tenant_id: this.tenantId, ...(userId && { user_id: userId }) },
      data: { status, ...(status === 'FILLED' && { filled_at: new Date() }) },
    });
    if (result.count === 0) return null;
    return prisma.order.findUnique({ where: { id } });
  }

  // ─── Transactions ───
  async createTransaction(data: { account_id: string; type: string; amount: bigint; description: string }) {
    return prisma.transaction.create({
      data: { ...data, tenant_id: this.tenantId },
    });
  }

  async findTransactions(accountId: string, limit = 50, offset = 0) {
    return prisma.transaction.findMany({
      where: { tenant_id: this.tenantId, account_id: accountId },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  // ─── Price History ───
  async insertCandle(data: {
    instrument_id: string; timeframe: string;
    open: number; high: number; low: number; close: number; volume: number; timestamp: Date;
  }) {
    const existing = await prisma.priceHistory.findFirst({
      where: { instrument_id: data.instrument_id, timeframe: data.timeframe, timestamp: data.timestamp },
    });
    if (existing) {
      return prisma.priceHistory.update({
        where: { id: existing.id },
        data: {
          high: Math.max(existing.high, data.high),
          low: Math.min(existing.low, data.low),
          close: data.close,
          volume: existing.volume + data.volume,
        },
      });
    }
    return prisma.priceHistory.create({
      data: { ...data, tenant_id: this.tenantId },
    });
  }

  async getCandles(instrumentId: string, timeframe: string, limit = 500) {
    return prisma.priceHistory.findMany({
      where: { tenant_id: this.tenantId, instrument_id: instrumentId, timeframe },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  // ─── Dealer ───
  async createDealerIntervention(data: {
    trade_id: string; dealer_id: string; action: string;
    original_price?: bigint; modified_price?: bigint; reason: string;
  }) {
    return prisma.dealerIntervention.create({
      data: {
        tenant_id: this.tenantId,
        trade_id: data.trade_id,
        dealer_id: data.dealer_id,
        action: data.action,
        original_price: data.original_price ?? null,
        modified_price: data.modified_price ?? null,
        reason: data.reason,
      },
    });
  }

  async findDealerInterventions(limit = 50, offset = 0) {
    return prisma.dealerIntervention.findMany({
      where: { tenant_id: this.tenantId },
      include: {
        trade: {
          select: { side: true, volume: true, instrument: { select: { symbol: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getDealerSettings(tenantId: string) {
    return prisma.dealerSettings.findFirst({ where: { tenant_id: tenantId } });
  }

  async upsertDealerSettings(tenantId: string, data: {
    max_slippage?: number; requote_enabled?: boolean;
    spread_multiplier?: number; auto_delay_ms?: number;
  }) {
    return prisma.dealerSettings.upsert({
      where: { tenant_id: tenantId },
      create: {
        tenant_id: tenantId,
        max_slippage: data.max_slippage ?? 3,
        requote_enabled: data.requote_enabled ?? false,
        spread_multiplier: data.spread_multiplier ?? 1.0,
        auto_delay_ms: data.auto_delay_ms ?? 0,
      },
      update: {
        ...(data.max_slippage !== undefined && { max_slippage: data.max_slippage }),
        ...(data.requote_enabled !== undefined && { requote_enabled: data.requote_enabled }),
        ...(data.spread_multiplier !== undefined && { spread_multiplier: data.spread_multiplier }),
        ...(data.auto_delay_ms !== undefined && { auto_delay_ms: data.auto_delay_ms }),
      },
    });
  }

  // ─── Dashboard Stats ───
  async getDashboardStats() {
    const [totalUsers, accountStats, tradeStats, openPositions] = await Promise.all([
      prisma.user.count({ where: { tenant_id: this.tenantId } }),
      prisma.account.aggregate({ where: { tenant_id: this.tenantId }, _count: true, _sum: { balance: true } }),
      prisma.trade.aggregate({ where: { tenant_id: this.tenantId, status: 'CLOSED' }, _count: true, _sum: { pnl: true } }),
      prisma.trade.count({ where: { tenant_id: this.tenantId, status: 'OPEN' } }),
    ]);
    return {
      total_users: totalUsers,
      total_accounts: accountStats._count,
      total_balance_cents: (accountStats._sum.balance ?? BigInt(0)).toString(),
      closed_trades: tradeStats._count,
      broker_pnl_cents: (tradeStats._sum.pnl ?? BigInt(0)).toString(),
      open_positions: openPositions,
    };
  }
}
