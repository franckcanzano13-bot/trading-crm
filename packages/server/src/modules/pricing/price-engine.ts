import { EventEmitter } from 'events';
import { updatePrice, getAllPrices } from './price-store';
import { TIMEFRAME_MS } from '@tradexlabel/shared';
import type { PriceTick, Candle } from '@tradexlabel/shared';
import { logger } from '../../shared/utils/index';
import { FinnhubConnector } from './finnhub-connector';
import { TwelveDataConnector } from './twelvedata-connector';
import { BinanceConnector } from './binance-connector';
import { ForexConnector, FOREX_SYMBOLS } from './forex-connector';
import { YahooConnector } from './yahoo-connector';

/**
 * Price Engine — Aggregator with real-time sources + fallback chain.
 *
 * Source priority:
 *
 *  CRYPTO:
 *    1. Binance WebSocket (FREE, no key) — real-time bid/ask
 *    2. Finnhub WebSocket (if FINNHUB_API_KEY set) — real-time trades
 *    3. Mock fallback
 *
 *  FOREX:
 *    1. Finnhub WebSocket (if FINNHUB_API_KEY set) — real-time
 *    2. Frankfurter API (FREE, no key) — ECB daily rates + noise
 *    3. Mock fallback
 *
 *  INDICES + COMMODITIES:
 *    1. Twelve Data REST (if TWELVEDATA_API_KEY set) — polling
 *    2. Mock fallback
 *
 * The mock ONLY activates for symbols where no live source is delivering.
 */

const HEARTBEAT_TIMEOUT_MS = 30_000;
const MOCK_TICK_INTERVAL = 500;

const CRYPTO_SYMBOLS = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'ADAUSD', 'DOGEUSD'];
const INDICES_COMMODITIES = ['US500', 'US100', 'US30', 'UK100', 'DE40', 'XAUUSD', 'XAGUSD', 'USOIL', 'UKOIL'];

type SourceStatus = 'live' | 'fallback' | 'mock';

interface SourceInfo {
  name: string;
  status: SourceStatus;
  lastTick: number;
  tickCount: number;
}

export class PriceEngine extends EventEmitter {
  private intervals: NodeJS.Timeout[] = [];
  private candles: Map<string, Map<string, Candle>> = new Map();
  // Historical candles: symbol → timeframe → sorted array of finalized candles
  private candleHistory: Map<string, Map<string, Candle[]>> = new Map();
  private running = false;

  // Live connectors
  private binance: BinanceConnector | null = null;
  private finnhub: FinnhubConnector | null = null;
  private twelveData: TwelveDataConnector | null = null;
  private forexFree: ForexConnector | null = null;
  private yahoo: YahooConnector | null = null;

  // Source tracking per symbol
  private symbolSource: Map<string, string> = new Map();
  private sourceInfo: Map<string, SourceInfo> = new Map();

  // Mock fallback
  private mockInterval: NodeJS.Timeout | null = null;
  private mockSymbols: Set<string> = new Set();

  // Config
  private finnhubApiKey: string;
  private twelveDataApiKey: string;

  constructor() {
    super();
    this.finnhubApiKey = process.env.FINNHUB_API_KEY || '';
    this.twelveDataApiKey = process.env.TWELVEDATA_API_KEY || '';
  }

  start() {
    if (this.running) return;
    this.running = true;

    this.sourceInfo.set('binance', { name: 'Binance', status: 'live', lastTick: 0, tickCount: 0 });
    this.sourceInfo.set('finnhub', { name: 'Finnhub', status: 'live', lastTick: 0, tickCount: 0 });
    this.sourceInfo.set('twelvedata', { name: 'TwelveData', status: 'live', lastTick: 0, tickCount: 0 });
    this.sourceInfo.set('forex-free', { name: 'Frankfurter', status: 'live', lastTick: 0, tickCount: 0 });
    this.sourceInfo.set('mock', { name: 'Mock', status: 'mock', lastTick: 0, tickCount: 0 });

    // ─── CRYPTO: Binance (free, no key) ───
    this.startBinance();

    // ─── FOREX ───
    if (this.finnhubApiKey) {
      this.startFinnhub();
    } else {
      // Use free Frankfurter API for forex
      this.startForexFree();
    }

    // ─── INDICES + COMMODITIES ───
    if (this.twelveDataApiKey) {
      this.startTwelveData();
    } else {
      logger.warn('[PriceEngine] No TWELVEDATA_API_KEY — using Yahoo Finance for Indices/Commodities');
      this.startYahoo();
    }

    const sources: string[] = [];
    sources.push('Binance (crypto)');
    if (this.finnhubApiKey) sources.push('Finnhub (forex+crypto)');
    else sources.push('Frankfurter (forex)');
    if (this.twelveDataApiKey) sources.push('TwelveData (indices+commodities)');
    else sources.push('Yahoo Finance (indices+commodities)');
    logger.info(`[PriceEngine] Started with sources: ${sources.join(', ')}`);

    // Heartbeat monitor
    const heartbeat = setInterval(() => this.checkHeartbeat(), 10_000);
    this.intervals.push(heartbeat);

    // Candle finalization
    for (const [tf, ms] of Object.entries(TIMEFRAME_MS)) {
      if (tf === '1d' || tf === '4h') continue;
      const candleInterval = setInterval(() => this.finalizeCandles(tf), ms);
      this.intervals.push(candleInterval);
    }
  }

