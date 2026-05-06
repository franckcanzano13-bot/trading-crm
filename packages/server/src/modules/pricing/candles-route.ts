import { FastifyInstance } from 'fastify';
import { config } from '../../config/index';
import { logger } from '../../shared/utils/index';
import { priceEngine } from './price-engine';

/**
 * GET /api/v1/candles?symbol=BTCUSD&timeframe=1h&limit=500
 *
 * Fetches REAL historical candles from:
 *  - Binance REST (crypto)
 *  - Yahoo Finance (forex, indices, commodities) — FREE, no API key
 *  - Finnhub REST (forex) — /forex/candle (paid plans)
 *  - TwelveData REST (indices, commodities) — fallback
 */

const CRYPTO_SYMBOLS = new Set(['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'DOGEUSD']);
const FOREX_SYMBOLS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD', 'EURGBP']);

// Binance interval mapping
const BINANCE_INTERVALS: Record<string, string> = {
  '1s': '1s', '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d',
};

// Yahoo Finance symbol mapping
const YAHOO_SYMBOL_MAP: Record<string, string> = {
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X', USDCHF: 'USDCHF=X',
  AUDUSD: 'AUDUSD=X', NZDUSD: 'NZDUSD=X', USDCAD: 'USDCAD=X', EURGBP: 'EURGBP=X',
  XAUUSD: 'GC=F', XAGUSD: 'SI=F',
  US500: '%5EGSPC', US100: '%5EIXIC', US30: '%5EDJI', UK100: '%5EFTSE', DE40: '%5EGDAXI',
  USOIL: 'CL=F', UKOIL: 'BZ=F',
};

// Yahoo Finance interval + range mapping
const YAHOO_INTERVALS: Record<string, { interval: string; range: string }> = {
  '1m': { interval: '1m', range: '1d' },
  '5m': { interval: '5m', range: '5d' },
  '15m': { interval: '15m', range: '5d' },
  '1h': { interval: '1h', range: '10d' },
  '4h': { interval: '1h', range: '30d' },  // Yahoo doesn't have 4h, we'll aggregate from 1h
  '1d': { interval: '1d', range: '1y' },
};

// Finnhub resolution mapping
const FINNHUB_RESOLUTIONS: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D',
};

// Finnhub forex symbol mapping (OANDA format)
const FINNHUB_FOREX_MAP: Record<string, string> = {
  EURUSD: 'OANDA:EUR_USD', GBPUSD: 'OANDA:GBP_USD', USDJPY: 'OANDA:USD_JPY',
  USDCHF: 'OANDA:USD_CHF', AUDUSD: 'OANDA:AUD_USD', NZDUSD: 'OANDA:NZD_USD',
  USDCAD: 'OANDA:USD_CAD', EURGBP: 'OANDA:EUR_GBP',
};

// TwelveData interval + symbol mapping (fallback for indices/commodities)
const TD_INTERVALS: Record<string, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '4h': '4h', '1d': '1day',
};
const TD_SYMBOL_MAP: Record<string, string> = {
  EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', USDCHF: 'USD/CHF',
  AUDUSD: 'AUD/USD', NZDUSD: 'NZD/USD', USDCAD: 'USD/CAD', EURGBP: 'EUR/GBP',
  XAUUSD: 'XAU/USD', XAGUSD: 'XAG/USD',
  US500: 'SPX', US100: 'IXIC', US30: 'DJI', UK100: 'UKX', DE40: 'GDAXI',
  USOIL: 'CL', UKOIL: 'BZ',
};

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ─── Binance (crypto) ───

