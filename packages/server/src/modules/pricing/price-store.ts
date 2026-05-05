import type { PriceTick } from '@tradexlabel/shared';

/**
 * In-memory price store. Updated by the price engine (Phase 2).
 * Provides last known prices for order execution and P&L calculation.
 */
const prices = new Map<string, PriceTick>();

// Default prices for development/testing
const DEFAULT_PRICES: Record<string, { bid: number; ask: number }> = {
  EURUSD: { bid: 1.0850, ask: 1.0852 },
  GBPUSD: { bid: 1.2650, ask: 1.2653 },
  USDJPY: { bid: 149.50, ask: 149.53 },
  USDCHF: { bid: 0.8780, ask: 0.8783 },
  AUDUSD: { bid: 0.6550, ask: 0.6553 },
  NZDUSD: { bid: 0.6100, ask: 0.6103 },
  USDCAD: { bid: 1.3560, ask: 1.3563 },
  EURGBP: { bid: 0.8570, ask: 0.8573 },
  BTCUSD: { bid: 67500.00, ask: 67550.00 },
  ETHUSD: { bid: 3450.00, ask: 3453.00 },
  XRPUSD: { bid: 0.5500, ask: 0.5505 },
  SOLUSD: { bid: 145.00, ask: 145.20 },
  ADAUSD: { bid: 0.4500, ask: 0.4503 },
  DOGEUSD: { bid: 0.1500, ask: 0.15002 },
  US500: { bid: 5200.00, ask: 5200.50 },
  US100: { bid: 18100.00, ask: 18101.00 },
  US30: { bid: 39500.00, ask: 39502.00 },
  UK100: { bid: 8100.00, ask: 8101.00 },
  DE40: { bid: 18200.00, ask: 18201.20 },
  XAUUSD: { bid: 2350.00, ask: 2350.30 },
  XAGUSD: { bid: 28.50, ask: 28.53 },
  USOIL: { bid: 78.50, ask: 78.54 },
  UKOIL: { bid: 82.30, ask: 82.34 },
};

// Initialize with default prices
for (const [symbol, { bid, ask }] of Object.entries(DEFAULT_PRICES)) {
  prices.set(symbol, { symbol, bid, ask, timestamp: Date.now() });
}

export function getCurrentPrice(symbol: string): PriceTick {
  const p = prices.get(symbol);
  if (p) return p;
  return { symbol, bid: 0, ask: 0, timestamp: Date.now() };
}

export function updatePrice(tick: PriceTick): void {
  prices.set(tick.symbol, tick);
}

export function getAllPrices(): PriceTick[] {
  return Array.from(prices.values());
}

export function getPriceMap(): Map<string, PriceTick> {
  return prices;
}
