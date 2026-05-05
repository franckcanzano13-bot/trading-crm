import { describe, it, expect } from 'vitest';

/**
 * Sprint 2.6 — exercise PriceEngine.validateTick via reflection.
 *
 * The method is private; we cast to any. The goal is to lock in the rejection
 * behavior so future edits don't accidentally drop the protection.
 */
describe('Sprint 2.6 — price spike/gap detection', () => {
  it('PriceEngine module exports a class', async () => {
    const mod = await import('../src/modules/pricing/price-engine');
    expect(mod.PriceEngine).toBeTruthy();
  });

  it('rejects inverted quote (bid > ask)', async () => {
    const { PriceEngine } = await import('../src/modules/pricing/price-engine');
    const engine: any = new PriceEngine();
    const reason = engine.validateTick({ symbol: 'EURUSD', bid: 1.10, ask: 1.05, timestamp: Date.now() }, 'test');
    expect(reason).toBe('inverted_quote');
  });

  it('rejects non-positive prices', async () => {
    const { PriceEngine } = await import('../src/modules/pricing/price-engine');
    const engine: any = new PriceEngine();
    expect(engine.validateTick({ symbol: 'X', bid: 0, ask: 1, timestamp: Date.now() }, 'test')).toBe('non_positive');
    expect(engine.validateTick({ symbol: 'X', bid: -1, ask: 1, timestamp: Date.now() }, 'test')).toBe('non_positive');
  });

  it('rejects timestamps far in the future', async () => {
    const { PriceEngine } = await import('../src/modules/pricing/price-engine');
    const engine: any = new PriceEngine();
    const reason = engine.validateTick({ symbol: 'X', bid: 1, ask: 1.01, timestamp: Date.now() + 60_000 }, 'test');
    expect(reason).toBe('future_timestamp');
  });

  it('detects a >10% spike vs the last accepted mid', async () => {
    const { PriceEngine } = await import('../src/modules/pricing/price-engine');
    const engine: any = new PriceEngine();
    engine.lastValidMid.set('BTCUSD', { mid: 100, ts: Date.now() });
    const spikeTick = { symbol: 'BTCUSD', bid: 129.99, ask: 130.01, timestamp: Date.now() };
    const reason: any = engine.validateTick(spikeTick, 'test');
    expect(reason).toBeTruthy();
    expect(`${reason}`).toMatch(/^spike_/);
  });

  it('accepts a small change within tolerance', async () => {
    const { PriceEngine } = await import('../src/modules/pricing/price-engine');
    const engine: any = new PriceEngine();
    engine.lastValidMid.set('EURUSD', { mid: 1.0850, ts: Date.now() });
    // 0.1% move — well within tolerance
    const tick = { symbol: 'EURUSD', bid: 1.0859, ask: 1.0861, timestamp: Date.now() };
    expect(engine.validateTick(tick, 'test')).toBeNull();
  });

  it('accepts after the 10s window expires (no comparison)', async () => {
    const { PriceEngine } = await import('../src/modules/pricing/price-engine');
    const engine: any = new PriceEngine();
    // Set last seen 30s ago — out of comparison window
    engine.lastValidMid.set('BTCUSD', { mid: 100, ts: Date.now() - 30_000 });
    const tick = { symbol: 'BTCUSD', bid: 199.99, ask: 200.01, timestamp: Date.now() };
    expect(engine.validateTick(tick, 'test')).toBeNull();
  });
});
