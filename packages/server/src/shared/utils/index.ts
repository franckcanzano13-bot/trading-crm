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

/**
 * Calculate P&L for a position in cents.
 * direction: 1 for BUY, -1 for SELL
 */
export function calculatePnlCents(
  openPrice: number,
  currentPrice: number,
  volume: number,
  lotSize: number,
  direction: 1 | -1
): bigint {
  const pnlRaw = (currentPrice - openPrice) * volume * lotSize * direction;
  return BigInt(Math.round(pnlRaw * 100)); // convert to cents
}

/**
 * Calculate required margin in cents.
 */
export function calculateMarginCents(
  price: number,
  volume: number,
  lotSize: number,
  leverage: number
): bigint {
  const margin = (volume * lotSize * price) / leverage;
  return BigInt(Math.round(margin * 100)); // convert to cents
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
