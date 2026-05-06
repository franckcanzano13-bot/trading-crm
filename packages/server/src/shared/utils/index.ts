import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

/**
 * Convert a float price to integer representation (cents/pips).
 * Preserves precision by using string conversion.
 */
export function priceToInt(price: number, precision: number = 2): bigint {
  const multiplier = Math.pow(10, precision);
  return BigInt(Math.round(price * multiplier));
}

/**
 * Convert an integer price back to float.
 */
export function intToPrice(value: bigint, precision: number = 2): number {
  const multiplier = Math.pow(10, precision);
  return Number(value) / multiplier;
}

import Decimal from 'decimal.js';

// Sprint 4.3: increase Decimal precision globally so multi-step financial
// calculations don't lose digits. 40 significant digits is overkill for
// trading prices (max ~10 sig digits) but cheap and safe.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calculate P&L for a position in cents.
 * direction: 1 for BUY, -1 for SELL
 *
 * Sprint 4.3: uses decimal.js to avoid IEEE-754 cumulative error.
 * Old code: 4 float multiplications then * 100 + Math.round.
 * For BTCUSD at 70000 × 0.5 lot, the cent error was non-trivial.
 */
export function calculatePnlCents(
  openPrice: number,
  currentPrice: number,
  volume: number,
  lotSize: number,
  direction: 1 | -1
): bigint {
  const pnl = new Decimal(currentPrice)
    .minus(openPrice)
    .times(volume)
    .times(lotSize)
    .times(direction)
    .times(100); // to cents
  // Round half up, return as BigInt
  return BigInt(pnl.round().toFixed(0));
}

/**
 * Calculate required margin in cents.
 *
 * Sprint 4.3: uses decimal.js for the same reason as P&L.
 */
export function calculateMarginCents(
  price: number,
  volume: number,
  lotSize: number,
  leverage: number
): bigint {
  if (leverage <= 0) return BigInt(0);
  const margin = new Decimal(volume)
    .times(lotSize)
    .times(price)
    .div(leverage)
    .times(100); // to cents
  return BigInt(margin.round().toFixed(0));
}

/**
 * Format BigInt cents to display string.
 */
export function formatCents(cents: bigint): string {
  const dollars = Number(cents) / 100;
  return dollars.toFixed(2);
}

/**
 * Generate a random price for mock data.
 */
export function randomPrice(base: number, spread: number): { bid: number; ask: number } {
  const halfSpread = spread / 2;
  const mid = base + (Math.random() - 0.5) * base * 0.001;
  return {
    bid: Number((mid - halfSpread).toFixed(5)),
    ask: Number((mid + halfSpread).toFixed(5)),
  };
}

/**
 * Serialize BigInt values in an object to strings for JSON.
 */
export function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}
