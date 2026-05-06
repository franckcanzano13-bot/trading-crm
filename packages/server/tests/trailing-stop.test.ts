import { describe, it, expect } from 'vitest';
import { evaluateTrailingStop } from '../src/modules/trading/position-monitor';

/**
 * Sprint 5.4 — trailing stop pure-logic unit tests.
 *
 * `evaluateTrailingStop` encodes the per-tick decision: given the current
 * price, the recorded favorable extreme, and the trailing distance, decide
 * whether to update the extreme and whether to close the position.
 *
 * BUY:  trailing_high tracks the highest favorable price.
 *        effective SL = trailing_high - distance.
 * SELL: trailing_high field stores the lowest favorable price.
 *        effective SL = trailing_high + distance.
 *
 * Tests cover the three behavior contracts:
 *  1. BUY with price moving up — extreme updates, position stays open.
 *  2. BUY with price retracing past distance — close triggers.
 *  3. SELL mirror — both update path and close path.
 */
describe('Sprint 5.4 — trailing stop logic', () => {
  describe('BUY positions', () => {
    it('updates trailing_high when price moves favorably (up)', () => {
      // Open at 100, trailing_high so far is 100, price moves up to 105
      const r = evaluateTrailingStop({
        side: 'BUY',
        currentPrice: 105,
        distance: 2,
        trailingHigh: 100,
      });
      expect(r.newTrailingHigh).toBe(105);
      expect(r.shouldClose).toBe(false);
      // Effective stop trails 2 below the new high
      expect(r.effectiveStop).toBe(103);
    });

    it('keeps trailing_high and does not close when price ticks down within distance', () => {
      // High was 110, distance 3 — effective stop = 107.
      // Price now at 108: above stop, so stay open.
      const r = evaluateTrailingStop({
        side: 'BUY',
        currentPrice: 108,
        distance: 3,
        trailingHigh: 110,
      });
      expect(r.newTrailingHigh).toBe(110);
      expect(r.effectiveStop).toBe(107);
      expect(r.shouldClose).toBe(false);
    });

    it('triggers close when price retraces past the trailing distance', () => {
      // High 110, distance 3 — effective stop = 107.
      // Price drops to 106 (below stop) → close.
      const r = evaluateTrailingStop({
        side: 'BUY',
        currentPrice: 106,
        distance: 3,
        trailingHigh: 110,
      });
      expect(r.newTrailingHigh).toBe(110);
      expect(r.effectiveStop).toBe(107);
      expect(r.shouldClose).toBe(true);
    });

    it('triggers close exactly at the effective stop', () => {
      // Boundary: currentPrice == effective stop should close (<=).
      const r = evaluateTrailingStop({
        side: 'BUY',
        currentPrice: 107,
        distance: 3,
        trailingHigh: 110,
      });
      expect(r.shouldClose).toBe(true);
    });
  });

  describe('SELL positions (mirror)', () => {
    it('updates trailing_low when price moves favorably (down) for SELL', () => {
      // SELL open at 100, lowest seen 100, price drops to 95 → favorable.
      const r = evaluateTrailingStop({
        side: 'SELL',
        currentPrice: 95,
        distance: 2,
        trailingHigh: 100, // field reused for "lowest seen" on SELL
      });
      expect(r.newTrailingHigh).toBe(95);
      expect(r.shouldClose).toBe(false);
      // Effective stop trails 2 above the new low
      expect(r.effectiveStop).toBe(97);
    });

    it('triggers close when SELL price rallies past the trailing distance', () => {
      // SELL: lowest seen 90, distance 3 — effective stop = 93.
      // Price rallies to 94 (>= stop) → close.
      const r = evaluateTrailingStop({
        side: 'SELL',
        currentPrice: 94,
        distance: 3,
        trailingHigh: 90,
      });
      expect(r.newTrailingHigh).toBe(90);
      expect(r.effectiveStop).toBe(93);
      expect(r.shouldClose).toBe(true);
    });

    it('does not close when SELL price stays within distance of the low', () => {
      // Lowest 90, distance 3, stop = 93. Price 92 → still profitable, stay open.
      const r = evaluateTrailingStop({
        side: 'SELL',
        currentPrice: 92,
        distance: 3,
        trailingHigh: 90,
      });
      expect(r.shouldClose).toBe(false);
    });
  });
});