  stop() {
    this.running = false;
    for (const interval of this.intervals) clearInterval(interval);
    this.intervals = [];
    if (this.mockInterval) { clearInterval(this.mockInterval); this.mockInterval = null; }
    this.binance?.stop();
    this.finnhub?.stop();
    this.twelveData?.stop();
    this.forexFree?.stop();
    this.yahoo?.stop();
    logger.info('[PriceEngine] Stopped');
  }

  getSourceInfo(): Map<string, SourceInfo> {
    return this.sourceInfo;
  }

  getSymbolSource(symbol: string): string {
    return this.symbolSource.get(symbol) || 'mock';
  }

  // ─── Binance (free crypto) ───

  private startBinance() {
    this.binance = new BinanceConnector();

    this.binance.on('tick', (tick: PriceTick) => {
      this.onLiveTick(tick, 'binance');
    });

    this.binance.on('connected', () => {
      logger.info('[PriceEngine] Binance connected — real-time crypto prices active');
      this.disableMockForSymbols(CRYPTO_SYMBOLS);
      const info = this.sourceInfo.get('binance')!;
      info.status = 'live';
    });

    this.binance.on('disconnected', () => {
      logger.warn('[PriceEngine] Binance disconnected — enabling mock for crypto');
      this.enableMockForSymbols(CRYPTO_SYMBOLS);
      const info = this.sourceInfo.get('binance')!;
      info.status = 'fallback';
    });

    this.binance.on('failed', () => {
      logger.error('[PriceEngine] Binance failed — mock for crypto');
      this.enableMockForSymbols(CRYPTO_SYMBOLS);
      const info = this.sourceInfo.get('binance')!;
      info.status = 'mock';
    });

    this.binance.start();
  }

  // ─── Finnhub (premium forex+crypto) ───

  private startFinnhub() {
    this.finnhub = new FinnhubConnector(this.finnhubApiKey);
    const finnhubForex = FOREX_SYMBOLS;

    this.finnhub.on('tick', (tick: PriceTick) => {
      this.onLiveTick(tick, 'finnhub');
    });

    this.finnhub.on('connected', () => {
      logger.info('[PriceEngine] Finnhub connected — real-time forex active');
      this.disableMockForSymbols(finnhubForex);
      this.sourceInfo.get('finnhub')!.status = 'live';
    });

    this.finnhub.on('disconnected', () => {
      logger.warn('[PriceEngine] Finnhub disconnected — fallback for forex');
      this.startForexFree(); // Fall back to free forex
      this.sourceInfo.get('finnhub')!.status = 'fallback';
    });

    this.finnhub.on('failed', () => {
      this.startForexFree();
      this.sourceInfo.get('finnhub')!.status = 'mock';
    });

    // Finnhub handles both forex and crypto, but Binance handles crypto already
    this.finnhub.start(finnhubForex);
  }

  // ─── Free Forex (Frankfurter API) ───

  private startForexFree() {
    if (this.forexFree) return; // Already running

    this.forexFree = new ForexConnector(15_000);

    this.forexFree.on('tick', (tick: PriceTick) => {
      // Only use forex-free if Finnhub isn't providing this symbol
      if (this.symbolSource.get(tick.symbol) !== 'finnhub') {
        this.onLiveTick(tick, 'forex-free');
      }
    });

    this.forexFree.on('connected', () => {
      this.disableMockForSymbols(FOREX_SYMBOLS);
      this.sourceInfo.get('forex-free')!.status = 'live';
    });

    this.forexFree.on('error', () => {
      this.enableMockForSymbols(FOREX_SYMBOLS);
      this.sourceInfo.get('forex-free')!.status = 'fallback';
    });

    this.forexFree.start();
  }

  // ─── Twelve Data (premium indices+commodities) ───

