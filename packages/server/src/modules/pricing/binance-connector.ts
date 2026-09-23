import { EventEmitter } from 'events';
import { detachSocket, isPermanentUpgradeFailure } from './ws-utils';
import WebSocket from 'ws';
import { logger } from '../../shared/utils/index';
import type { PriceTick } from '@tradexlabel/shared';

/**
 * Binance WebSocket connector — FREE, no API key required.
 * Provides real-time crypto prices via public streams.
 * Uses combined stream for multiple symbols.
 */

// Binance stream name → internal symbol
const BINANCE_TO_INTERNAL: Record<string, string> = {
  'btcusdt': 'BTCUSD',
  'ethusdt': 'ETHUSD',
  'xrpusdt': 'XRPUSD',
  'solusdt': 'SOLUSD',
  'adausdt': 'ADAUSD',
  'dogeusdt': 'DOGEUSD',
};

const CRYPTO_SYMBOLS = Object.values(BINANCE_TO_INTERNAL);

export class BinanceConnector extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private givenUp = false; // permanent upgrade failure (451/403): stop retrying
  private connected = false;
  private lastTickTime = 0;

  get isConnected() { return this.connected; }
  get lastTick() { return this.lastTickTime; }
  get symbols() { return CRYPTO_SYMBOLS; }

  start() {
    this.connect();
  }

  stop() {
    this.connected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      detachSocket(this.ws);
      this.ws = null;
    }
    logger.info('[Binance] Connector stopped');
  }

  private connect() {
    // Abandon the previous socket without leaving it listener-less: a late
    // 'error' on an orphaned socket would otherwise be thrown and kill the
    // process (CI finding: Binance HTTP 451 geo-block).
    if (this.ws) detachSocket(this.ws);

    // Combined stream for all crypto pairs - miniTicker gives bid/ask-like data
    const streams = Object.keys(BINANCE_TO_INTERNAL).map(s => `${s}@bookTicker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    this.ws = new WebSocket(url);

    // Upgrade refused with an HTTP status (e.g. 451 geo-block, 403). Handling
    // 'unexpected-response' ourselves keeps ws from emitting a synthetic
    // error; permanent statuses give up cleanly, the price engine falls back.
    this.ws.on('unexpected-response', (_req, res) => {
      const status = res.statusCode;
      logger.error({ status }, '[%s] WebSocket upgrade refused (HTTP %s)', 'Binance', status);
      this.connected = false;
      if (isPermanentUpgradeFailure(status)) {
        logger.warn('[Binance] HTTP %s is permanent for this host (geo-block or auth) — not reconnecting; other sources / mock feed take over', status);
        this.givenUp = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        detachSocket(this.ws);
        this.ws = null;
        this.emit('failed');
        return;
      }
      detachSocket(this.ws);
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      logger.info('[Binance] WebSocket connected (real-time crypto prices)');
      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        // Combined stream format: { stream: "btcusdt@bookTicker", data: { ... } }
        const payload = msg.data;
        if (!payload || !payload.s) return;

        const symbol = payload.s.toLowerCase();
        const internal = BINANCE_TO_INTERNAL[symbol];
        if (!internal) return;

        // bookTicker gives best bid/ask
        const bid = Number(payload.b);
        const ask = Number(payload.a);
        if (!bid || !ask || bid <= 0 || ask <= 0) return;

        const tick: PriceTick = {
          symbol: internal,
          bid,
          ask,
          timestamp: Date.now(),
        };

        this.lastTickTime = Date.now();
        this.emit('tick', tick);
      } catch {
        // Ignore parse errors
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      logger.warn('[Binance] WebSocket disconnected');
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      logger.error({ err: err.message }, '[Binance] WebSocket error');
      this.connected = false;
      this.emit('error', err);
    });
  }

  private scheduleReconnect() {
    if (this.givenUp) return;
    if (this.reconnectAttempts >= 10) {
      logger.error('[Binance] Max reconnect attempts reached');
      this.emit('failed');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    logger.info(`[Binance] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
