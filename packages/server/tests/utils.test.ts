import { describe, it, expect } from 'vitest';
import {
  priceToInt,
  intToPrice,
  calculatePnlCents,
  calculateMarginCents,
  formatCents,
  serializeBigInt,
} from '../src/shared/utils/index';

describe('priceToInt / intToPrice', () => {
  it('converts price to integer and back', () => {
    expect(priceToInt(1.0852, 5)).toBe(BigInt(108520));
    expect(intToPrice(BigInt(108520), 5)).toBeCloseTo(1.0852, 4);
  });

  it('handles JPY pair prices', () => {
    expect(priceToInt(149.53, 3)).toBe(BigInt(149530));
    expect(intToPrice(BigInt(149530), 3)).toBeCloseTo(149.53, 2);
  });

  it('handles zero', () => {
    expect(priceToInt(0, 5)).toBe(BigInt(0));
    expect(intToPrice(BigInt(0), 5)).toBe(0);
  });
});

describe('calculatePnlCents', () => {
  it('calculates profit for BUY position', () => {
    // Bought at 1.0850, now at 1.0860, 1 lot (100000), BUY
    const pnl = calculatePnlCents(1.0850, 1.0860, 1, 100000, 1);
    // (1.0860 - 1.0850) * 1 * 100000 * 1 = 100 USD = 10000 cents
    expect(Number(pnl)).toBe(10000);
  });

  it('calculates loss for BUY position', () => {
    const pnl = calculatePnlCents(1.0850, 1.0840, 1, 100000, 1);
    expect(Number(pnl)).toBe(-10000);
  });

  it('calculates profit for SELL position', () => {
    // Sold at 1.0850, now at 1.0840, 1 lot, SELL (direction = -1)
    const pnl = calculatePnlCents(1.0850, 1.0840, 1, 100000, -1);
    expect(Number(pnl)).toBe(10000);
  });

  it('handles fractional volumes', () => {
    const pnl = calculatePnlCents(1.0850, 1.0860, 0.1, 100000, 1);
    expect(Number(pnl)).toBe(1000);
  });
});

describe('calculateMarginCents', () => {
  it('calculates margin for a standard forex trade', () => {
    // 1 lot EURUSD at 1.0850 with 100x leverage
    const margin = calculateMarginCents(1.0850, 1, 100000, 100);
    // (1 * 100000 * 1.0850) / 100 = 1085 USD = 108500 cents
    expect(Number(margin)).toBe(108500);
  });

  it('calculates margin with higher leverage', () => {
    const margin = calculateMarginCents(1.0850, 1, 100000, 500);
    // 1085 / 5 = 217 USD = 21700 cents
    expect(Number(margin)).toBe(21700);
  });
});

describe('formatCents', () => {
  it('formats cents to dollar string', () => {
    expect(formatCents(BigInt(1000000))).toBe('10000.00');
    expect(formatCents(BigInt(150))).toBe('1.50');
    expect(formatCents(BigInt(-5000))).toBe('-50.00');
  });
});

describe('serializeBigInt', () => {
  it('converts BigInt values to strings', () => {
    const obj = { balance: BigInt(1000000), name: 'test', active: true };
    const result = serializeBigInt(obj);
    expect(result.balance).toBe('1000000');
    expect(result.name).toBe('test');
    expect(result.active).toBe(true);
  });

  it('handles nested objects and arrays', () => {
    const obj = {
      items: [{ amount: BigInt(500) }, { amount: BigInt(600) }],
      meta: { total: BigInt(1100) },
    };
    const result = serializeBigInt(obj);
    expect(result.items[0].amount).toBe('500');
    expect(result.items[1].amount).toBe('600');
    expect(result.meta.total).toBe('1100');
  });

  it('handles null and undefined', () => {
    expect(serializeBigInt(null)).toBeNull();
    expect(serializeBigInt(undefined)).toBeUndefined();
  });
});
