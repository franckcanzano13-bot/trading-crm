import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { priceEngine } from '../../modules/pricing/price-engine';
import { getAllPrices } from '../../modules/pricing/price-store';
import { logger } from '../utils/index';
import type { PriceTick } from '@tradexlabel/shared';

interface WsClient {
  socket: WebSocket;
  subscriptions: Set<string>;
  tenantId?: string;
  userId?: string;
  isAlive?: boolean;  // Sprint 2.7: heartbeat tracking
}

const clients = new Set<WsClient>();

// Sprint 2.7: heartbeat — every 30s, ping all sockets.
// If we don't get a pong before the next round, the socket is dead → terminate.
let heartbeatInterval: NodeJS.Timeout | null = null;
function startHeartbeat() {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (client.isAlive === false) {
        // Did not respond to last ping — kill it
        try { client.socket.terminate(); } catch {}
        clients.delete(client);
        continue;
      }
      client.isAlive = false;
      try { client.socket.ping(); } catch {}
    }
  }, 30_000);
  // Don't keep the process alive just for this
  if (heartbeatInterval.unref) heartbeatInterval.unref();
}

function trackHeartbeat(client: WsClient) {
  client.isAlive = true;
  client.socket.on('pong', () => { client.isAlive = true; });
}

export function setupWebSocketServer(fastify: FastifyInstance) {
  // Sprint 2.7: start the global heartbeat once
  startHeartbeat();

  fastify.get('/ws/prices', { websocket: true }, (socket, _request) => {
    const client: WsClient = {
      socket,
      subscriptions: new Set(['*']), // Subscribe to all by default
    };
    clients.add(client);
    trackHeartbeat(client);

    logger.info({ clientCount: clients.size }, 'WebSocket client connected');

    // Send initial prices
    const allPrices = getAllPrices();
    socket.send(JSON.stringify({ type: 'snapshot', data: allPrices }));

    socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribe' && Array.isArray(msg.symbols)) {
          client.subscriptions = new Set(msg.symbols);
        } else if (msg.type === 'unsubscribe' && Array.isArray(msg.symbols)) {
          for (const s of msg.symbols) {
            client.subscriptions.delete(s);
          }
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('close', () => {
      clients.delete(client);
      logger.info({ clientCount: clients.size }, 'WebSocket client disconnected');
    });

    socket.on('error', () => {
      clients.delete(client);
    });
  });

  // Account updates WebSocket
  fastify.get('/ws/account', { websocket: true }, (socket, _request) => {
    const client: WsClient = { socket, subscriptions: new Set() };
    clients.add(client);
    trackHeartbeat(client);
    let authTimer: NodeJS.Timeout | null = setTimeout(() => {
      // Drop unauthenticated clients after 5s
      if (!client.userId) {
        try { socket.close(1008, 'auth_timeout'); } catch {}
      }
    }, 5000);

    socket.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth' && msg.token) {
          // VULN-002 fix: actually verify the JWT, never trust client-supplied userId/tenantId
          try {
            const decoded = await fastify.jwt.verify(msg.token) as { sub: string; tenantId?: string };
            client.userId = decoded.sub;
            client.tenantId = decoded.tenantId;
            if (authTimer) { clearTimeout(authTimer); authTimer = null; }
            socket.send(JSON.stringify({ type: 'auth_ok' }));
          } catch {
            socket.send(JSON.stringify({ type: 'auth_failed' }));
            try { socket.close(1008, 'auth_failed'); } catch {}
          }
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('close', () => { if (authTimer) clearTimeout(authTimer); clients.delete(client); });
    socket.on('error', () => { if (authTimer) clearTimeout(authTimer); clients.delete(client); });
  });

  // Notifications WebSocket — same JWT auth model as /ws/account
  fastify.get('/ws/notifications', { websocket: true }, (socket, _request) => {
    const client: WsClient = { socket, subscriptions: new Set() };
    clients.add(client);
    trackHeartbeat(client);
    let authTimer: NodeJS.Timeout | null = setTimeout(() => {
      if (!client.userId) { try { socket.close(1008, 'auth_timeout'); } catch {} }
    }, 5000);

    socket.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth' && msg.token) {
          try {
            const decoded = await fastify.jwt.verify(msg.token) as { sub: string; tenantId?: string };
            client.userId = decoded.sub;
            client.tenantId = decoded.tenantId;
            if (authTimer) { clearTimeout(authTimer); authTimer = null; }
            socket.send(JSON.stringify({ type: 'auth_ok' }));
          } catch {
            socket.send(JSON.stringify({ type: 'auth_failed' }));
            try { socket.close(1008, 'auth_failed'); } catch {}
          }
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('close', () => { if (authTimer) clearTimeout(authTimer); clients.delete(client); });
    socket.on('error', () => { if (authTimer) clearTimeout(authTimer); clients.delete(client); });
  });

  // Listen for price ticks and broadcast
  priceEngine.on('tick', (tick: PriceTick) => {
    const msg = JSON.stringify({ type: 'tick', data: tick });
    for (const client of clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        if (client.subscriptions.has('*') || client.subscriptions.has(tick.symbol)) {
          client.socket.send(msg);
        }
      }
    }
  });
}

/**
 * Send an account update to a specific user.
 */
export function sendAccountUpdate(userId: string, data: unknown) {
  const msg = JSON.stringify({ type: 'account_update', data });
  for (const client of clients) {
    if (client.userId === userId && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(msg);
    }
  }
}

/**
 * Send a notification to a specific user.
 */
export function sendNotification(userId: string, data: { type: string; message: string; details?: unknown }) {
  const msg = JSON.stringify({ type: 'notification', data });
  for (const client of clients) {
    if (client.userId === userId && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(msg);
    }
  }
}