async function fetchBinanceCandles(symbol: string, timeframe: string, limit: number): Promise<CandleData[]> {
  const pair = symbol.replace('USD', 'USDT');
  const interval = BINANCE_INTERVALS[timeframe];
  if (!interval) return [];

  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
  logger.info(`[Candles] Binance: ${pair} ${interval}`);

  const res = await fetch(url);
  if (!res.ok) { logger.error(`[Candles] Binance error: ${res.status}`); return []; }

  const data = await res.json() as Array<[number, string, string, string, string, string, ...unknown[]]>;
  return data.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

// ─── Yahoo Finance (forex, indices, commodities — FREE, no API key) ───

async function fetchYahooCandles(symbol: string, timeframe: string, limit: number): Promise<CandleData[]> {
  const yahooSymbol = YAHOO_SYMBOL_MAP[symbol];
  if (!yahooSymbol) return [];

  const yahooTf = YAHOO_INTERVALS[timeframe];
  if (!yahooTf) return [];

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yahooTf.interval}&range=${yahooTf.range}`;
  logger.info(`[Candles] Yahoo Finance: ${yahooSymbol} ${yahooTf.interval} range=${yahooTf.range}`);

  const res = await fetch(url);
  if (!res.ok) { logger.error(`[Candles] Yahoo error: ${res.status}`); return []; }

  const data = await res.json() as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }> };
      }>;
    };
  };
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
    logger.warn(`[Candles] Yahoo no data for ${yahooSymbol}`);
    return [];
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const opens = quote.open;
  const highs = quote.high;
  const lows = quote.low;
  const closes = quote.close;
  const volumes = quote.volume;

  let candles: CandleData[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (opens[i] == null || closes[i] == null) continue;
    candles.push({
      time: timestamps[i],
      open: opens[i]!,
      high: highs[i] ?? opens[i]!,
      low: lows[i] ?? opens[i]!,
      close: closes[i]!,
      volume: volumes?.[i] ?? 0,
    });
  }

  // For 4h: aggregate 1h candles into 4h buckets
  if (timeframe === '4h' && candles.length > 0) {
    candles = aggregate4hCandles(candles);
  }

  // Respect limit
  if (candles.length > limit) {
    candles = candles.slice(candles.length - limit);
  }

  logger.info(`[Candles] Yahoo returned ${candles.length} candles for ${symbol}`);
  return candles;
}

function aggregate4hCandles(hourlyCandles: CandleData[]): CandleData[] {
  const buckets = new Map<number, CandleData>();
  for (const c of hourlyCandles) {
    const bucketTime = Math.floor(c.time / (4 * 3600)) * (4 * 3600);
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, { ...c, time: bucketTime });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume = (existing.volume || 0) + (c.volume || 0);
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

// ─── Finnhub (forex) ───

async function fetchFinnhubCandles(symbol: string, timeframe: string, limit: number): Promise<CandleData[]> {
  const apiKey = config.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const fhSymbol = FINNHUB_FOREX_MAP[symbol];
  if (!fhSymbol) return [];

  const resolution = FINNHUB_RESOLUTIONS[timeframe];
  if (!resolution) return [];

  // Calculate time range
  const now = Math.floor(Date.now() / 1000);
  const tfSeconds: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
  const from = now - (tfSeconds[timeframe] || 3600) * limit;

  const url = `https://finnhub.io/api/v1/forex/candle?symbol=${fhSymbol}&resolution=${resolution}&from=${from}&to=${now}&token=${apiKey}`;
  logger.info(`[Candles] Finnhub: ${fhSymbol} ${resolution}`);

  const res = await fetch(url);
  if (!res.ok) { logger.error(`[Candles] Finnhub error: ${res.status}`); return []; }

  const data = await res.json() as { s?: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };
  if (data.s !== 'ok' || !data.t || !data.o || !data.h || !data.l || !data.c) {
    logger.warn(`[Candles] Finnhub no data for ${fhSymbol}: ${data.s || 'no-data'}`);
    return [];
  }

  const candles: CandleData[] = [];
  for (let i = 0; i < data.t.length; i++) {
    candles.push({
      time: data.t[i],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v?.[i] || 0,
    });
  }
  return candles;
}

// ─── TwelveData (indices, commodities, forex fallback) ───

async function fetchTwelveDataCandles(symbol: string, timeframe: string, limit: number): Promise<CandleData[]> {
  const apiKey = config.TWELVEDATA_API_KEY;
  if (!apiKey) return [];

  const tdSymbol = TD_SYMBOL_MAP[symbol];
  if (!tdSymbol) return [];

  const interval = TD_INTERVALS[timeframe];
  if (!interval) return [];

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${interval}&outputsize=${limit}&apikey=${apiKey}`;
  logger.info(`[Candles] TwelveData: ${tdSymbol} ${interval}`);

  const res = await fetch(url);
  if (!res.ok) { logger.error(`[Candles] TwelveData error: ${res.status}`); return []; }

  const data = await res.json() as {
    status?: string;
    message?: string;
    values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
  };
  if (data.status === 'error' || !data.values) {
    logger.warn(`[Candles] TwelveData no data: ${data.message || 'unknown'}`);
    return [];
  }

  return data.values.reverse().map((v) => ({
    time: Math.floor(new Date(v.datetime).getTime() / 1000),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseFloat(v.volume || '0'),
  }));
}

// ─── Route ───

export async function candlesRoute(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { symbol?: string; timeframe?: string; limit?: string };
  }>('/api/v1/candles', async (request, reply) => {
    const symbol = (request.query.symbol || 'EURUSD').toUpperCase();
    const timeframe = request.query.timeframe || '1h';
    const limit = Math.min(parseInt(request.query.limit || '500', 10), 1000);

    let candles: CandleData[] = [];

    try {
      if (CRYPTO_SYMBOLS.has(symbol)) {
        candles = await fetchBinanceCandles(symbol, timeframe, limit);
      } else {
        // Yahoo Finance — primary source for forex, indices, commodities (free, no key)
        candles = await fetchYahooCandles(symbol, timeframe, limit);

        // Fallback chain: Finnhub (forex) → TwelveData (all)
        if (candles.length === 0 && FOREX_SYMBOLS.has(symbol)) {
          candles = await fetchFinnhubCandles(symbol, timeframe, limit);
        }
        if (candles.length === 0) {
          candles = await fetchTwelveDataCandles(symbol, timeframe, limit);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[Candles] Fetch error for ${symbol}: ${message}`);
    }

    // Fallback: use candles built from live ticks (price engine history)
    if (candles.length === 0) {
      const history = priceEngine.getCandleHistory(symbol, timeframe, limit);
      if (history.length > 0) {
        logger.info(`[Candles] Using ${history.length} candles from live tick history for ${symbol}`);
        candles = history.map((c) => ({
          time: Math.floor(c.timestamp / 1000), // ms → seconds
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
      }
    }

    return reply.send({ symbol, timeframe, count: candles.length, candles });
  });
}
