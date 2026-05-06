import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/index';
import type { PriceTick } from '@tradexlabel/shared';

/**
 * Twelve Data REST connector for Indices + Commodities.
 * Free tier: 800 API calls/day, 8 per minute.
 * Polls at regular intervals to stay within limits.
 */

// Twelve Data symbol → internal symbol mapping
const TD_TO_INTERNAL: Record<string, string> = {
  'SPX': 'US500',
  'NDX': 'US100',
  'DJI': 'US30',
  'UKX': 'UK100',
  'DAX': 'DE40',
  'XAU/USD': 'XAUUSD',
  'XAG/USD': 'XAGUSD',
  'WTI': 'USOIL',
  'BRENT': 'UKOIL',
};

const INTERNAL_TO_TD: Record<string, string> = {};
for (const [td, internal] of Object.entries(TD_TO_INTERNAL)) {
  INTERNAL_TO_TD[internal] = td;
}

// Default spreads for indices/commodities
const DEFAULT_SPREADS: Record<string, number> = {
  US500: 0.50, US100: 1.00, US30: 2.00,
  UK100: 1.00, DE40: 1.20,
  XAUUSD: 0.30, XAGUSD: 0.03,
  USOIL: 0.04, UKOIL: 0.04,
};

export class TwelveDataConnector extends EventEmitter {
  private apiKey: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private symbols: string[] = [];
  private connected = false;
  private lastTickTime = 0;
  private pollMs: number;

  constructor(apiKey: string, pollIntervalMs = 10000) {
    super();
    this.apiKey = apiKey;
    this.pollMs = pollIntervalMs;
  }

  get isConnected() { return this.connected; }
  get lastTick() { return this.lastTickTime; }

  start(symbols: string[]) {
    this.symbols = symbols.filter(s => INTERNAL_TO_TD[s]);
    if (this.symbols.length === 0) {
      logger.warn('[TwelveData] No supported symbols to poll');
      return;
    }

    logger.info(`[TwelveData] Starting REST poller for ${this.symbols.length} symbols (every ${this.pollMs}ms)`);
    this.connected = true;
    this.emit('connected');

    // Initial fetch
    this.fetchPrices();

    // Poll at regular intervals
    this.pollInterval = setInterval(() => {
      this.fetchPrices();
    }, this.pollMs);
  }

  stop() {
    this.connected = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('[TwelveData] Connector stopped');
  }

  private async fetchPrices() {
    try {
      // Batch request: Twelve Data supports comma-separated symbols
      const tdSymbols = this.symbols
        .map(s => INTERNAL_TO_TD[s])
        .filter(Boolean)
        .join(',');

      const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(tdSymbols)}&apikey=${this.apiKey}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        logger.warn(`[TwelveData] HTTP ${res.status}`);
        return;
      }

      const data = await res.json() as Record<string, unknown>;

      // Single symbol returns { price: "123.45" }
      // Multiple symbols returns { "SPX": { price: "5200.50" }, "NDX": { price: "18100.00" }, ... }
      if (typeof data.price === 'string' && this.symbols.length === 1) {
        // Single symbol response
        const symbol = this.symbols[0];
        this.emitTick(symbol, Number(data.price));
      } else {
        // Multi-symbol response
        for (const [tdSymbol, value] of Object.entries(data)) {
          const internal = TD_TO_INTERNAL[tdSymbol];
          if (internal && value && typeof value === 'object' && 'price' in value) {
            this.emitTick(internal, Number((value as { price: string | number }).price));
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : '';
      if (name === 'AbortError') {
        logger.warn('[TwelveData] Request timeout');
      } else {
        logger.warn({ err: message }, '[TwelveData] Fetch error');
      }
      this.connected = false;
      this.emit('error', err);
    }
  }

  private emitTick(symbol: string, price: number) {
    if (!price || isNaN(price) || price <= 0) return;

    const spread = DEFAULT_SPREADS[symbol] || 0.01;
    const tick: PriceTick = {
      symbol,
      bid: Number((price - spread / 2).toPrecision(7)),
      ask: Number((price + spread / 2).toPrecision(7)),
      timestamp: Date.now(),
    };

    this.lastTickTime = Date.now();
    this.connected = true;
    this.emit('tick', tick);
  }
}

export { TD_TO_INTERNAL, INTERNAL_TO_TD };
