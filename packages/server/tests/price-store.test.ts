import { describe, it, expect } from 'vitest';
import { getCurrentPrice, updatePrice, getAllPrices } from '../src/modules/pricing/price-store';

describe('Price Store', () => {
  it('returns default prices for known symbols', () => {
    const eurusd = getCurrentPrice('EURUSD');
    expect(eurusd.symbol).toBe('EURUSD');
    expect(eurusd.bid).toBeGreaterThan(0);
    expect(eurusd.ask).toBeGreaterThan(eurusd.bid);
  });

  it('returns zero prices for unknown symbols', () => {
    const unknown = getCurrentPrice('UNKNOWN');
    expect(unknown.bid).toBe(0);
    expect(unknown.ask).toBe(0);
  });

  it('updates prices correctly', () => {
    updatePrice({ symbol: 'EURUSD', bid: 1.1000, ask: 1.1002, timestamp: Date.now() });
    const price = getCurrentPrice('EURUSD');
    expect(price.bid).toBe(1.1000);
    expect(price.ask).toBe(1.1002);
  });

  it('getAllPrices returns all instruments', () => {
    const prices = getAllPrices();
    expect(prices.length).toBeGreaterThanOrEqual(23); // 8 forex + 6 crypto + 5 indices + 4 commodities
  });
});
