import { describe, it, expect } from 'vitest';
import {
  jurisdictionFor,
  categorize,
  maxLeverage,
  clampLeverage,
} from '../src/shared/compliance/leverage-caps';

describe('Sprint 2.5 — leverage caps per jurisdiction', () => {
  describe('jurisdictionFor', () => {
    it('detects ESMA countries', () => {
      expect(jurisdictionFor('FR')).toBe('ESMA');
      expect(jurisdictionFor('DE')).toBe('ESMA');
      expect(jurisdictionFor('GB')).toBe('ESMA');
    });
    it('detects ASIC', () => {
      expect(jurisdictionFor('AU')).toBe('ASIC');
    });
    it('returns UNREGULATED for unknown countries', () => {
      expect(jurisdictionFor('SC')).toBe('UNREGULATED');
      expect(jurisdictionFor('')).toBe('UNREGULATED');
    });
  });

  describe('categorize', () => {
    it('forex majors', () => {
      expect(categorize('EURUSD', 'FOREX')).toBe('FOREX_MAJOR');
      expect(categorize('GBPUSD', 'FOREX')).toBe('FOREX_MAJOR');
    });
    it('forex minors', () => {
      expect(categorize('EURGBP', 'FOREX')).toBe('FOREX_MINOR');
      expect(categorize('GBPNZD', 'FOREX')).toBe('FOREX_MINOR');
    });
    it('major indices', () => {
      expect(categorize('US500', 'INDEX')).toBe('INDEX_MAJOR');
      expect(categorize('DE40', 'INDEX')).toBe('INDEX_MAJOR');
    });
    it('commodities', () => {
      expect(categorize('XAUUSD', 'COMMODITY')).toBe('COMMODITY_GOLD');
      expect(categorize('USOIL', 'COMMODITY')).toBe('COMMODITY_OTHER');
    });
    it('crypto', () => {
      expect(categorize('BTCUSD', 'CRYPTO')).toBe('CRYPTO');
    });
  });

  describe('maxLeverage (ESMA retail)', () => {
    it('forex major 30:1', () => {
      expect(maxLeverage('ESMA', 'FOREX_MAJOR')).toBe(30);
    });
    it('forex minor / gold / major index 20:1', () => {
      expect(maxLeverage('ESMA', 'FOREX_MINOR')).toBe(20);
      expect(maxLeverage('ESMA', 'COMMODITY_GOLD')).toBe(20);
      expect(maxLeverage('ESMA', 'INDEX_MAJOR')).toBe(20);
    });
    it('crypto 2:1', () => {
      expect(maxLeverage('ESMA', 'CRYPTO')).toBe(2);
    });
    it('unregulated → null (no cap)', () => {
      expect(maxLeverage('UNREGULATED', 'CRYPTO')).toBeNull();
      expect(maxLeverage('UNREGULATED', 'FOREX_MAJOR')).toBeNull();
    });
  });

  describe('clampLeverage', () => {
    it('clamps 500x crypto for FR retail to 2x', () => {
      const r = clampLeverage('FR', 'BTCUSD', 'CRYPTO', 500);
      expect(r.effective).toBe(2);
      expect(r.capped).toBe(true);
      expect(r.jurisdiction).toBe('ESMA');
      expect(r.max).toBe(2);
    });
    it('does not clamp for unregulated jurisdiction', () => {
      const r = clampLeverage('SC', 'BTCUSD', 'CRYPTO', 500);
      expect(r.effective).toBe(500);
      expect(r.capped).toBe(false);
      expect(r.jurisdiction).toBe('UNREGULATED');
      expect(r.max).toBeNull();
    });
    it('preserves leverage when below cap', () => {
      const r = clampLeverage('DE', 'EURUSD', 'FOREX', 25);
      expect(r.effective).toBe(25);
      expect(r.capped).toBe(false);
    });
  });
});
