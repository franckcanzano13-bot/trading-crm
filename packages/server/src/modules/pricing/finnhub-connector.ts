import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../shared/utils/index';
import type { PriceTick } from '@tradexlabel/shared';

/**
 * Finnhub WebSocket connector for real-time Forex + Crypto prices.
 * Free tier: real-time trades via WebSocket.
 */

// Finnhub symbol → internal symbol mapping
const FINNHUB_TO_INTERNAL: Record<string, string> = {
  'OANDA:EUR_USD': 'EURUSD',
  'OANDA:GBP_USD': 'GBPUSD',
  'OANDA:USD_JPY': 'USDJPY',
  'OANDA:USD_CHF': 'USDCHF',
  'OANDA:AUD_USD': 'AUDUSD',
  'OANDA:NZD_USD': 'NZDUSD',
  'OANDA:USD_CAD': 'USDCAD',
  'OANDA:EUR_GBP': 'EURGBP',
  'BINANCE:BTCUSDT': 'BTCUSD',
  'BINANCE:ETHUSDT': 'ETHUSD',
  'BINANCE:XRPUSDT': 'XRPUSD',
  'BINANCE:SOLUSDT': 'SOLUSD',
  'BINANCE:ADAUSDT': 'ADAUSD',
  'BINANCE:DOGEUSDT': 'DOGEUSD',
};

const INTERNAL_TO_FINNHUB: Record<string, string> = {};
for (const [fh, internal] of Object.entries(FINNHUB_TO_INTERNAL)) {
  INTERNAL_TO_FINNHUB[internal] = fh;
}

// Default spreads in price units (not pips) for generating bid/ask from trade price
const DEFAULT_SPREADS: Record<string, number> = {
  EURUSD: 0.00020, GBPUSD: 0.00025, USDJPY: 0.030,
  USDCHF: 0.00025, AUDUSD: 0.00020, NZDUSD: 0.00025,
  USDCAD: 0.00025, EURGBP: 0.00025,
  BTCUSD: 50.00, ETHUSD: 3.00, XRPUSD: 0.0005,
  SOLUSD: 0.20, ADAUSD: 0.0003, DOGEUSD: 0.00002,
};

export class FinnhubConnector extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private connected = false;
  private lastTickTime = 0;
  private symbols: Set<string> = new Set();

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  get isConnected() { return this.connected; }
  get lastTick() { return this.lastTickTime; }

  start(symbols: string[]) {
    this.symbols = new Set(symbols);
    this.connect();
  }

  stop() {
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    logger.info('[Finnhub] Connector stopped');
  }

  private connect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }

    const url = `wss://ws.finnhub.io?token=${this.apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info('[Finnhub] WebSocket connected');

      // Subscribe to all symbols
      for (const symbol of this.symbols) {
        const finnhubSymbol = INTERNAL_TO_FINNHUB[symbol];
        if (finnhubSymbol && this.ws) {
          this.ws.send(JSON.stringify({ type: 'subscribe', symbol: finnhubSymbol }));
        }
      }

      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          for (const trade of msg.data) {
            const internalSymbol = FINNHUB_TO_INTERNAL[trade.s];
            if (!internalSymbol) continue;

            const price = trade.p;
            const spread = DEFAULT_SPREADS[internalSymbol] || 0.0001;

            const tick: PriceTick = {
              symbol: internalSymbol,
              bid: Number((price - spread / 2).toPrecision(7)),
              ask: Number((price + spread / 2).toPrecision(7)),
              timestamp: trade.t || Date.now(),
            };

            this.lastTickTime = Date.now();
            this.emit('tick', tick);
          }
        } else if (msg.type === 'ping') {
          // Finnhub sends pings, no action needed
        }
      } catch (err: any) {
        logger.warn({ err: err.message }, '[Finnhub] Failed to parse message');
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      logger.warn('[Finnhub] WebSocket disconnected');
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[Finnhub] WebSocket error');
      this.connected = false;
      this.emit('error', err);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[Finnhub] Max reconnect attempts reached');
      this.emit('failed');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    logger.info(`[Finnhub] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

export { FINNHUB_TO_INTERNAL, INTERNAL_TO_FINNHUB };
