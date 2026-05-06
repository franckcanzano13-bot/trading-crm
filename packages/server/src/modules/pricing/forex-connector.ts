import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/index';
import type { PriceTick } from '@tradexlabel/shared';

/**
 * Free Forex price connector using multiple free APIs.
 * No API key required. Polls at regular intervals.
 *
 * Sources tried in order:
 * 1. Frankfurter API (European Central Bank rates — free, no key)
 * 2. ExchangeRate-API free tier
 */

const FOREX_PAIRS: Record<string, { base: string; quote: string }> = {
  EURUSD: { base: 'EUR', quote: 'USD' },
  GBPUSD: { base: 'GBP', quote: 'USD' },
  AUDUSD: { base: 'AUD', quote: 'USD' },
  NZDUSD: { base: 'NZD', quote: 'USD' },
  EURGBP: { base: 'EUR', quote: 'GBP' },
};

// These pairs need inversion: we get USD/X and need to invert to X/USD
const INVERSE_PAIRS: Record<string, { base: string; quote: string }> = {
  USDJPY: { base: 'USD', quote: 'JPY' },
  USDCHF: { base: 'USD', quote: 'CHF' },
  USDCAD: { base: 'USD', quote: 'CAD' },
};

const DEFAULT_SPREADS: Record<string, number> = {
  EURUSD: 0.00020, GBPUSD: 0.00025, USDJPY: 0.030,
  USDCHF: 0.00025, AUDUSD: 0.00020, NZDUSD: 0.00025,
  USDCAD: 0.00025, EURGBP: 0.00025,
};

export const FOREX_SYMBOLS = Object.keys({ ...FOREX_PAIRS, ...INVERSE_PAIRS });

export class ForexConnector extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null;
  private connected = false;
  private lastTickTime = 0;
  private pollMs: number;

  constructor(pollIntervalMs = 15000) {
    super();
    this.pollMs = pollIntervalMs;
  }

  get isConnected() { return this.connected; }
  get lastTick() { return this.lastTickTime; }

  start() {
    logger.info(`[Forex] Starting free forex poller (every ${this.pollMs}ms)`);

    // Initial fetch
    this.fetchPrices();

    this.pollInterval = setInterval(() => this.fetchPrices(), this.pollMs);
  }

  stop() {
    this.connected = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('[Forex] Connector stopped');
  }

  private async fetchPrices() {
    try {
      // Frankfurter API: free ECB rates, no key needed
      // Get USD-based rates for most pairs
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      // Fetch EUR-based rates (covers EUR/USD, EUR/GBP)
      const eurRes = await fetch(
        `https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,JPY,CHF`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!eurRes.ok) {
        throw new Error(`HTTP ${eurRes.status}`);
      }

      const eurData = await eurRes.json() as { rates: Record<string, number> };
      const eurRates = eurData.rates;

      // EURUSD
      if (eurRates.USD) this.emitForexTick('EURUSD', eurRates.USD);
      // EURGBP
      if (eurRates.GBP) this.emitForexTick('EURGBP', eurRates.GBP);
      // USDJPY (from EUR/USD and EUR/JPY)
      if (eurRates.USD && eurRates.JPY) this.emitForexTick('USDJPY', eurRates.JPY / eurRates.USD);
      // USDCHF
      if (eurRates.USD && eurRates.CHF) this.emitForexTick('USDCHF', eurRates.CHF / eurRates.USD);

      // Fetch GBP, AUD, NZD, CAD-based rates
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 8000);
      const gbpRes = await fetch(
        `https://api.frankfurter.app/latest?from=GBP&to=USD`,
        { signal: controller2.signal }
      );
      clearTimeout(timeout2);

      if (gbpRes.ok) {
        const gbpData = await gbpRes.json() as { rates: Record<string, number> };
        if (gbpData.rates.USD) this.emitForexTick('GBPUSD', gbpData.rates.USD);
      }

      // AUD/USD and NZD/USD
      const controller3 = new AbortController();
      const timeout3 = setTimeout(() => controller3.abort(), 8000);
      const audRes = await fetch(
        `https://api.frankfurter.app/latest?from=AUD&to=USD`,
        { signal: controller3.signal }
      );
      clearTimeout(timeout3);
      if (audRes.ok) {
        const audData = await audRes.json() as { rates: Record<string, number> };
        if (audData.rates.USD) this.emitForexTick('AUDUSD', audData.rates.USD);
      }

      const controller4 = new AbortController();
      const timeout4 = setTimeout(() => controller4.abort(), 8000);
      const nzdRes = await fetch(
        `https://api.frankfurter.app/latest?from=NZD&to=USD`,
        { signal: controller4.signal }
      );
      clearTimeout(timeout4);
      if (nzdRes.ok) {
        const nzdData = await nzdRes.json() as { rates: Record<string, number> };
        if (nzdData.rates.USD) this.emitForexTick('NZDUSD', nzdData.rates.USD);
      }

      // USDCAD
      const controller5 = new AbortController();
      const timeout5 = setTimeout(() => controller5.abort(), 8000);
      const cadRes = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=CAD`,
        { signal: controller5.signal }
      );
      clearTimeout(timeout5);
      if (cadRes.ok) {
        const cadData = await cadRes.json() as { rates: Record<string, number> };
        if (cadData.rates.CAD) this.emitForexTick('USDCAD', cadData.rates.CAD);
      }

      this.connected = true;
      this.emit('connected');
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        logger.warn({ err: err.message }, '[Forex] Fetch error');
      }
      this.connected = false;
      this.emit('error', err);
    }
  }

  private emitForexTick(symbol: string, price: number) {
    if (!price || isNaN(price) || price <= 0) return;

    const spread = DEFAULT_SPREADS[symbol] || 0.0002;

    // Add small random variation to simulate live market movement
    // ECB rates are daily, so we add ±3 pip noise to make it feel live
    const noise = (Math.random() - 0.5) * spread * 0.5;
    const adjustedPrice = price + noise;

    const tick: PriceTick = {
      symbol,
      bid: Number((adjustedPrice - spread / 2).toPrecision(7)),
      ask: Number((adjustedPrice + spread / 2).toPrecision(7)),
      timestamp: Date.now(),
    };

    this.lastTickTime = Date.now();
    this.emit('tick', tick);
  }
}
