import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/index';
import type { PriceTick } from '@tradexlabel/shared';

/**
 * Yahoo Finance REST connector — FREE, no API key needed.
 * Polls real-time quotes for indices, commodities, and forex.
 * Used as fallback when TwelveData quota is exhausted.
 */

// Internal symbol → Yahoo Finance symbol
const YAHOO_SYMBOLS: Record<string, string> = {
  // Indices
  US500: '%5EGSPC',
  US100: '%5EIXIC',
  US30: '%5EDJI',
  UK100: '%5EFTSE',
  DE40: '%5EGDAXI',
  // Commodities
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  USOIL: 'CL=F',
  UKOIL: 'BZ=F',
};

// Default spreads
const SPREADS: Record<string, number> = {
  US500: 0.50, US100: 1.00, US30: 2.00,
  UK100: 1.00, DE40: 1.20,
  XAUUSD: 0.50, XAGUSD: 0.05,
  USOIL: 0.04, UKOIL: 0.04,
};

export class YahooConnector extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null;
  private symbols: string[] = [];
  private connected = false;
  private pollMs: number;
  private lastTickTime = 0;

  constructor(pollIntervalMs = 15000) {
    super();
    this.pollMs = pollIntervalMs;
  }

  get isConnected() { return this.connected; }
  get lastTick() { return this.lastTickTime; }

  start(symbols: string[]) {
    this.symbols = symbols.filter(s => YAHOO_SYMBOLS[s]);
    if (this.symbols.length === 0) {
      logger.warn('[Yahoo] No supported symbols');
      return;
    }

    logger.info(`[Yahoo] Starting REST poller for ${this.symbols.length} symbols (every ${this.pollMs}ms)`);
    this.connected = true;
    this.emit('connected');

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
    logger.info('[Yahoo] Connector stopped');
  }

  private async fetchPrices() {
    // Fetch each symbol individually (Yahoo doesn't support batch in v8)
    for (const symbol of this.symbols) {
      try {
        const yahooSym = YAHOO_SYMBOLS[symbol];
        if (!yahooSym) continue;

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSym}?interval=1m&range=1d`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) continue;

        const data = await res.json() as {
          chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
        };
        const result = data?.chart?.result?.[0];
        if (!result?.meta?.regularMarketPrice) continue;

        const price = result.meta.regularMarketPrice;
        this.emitTick(symbol, price);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          logger.warn(`[Yahoo] Error fetching ${symbol}: ${err.message}`);
        }
      }
    }
  }

  private emitTick(symbol: string, price: number) {
    if (!price || isNaN(price) || price <= 0) return;

    const spread = SPREADS[symbol] || 0.01;
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
