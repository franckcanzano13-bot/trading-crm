// ─── Instruments Seed Data ───
export const FOREX_PAIRS = [
  { symbol: 'EURUSD', display: 'EUR/USD', pip_size: 0.0001, lot_size: 100000, base_spread: 12 },
  { symbol: 'GBPUSD', display: 'GBP/USD', pip_size: 0.0001, lot_size: 100000, base_spread: 15 },
  { symbol: 'USDJPY', display: 'USD/JPY', pip_size: 0.01, lot_size: 100000, base_spread: 13 },
  { symbol: 'USDCHF', display: 'USD/CHF', pip_size: 0.0001, lot_size: 100000, base_spread: 16 },
  { symbol: 'AUDUSD', display: 'AUD/USD', pip_size: 0.0001, lot_size: 100000, base_spread: 14 },
  { symbol: 'NZDUSD', display: 'NZD/USD', pip_size: 0.0001, lot_size: 100000, base_spread: 18 },
  { symbol: 'USDCAD', display: 'USD/CAD', pip_size: 0.0001, lot_size: 100000, base_spread: 17 },
  { symbol: 'EURGBP', display: 'EUR/GBP', pip_size: 0.0001, lot_size: 100000, base_spread: 15 },
] as const;

export const CRYPTO_PAIRS = [
  { symbol: 'BTCUSD', display: 'BTC/USD', pip_size: 0.01, lot_size: 1, base_spread: 5000 },
  { symbol: 'ETHUSD', display: 'ETH/USD', pip_size: 0.01, lot_size: 1, base_spread: 300 },
  { symbol: 'XRPUSD', display: 'XRP/USD', pip_size: 0.0001, lot_size: 1000, base_spread: 50 },
  { symbol: 'SOLUSD', display: 'SOL/USD', pip_size: 0.01, lot_size: 10, base_spread: 200 },
  { symbol: 'ADAUSD', display: 'ADA/USD', pip_size: 0.0001, lot_size: 10000, base_spread: 30 },
  { symbol: 'DOGEUSD', display: 'DOGE/USD', pip_size: 0.00001, lot_size: 100000, base_spread: 20 },
] as const;

export const INDICES = [
  { symbol: 'US500', display: 'US500 (S&P 500)', pip_size: 0.01, lot_size: 1, base_spread: 50 },
  { symbol: 'US100', display: 'US100 (Nasdaq)', pip_size: 0.01, lot_size: 1, base_spread: 100 },
  { symbol: 'US30', display: 'US30 (Dow Jones)', pip_size: 0.01, lot_size: 1, base_spread: 200 },
  { symbol: 'UK100', display: 'UK100 (FTSE)', pip_size: 0.01, lot_size: 1, base_spread: 100 },
  { symbol: 'DE40', display: 'DE40 (DAX)', pip_size: 0.01, lot_size: 1, base_spread: 120 },
] as const;

export const COMMODITIES = [
  { symbol: 'XAUUSD', display: 'XAU/USD (Gold)', pip_size: 0.01, lot_size: 100, base_spread: 30 },
  { symbol: 'XAGUSD', display: 'XAG/USD (Silver)', pip_size: 0.001, lot_size: 5000, base_spread: 30 },
  { symbol: 'USOIL', display: 'US Oil (WTI)', pip_size: 0.01, lot_size: 1000, base_spread: 40 },
  { symbol: 'UKOIL', display: 'UK Oil (Brent)', pip_size: 0.01, lot_size: 1000, base_spread: 40 },
] as const;

export const ALL_INSTRUMENTS = [
  ...FOREX_PAIRS.map(i => ({ ...i, type: 'FOREX' as const })),
  ...CRYPTO_PAIRS.map(i => ({ ...i, type: 'CRYPTO' as const })),
  ...INDICES.map(i => ({ ...i, type: 'INDEX' as const })),
  ...COMMODITIES.map(i => ({ ...i, type: 'COMMODITY' as const })),
];

// ─── Trading Constants ───
export const DEFAULT_LEVERAGE = 100;
export const MAX_LEVERAGE = 500;
export const MARGIN_CALL_LEVEL = 100; // percent
export const STOP_OUT_LEVEL = 50; // percent
export const MAX_POSITIONS = 100;
export const MAX_VOLUME_PER_TRADE = 50; // lots

// ─── Auth Constants ───
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const BCRYPT_SALT_ROUNDS = 12;

// ─── Timeframe Durations (ms) ───
export const TIMEFRAME_MS: Record<string, number> = {
  '1s': 1_000,
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};