  private startTwelveData() {
    this.twelveData = new TwelveDataConnector(this.twelveDataApiKey, 10_000);

    this.twelveData.on('tick', (tick: PriceTick) => {
      this.onLiveTick(tick, 'twelvedata');
    });

    this.twelveData.on('connected', () => {
      this.disableMockForSymbols(INDICES_COMMODITIES);
      this.sourceInfo.get('twelvedata')!.status = 'live';
    });

    this.twelveData.on('error', () => {
      logger.warn('[PriceEngine] TwelveData error — switching to Yahoo Finance for indices/commodities');
      this.startYahoo();
      this.sourceInfo.get('twelvedata')!.status = 'fallback';
    });

    this.twelveData.start(INDICES_COMMODITIES);

    // Also start Yahoo as a parallel fallback (TwelveData quota can run out)
    // Yahoo ticks only used if TwelveData hasn't provided a tick for 30s+
    setTimeout(() => this.startYahoo(), 5000);
  }

  // ─── Yahoo Finance (free fallback for indices+commodities) ───

  private startYahoo() {
    if (this.yahoo) return; // Already running

    this.yahoo = new YahooConnector(15_000);
    this.sourceInfo.set('yahoo', { name: 'Yahoo', status: 'live', lastTick: 0, tickCount: 0 });

    this.yahoo.on('tick', (tick: PriceTick) => {
      // Use Yahoo ticks for symbols where TwelveData isn't delivering
      const currentSource = this.symbolSource.get(tick.symbol);
      const tdInfo = this.sourceInfo.get('twelvedata');
      const tdStale = !tdInfo || tdInfo.status !== 'live' || (Date.now() - tdInfo.lastTick) > 30_000;

      if (currentSource !== 'twelvedata' || tdStale) {
        this.onLiveTick(tick, 'yahoo');
      }
    });

    this.yahoo.on('connected', () => {
      logger.info('[PriceEngine] Yahoo Finance connected — fallback for indices/commodities');
      this.disableMockForSymbols(INDICES_COMMODITIES);
      this.sourceInfo.get('yahoo')!.status = 'live';
    });

    this.yahoo.start(INDICES_COMMODITIES);
  }

  // ─── Live tick handler ───

  private onLiveTick(tick: PriceTick, source: string) {
    updatePrice(tick);
    this.updateCandle(tick);
    this.emit('tick', tick);

    this.symbolSource.set(tick.symbol, source);
    const info = this.sourceInfo.get(source);
    if (info) {
      info.lastTick = Date.now();
      info.tickCount++;
    }
  }

  // ─── Mock fallback ───

  private enableMockForSymbols(symbols: string[]) {
    for (const s of symbols) this.mockSymbols.add(s);
    this.ensureMockRunning();
  }

