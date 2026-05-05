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
}

const clients = new Set<WsClient>();

export function setupWebSocketServer(fastify: FastifyInstance) {
  fastify.get('/ws/prices', { websocket: true }, (socket, request) => {
    const client: WsClient = {
      socket,
      subscriptions: new Set(['*']), // Subscribe to all by default
    };
    clients.add(client);

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
  fastify.get('/ws/account', { websocket: true }, (socket, request) => {
    const client: WsClient = { socket, subscriptions: new Set() };
    clients.add(client);

    socket.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth' && msg.token) {
          // In production, verify JWT here
          client.userId = msg.userId;
          client.tenantId = msg.tenantId;
        }
      } catch {
        // ignore
      }
    });

    socket.on('close', () => { clients.delete(client); });
    socket.on('error', () => { clients.delete(client); });
  });

  // Notifications WebSocket
  fastify.get('/ws/notifications', { websocket: true }, (socket, request) => {
    const client: WsClient = { socket, subscriptions: new Set() };
    clients.add(client);
    socket.on('close', () => { clients.delete(client); });
    socket.on('error', () => { clients.delete(client); });
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
export function sendAccountUpdate(userId: string, data: any) {
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
export function sendNotification(userId: string, data: { type: string; message: string; details?: any }) {
  const msg = JSON.stringify({ type: 'notification', data });
  for (const client of clients) {
    if (client.userId === userId && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(msg);
    }
  }
}
