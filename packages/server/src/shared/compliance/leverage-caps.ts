/**
 * Sprint 2.5 — ESMA / FCA / ASIC retail leverage caps.
 *
 * Limits the broker can apply to a client's effective leverage based on:
 *  - The client's country (jurisdiction)
 *  - The instrument type (FOREX, INDICES, COMMODITY, CRYPTO, STOCK)
 *  - The instrument's symbol (forex majors get 30:1, minors 20:1)
 *
 * Source: ESMA Q&A on CFDs (last update 2024). Cross-checked with FCA PROD 11
 * and ASIC RG 270.
 *
 * If the country is not regulated (offshore, US for retail Forex, etc.),
 * cap is `null` (no jurisdiction limit, broker discretion).
 */

// EU/EEA + UK list (ESMA + FCA aligned)
const ESMA_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',  // EEA
  'GB', 'UK',         // UK FCA — same caps as ESMA post-Brexit
]);

const ASIC_COUNTRIES = new Set(['AU']);

/** Forex major pairs (USD-paired with EUR/JPY/GBP/CHF/CAD/AUD/NZD) */
const FOREX_MAJORS = new Set([
  'EURUSD', 'USDJPY', 'GBPUSD', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
]);

/** Indices considered "major" by ESMA (top global benchmarks) */
const MAJOR_INDICES = new Set([
  'US500', 'SPX500', 'US100', 'NAS100', 'US30', 'DJ30',
  'UK100', 'FTSE100', 'DE40', 'GER40', 'DE30', 'FR40', 'CAC40',
  'JP225', 'NIK225', 'EU50', 'STOXX50',
]);

export type Jurisdiction = 'ESMA' | 'FCA' | 'ASIC' | 'UNREGULATED';

export function jurisdictionFor(countryCode: string): Jurisdiction {
  const c = (countryCode || '').toUpperCase();
  if (ESMA_COUNTRIES.has(c)) return 'ESMA'; // FCA folded into ESMA caps for simplicity
  if (ASIC_COUNTRIES.has(c)) return 'ASIC';
  return 'UNREGULATED';
}

export type InstrumentCategory = 'FOREX_MAJOR' | 'FOREX_MINOR' | 'INDEX_MAJOR' | 'INDEX_OTHER' | 'COMMODITY_GOLD' | 'COMMODITY_OTHER' | 'CRYPTO' | 'STOCK';

export function categorize(symbol: string, type: string): InstrumentCategory {
  const s = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const t = (type || '').toUpperCase();

  if (t === 'FOREX' || t === 'FX') {
    return FOREX_MAJORS.has(s) ? 'FOREX_MAJOR' : 'FOREX_MINOR';
  }
  if (t === 'INDEX' || t === 'INDICES') {
    return MAJOR_INDICES.has(s) ? 'INDEX_MAJOR' : 'INDEX_OTHER';
  }
  if (t === 'COMMODITY' || t === 'COMMODITIES') {
    if (s.includes('XAU') || s === 'GOLD') return 'COMMODITY_GOLD';
    return 'COMMODITY_OTHER';
  }
  if (t === 'CRYPTO') return 'CRYPTO';
  if (t === 'STOCK' || t === 'EQUITY' || t === 'SHARE') return 'STOCK';
  // Default: treat as forex minor (conservative)
  return 'FOREX_MINOR';
}

/**
 * Returns the maximum allowed leverage for a client in a given jurisdiction
 * trading a given instrument. `null` means no jurisdiction cap.
 */
export function maxLeverage(jurisdiction: Jurisdiction, category: InstrumentCategory): number | null {
  if (jurisdiction === 'UNREGULATED') return null;

  // ESMA / FCA retail caps
  if (jurisdiction === 'ESMA') {
    switch (category) {
      case 'FOREX_MAJOR': return 30;
      case 'FOREX_MINOR': return 20;
      case 'INDEX_MAJOR': return 20;
      case 'COMMODITY_GOLD': return 20;
      case 'INDEX_OTHER': return 10;
      case 'COMMODITY_OTHER': return 10;
      case 'STOCK': return 5;
      case 'CRYPTO': return 2;
    }
  }

  // ASIC retail caps (similar but a few differences)
  if (jurisdiction === 'ASIC') {
    switch (category) {
      case 'FOREX_MAJOR': return 30;
      case 'FOREX_MINOR': return 20;
      case 'INDEX_MAJOR': return 20;
      case 'COMMODITY_GOLD': return 20;
      case 'INDEX_OTHER': return 10;
      case 'COMMODITY_OTHER': return 10;
      case 'STOCK': return 5;
      case 'CRYPTO': return 2;
    }
  }

  return null;
}

/**
 * Validates a requested leverage against the jurisdiction cap. Returns
 * the effective leverage to use (clamped to cap) and a violation flag.
 */
export function clampLeverage(
  countryCode: string,
  symbol: string,
  instrumentType: string,
  requestedLeverage: number
): { effective: number; capped: boolean; jurisdiction: Jurisdiction; max: number | null } {
  const jurisdiction = jurisdictionFor(countryCode);
  const category = categorize(symbol, instrumentType);
  const max = maxLeverage(jurisdiction, category);

  if (max === null) {
    return { effective: requestedLeverage, capped: false, jurisdiction, max: null };
  }
  if (requestedLeverage <= max) {
    return { effective: requestedLeverage, capped: false, jurisdiction, max };
  }
  return { effective: max, capped: true, jurisdiction, max };
}