  private disableMockForSymbols(symbols: string[]) {
    for (const s of symbols) {
      this.mockSymbols.delete(s);
    }
    if (this.mockSymbols.size === 0 && this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  private ensureMockRunning() {
    if (this.mockInterval) return;
    this.mockInterval = setInterval(() => this.generateMockTicks(), MOCK_TICK_INTERVAL);
  }

  private generateMockTicks() {
    const prices = getAllPrices();
    for (const tick of prices) {
      if (!this.mockSymbols.has(tick.symbol)) continue;

      const change = (Math.random() - 0.5) * 0.0002;
      const midPrice = (tick.bid + tick.ask) / 2;
      const newMid = midPrice * (1 + change);
      const spread = tick.ask - tick.bid;

      const newTick: PriceTick = {
        symbol: tick.symbol,
        bid: Number((newMid - spread / 2).toPrecision(7)),
        ask: Number((newMid + spread / 2).toPrecision(7)),
        timestamp: Date.now(),
      };

      updatePrice(newTick);
      this.updateCandle(newTick);
      this.emit('tick', newTick);

      this.symbolSource.set(tick.symbol, 'mock');
      const info = this.sourceInfo.get('mock')!;
      info.lastTick = Date.now();
      info.tickCount++;
    }
  }

  // ─── Heartbeat monitor ───

  private checkHeartbeat() {
    const now = Date.now();

    // Check Binance
    if (this.binance) {
      const info = this.sourceInfo.get('binance')!;
      if (info.lastTick > 0 && (now - info.lastTick) > HEARTBEAT_TIMEOUT_MS && info.status === 'live') {
        logger.warn('[PriceEngine] Binance no ticks — switching crypto to mock');
        info.status = 'fallback';
        this.enableMockForSymbols(CRYPTO_SYMBOLS);
      } else if (info.lastTick > 0 && (now - info.lastTick) < 5000 && info.status === 'fallback') {
        logger.info('[PriceEngine] Binance recovered');
        info.status = 'live';
        this.disableMockForSymbols(CRYPTO_SYMBOLS);
      }
    }

    // Check Finnhub
    if (this.finnhub && this.finnhubApiKey) {
      const info = this.sourceInfo.get('finnhub')!;
      if (info.lastTick > 0 && (now - info.lastTick) > HEARTBEAT_TIMEOUT_MS && info.status === 'live') {
        logger.warn('[PriceEngine] Finnhub no ticks — switching forex to free/mock');
        info.status = 'fallback';
        this.startForexFree();
      } else if (info.lastTick > 0 && (now - info.lastTick) < 5000 && info.status === 'fallback') {
        logger.info('[PriceEngine] Finnhub recovered');
        info.status = 'live';
      }
    }

    // Check Twelve Data
    if (this.twelveData && this.twelveDataApiKey) {
      const info = this.sourceInfo.get('twelvedata')!;
      if (info.lastTick > 0 && (now - info.lastTick) > HEARTBEAT_TIMEOUT_MS * 2 && info.status === 'live') {
        logger.warn('[PriceEngine] TwelveData no ticks — switching to mock');
        info.status = 'fallback';
        this.enableMockForSymbols(INDICES_COMMODITIES);
      } else if (info.lastTick > 0 && (now - info.lastTick) < 15000 && info.status === 'fallback') {
        logger.info('[PriceEngine] TwelveData recovered');
        info.status = 'live';
        this.disableMockForSymbols(INDICES_COMMODITIES);
      }
    }

    // Check forex-free
    if (this.forexFree && !this.finnhubApiKey) {
      const info = this.sourceInfo.get('forex-free')!;
      if (info.lastTick > 0 && (now - info.lastTick) > HEARTBEAT_TIMEOUT_MS * 2 && info.status === 'live') {
        logger.warn('[PriceEngine] Frankfurter no ticks — switching forex to mock');
        info.status = 'fallback';
        this.enableMockForSymbols(FOREX_SYMBOLS);
      } else if (info.lastTick > 0 && (now - info.lastTick) < 20000 && info.status === 'fallback') {
        info.status = 'live';
        this.disableMockForSymbols(FOREX_SYMBOLS);
      }
    }
  }

  // ─── Candle building ───

  private updateCandle(tick: PriceTick) {
    const timeframes = ['1s', '1m', '5m', '15m', '1h'];

    for (const tf of timeframes) {
      const ms = TIMEFRAME_MS[tf];
      const candleStart = Math.floor(tick.timestamp / ms) * ms;

      if (!this.candles.has(tick.symbol)) {
        this.candles.set(tick.symbol, new Map());
      }
      const symbolCandles = this.candles.get(tick.symbol)!;
      const key = `${tf}:${candleStart}`;
      const mid = (tick.bid + tick.ask) / 2;

      const existing = symbolCandles.get(key);
      if (existing) {
        existing.high = Math.max(existing.high, mid);
        existing.low = Math.min(existing.low, mid);
        existing.close = mid;
        existing.volume += 1;
      } else {
        symbolCandles.set(key, {
          instrument_id: tick.symbol,
          timeframe: tf as any,
          open: mid,
          high: mid,
          low: mid,
          close: mid,
          volume: 1,
          timestamp: candleStart,
        });
      }
    }
  }

  private finalizeCandles(timeframe: string) {
    const now = Date.now();
    const ms = TIMEFRAME_MS[timeframe];
    const currentCandleStart = Math.floor(now / ms) * ms;

    for (const [symbol, tfCandles] of this.candles) {
      for (const [key, candle] of tfCandles) {
        if (key.startsWith(timeframe + ':') && candle.timestamp < currentCandleStart) {
          this.emit('candle', candle);
          tfCandles.delete(key);

          // Store in history
          if (!this.candleHistory.has(symbol)) this.candleHistory.set(symbol, new Map());
          const symHistory = this.candleHistory.get(symbol)!;
          if (!symHistory.has(timeframe)) symHistory.set(timeframe, []);
          const arr = symHistory.get(timeframe)!;
          arr.push(candle);
          // Keep max 1000 candles per symbol/timeframe
          if (arr.length > 1000) arr.shift();
        }
      }
    }
  }

  /** Get historical candles stored from live ticks */
  getCandleHistory(symbol: string, timeframe: string, limit = 500): Candle[] {
    const symHistory = this.candleHistory.get(symbol);
    if (!symHistory) return [];
    const arr = symHistory.get(timeframe);
    if (!arr) return [];
    return arr.slice(-limit);
  }

  getCurrentCandle(symbol: string, timeframe: string): Candle | null {
    const symbolCandles = this.candles.get(symbol);
    if (!symbolCandles) return null;

    const ms = TIMEFRAME_MS[timeframe];
    const candleStart = Math.floor(Date.now() / ms) * ms;
    const key = `${timeframe}:${candleStart}`;
    return symbolCandles.get(key) || null;
  }
}

export const priceEngine = new PriceEngine();
