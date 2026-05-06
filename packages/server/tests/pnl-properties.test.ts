import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculatePnlCents,
  calculateMarginCents,
} from '../src/shared/utils/index';

/**
 * Sprint 3.1 — Property-based tests for P&L and margin calculations.
 *
 * The audit flagged these as financially critical and untested. Properties
 * cover invariants that must hold for any valid input — much stronger than
 * a handful of example tests.
 *
 * All "price" inputs are constrained to realistic ranges:
 *  - Forex: 0.5 to 200 (covers EURUSD, USDJPY, etc.)
 *  - Volume: 0.01 to 100 lots
 *  - LotSize: 1 (e.g., crypto) to 100000 (forex standard)
 *  - Leverage: 1 to 500
 *
 * To keep tests deterministic and fast, we cap to integer values where the
 * float granularity isn't meaningful for the property.
 */

// Use integer-based arbitraries scaled down to fractional values to avoid
// fast-check v4 NaN edge cases with fc.double constraints.
const priceArb = fc.integer({ min: 50, max: 20000 }).map(n => n / 100); // 0.50 to 200.00
const volumeArb = fc.integer({ min: 1, max: 10000 }).map(n => n / 100); // 0.01 to 100.00
const lotSizeArb = fc.constantFrom(1, 100, 1000, 10000, 100000);
const leverageArb = fc.integer({ min: 1, max: 500 });
const directionArb = fc.constantFrom<1 | -1>(1, -1);
// Multiplier for "price moves up by X%" scenarios — bounded fraction
const upPctArb = fc.integer({ min: 1, max: 500 }).map(n => n / 1000); // 0.001 to 0.5
const downPctArb = fc.integer({ min: 1, max: 500 }).map(n => n / 1000); // same range

describe('Sprint 3.1 — P&L property-based invariants', () => {
  it('zero price movement → zero P&L', () => {
    fc.assert(fc.property(priceArb, volumeArb, lotSizeArb, directionArb, (price, volume, lotSize, direction) => {
      const pnl = calculatePnlCents(price, price, volume, lotSize, direction);
      expect(pnl).toBe(0n);
    }), { numRuns: 100 });
  });

  it('BUY/SELL symmetry: same price move yields opposite-sign P&L of equal magnitude', () => {
    fc.assert(fc.property(priceArb, priceArb, volumeArb, lotSizeArb, (open, close, volume, lotSize) => {
      const pnlBuy = calculatePnlCents(open, close, volume, lotSize, 1);
      const pnlSell = calculatePnlCents(open, close, volume, lotSize, -1);
      // pnlBuy + pnlSell ≈ 0 (within rounding tolerance of 1 cent)
      const sum = pnlBuy + pnlSell;
      expect(sum >= -1n && sum <= 1n).toBe(true);
    }), { numRuns: 200 });
  });

  it('Monotonicity in volume: doubling volume doubles |P&L| (BUY, price up)', () => {
    fc.assert(fc.property(priceArb, upPctArb, volumeArb, lotSizeArb, (open, deltaPct, volume, lotSize) => {
      const close = open * (1 + deltaPct);
      const pnl1 = calculatePnlCents(open, close, volume, lotSize, 1);
      const pnl2 = calculatePnlCents(open, close, volume * 2, lotSize, 1);
      // pnl2 should be ~2 * pnl1 within rounding tolerance.
      const expected = pnl1 * 2n;
      const diff = pnl2 - expected;
      const absDiff = diff < 0n ? -diff : diff;
      expect(absDiff <= 2n).toBe(true);
    }), { numRuns: 200 });
  });

  it('Sign correctness: BUY profits when price goes up', () => {
    fc.assert(fc.property(priceArb, upPctArb, volumeArb, lotSizeArb, (open, deltaPct, volume, lotSize) => {
      const close = open * (1 + deltaPct);
      const pnl = calculatePnlCents(open, close, volume, lotSize, 1);
      expect(pnl >= 0n).toBe(true);
    }), { numRuns: 100 });
  });

  it('Sign correctness: SELL profits when price goes down', () => {
    fc.assert(fc.property(priceArb, downPctArb, volumeArb, lotSizeArb, (open, deltaPct, volume, lotSize) => {
      const close = open * (1 - deltaPct);
      const pnl = calculatePnlCents(open, close, volume, lotSize, -1);
      expect(pnl >= 0n).toBe(true);
    }), { numRuns: 100 });
  });

  it('Additivity: P&L of two halves equals P&L of whole', () => {
    fc.assert(fc.property(priceArb, priceArb, volumeArb, lotSizeArb, directionArb, (open, close, volume, lotSize, dir) => {
      const half = volume / 2;
      const whole = calculatePnlCents(open, close, volume, lotSize, dir);
      const a = calculatePnlCents(open, close, half, lotSize, dir);
      const b = calculatePnlCents(open, close, volume - half, lotSize, dir);
      // Within 2 cents (rounding can split)
      const sum = a + b;
      const diff = whole - sum;
      const absDiff = diff < 0n ? -diff : diff;
      expect(absDiff <= 2n).toBe(true);
    }), { numRuns: 200 });
  });
});

describe('Sprint 3.1 — Margin property-based invariants', () => {
  it('Margin is non-negative for valid inputs', () => {
    fc.assert(fc.property(priceArb, volumeArb, lotSizeArb, leverageArb, (price, volume, lotSize, leverage) => {
      const margin = calculateMarginCents(price, volume, lotSize, leverage);
      expect(margin >= 0n).toBe(true);
    }), { numRuns: 200 });
  });

  it('Higher leverage → lower or equal margin', () => {
    fc.assert(fc.property(priceArb, volumeArb, lotSizeArb, leverageArb, leverageArb, (price, volume, lotSize, leverageA, leverageB) => {
      const lo = Math.min(leverageA, leverageB);
      const hi = Math.max(leverageA, leverageB);
      if (lo === hi) return; // skip equal cases
      const marginLo = calculateMarginCents(price, volume, lotSize, lo);
      const marginHi = calculateMarginCents(price, volume, lotSize, hi);
      // More leverage means less margin required (with at most 1c rounding diff)
      expect(marginHi <= marginLo + 1n).toBe(true);
    }), { numRuns: 200 });
  });

  it('Doubling volume doubles margin (within rounding)', () => {
    fc.assert(fc.property(priceArb, volumeArb, lotSizeArb, leverageArb, (price, volume, lotSize, leverage) => {
      const m1 = calculateMarginCents(price, volume, lotSize, leverage);
      const m2 = calculateMarginCents(price, volume * 2, lotSize, leverage);
      const expected = m1 * 2n;
      const diff = m2 - expected;
      const absDiff = diff < 0n ? -diff : diff;
      expect(absDiff <= 2n).toBe(true);
    }), { numRuns: 200 });
  });

  it('Zero volume → zero margin', () => {
    fc.assert(fc.property(priceArb, lotSizeArb, leverageArb, (price, lotSize, leverage) => {
      expect(calculateMarginCents(price, 0, lotSize, leverage)).toBe(0n);
    }), { numRuns: 50 });
  });
});
