import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config/index';
import { logger } from './shared/utils/index';
import { prisma } from './shared/database/prisma';
import { priceEngine } from './modules/pricing/price-engine';
import { setupWebSocketServer } from './shared/websocket/ws-server';
import { startPositionMonitor } from './modules/trading/position-monitor';

// Route imports
import { authRoutes } from './modules/auth/routes';
import { instrumentRoutes } from './modules/instruments/routes';
import { tradingRoutes } from './modules/trading/routes';
import { accountRoutes } from './modules/accounts/routes';
import { adminClientRoutes } from './modules/users/routes';
import { tenantRoutes } from './modules/tenants/routes';
import { candlesRoute } from './modules/pricing/candles-route';
import { crmRoutes } from './modules/crm/routes';
import { emailRoutes } from './modules/crm/email-routes';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  // ─── Plugins ───
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
  });

  await fastify.register(rateLimit, {
    max: 2000,
    timeWindow: '1 minute',
  });

  await fastify.register(websocket);

  // ─── BigInt serialization ───
  fastify.addHook('preSerialization', async (request, reply, payload) => {
    return JSON.parse(JSON.stringify(payload, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
  });

  // ─── Routes ───
  await fastify.register(authRoutes);
  await fastify.register(instrumentRoutes);
  await fastify.register(tradingRoutes);
  await fastify.register(accountRoutes);
  await fastify.register(adminClientRoutes);
  await fastify.register(tenantRoutes);
  await fastify.register(candlesRoute);
  await fastify.register(crmRoutes);
  await fastify.register(emailRoutes);

  // ─── Dealer Routes ───
  // Registered globally, but each route runs requireDealerMode middleware
  // which checks tenant.execution_mode === 'B_BOOK_DEALER'. Other tenants get 403.
  const { dealerRoutes } = await import('./modules/dealer/routes');
  await fastify.register(dealerRoutes);

  // ─── WebSocket ───
  setupWebSocketServer(fastify);

  // ─── Health check ───
  fastify.get('/api/v1/health', async () => {
    const sources: Record<string, any> = {};
    for (const [key, info] of priceEngine.getSourceInfo()) {
      sources[key] = {
        name: info.name,
        status: info.status,
        lastTick: info.lastTick ? new Date(info.lastTick).toISOString() : null,
        tickCount: info.tickCount,
      };
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      priceSources: sources,
    };
  });

  return fastify;
}

async function start() {
  try {
    const fastify = await buildServer();

    // Connect to database
    await prisma.$connect();
    logger.info('Connected to PostgreSQL');

    // Start price engine
    priceEngine.start();

    // Start position monitor (SL/TP, limit/stop orders, margin calls)
    startPositionMonitor();

    // Start server
    await fastify.listen({ port: config.PORT, host: config.HOST });
    logger.info(`Server running on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Export for testing
export { buildServer };

start();
