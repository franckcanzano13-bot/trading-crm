import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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
import { totpRoutes } from './modules/totp/routes';
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
  // Sprint 2.2: CORS whitelist instead of `origin: true` (which reflected
  // any origin). In production set CORS_ALLOWED_ORIGINS to a comma-separated
  // list. In dev (`*`), all origins are allowed for convenience.
  const corsOrigins = config.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  const corsAllowAll = corsOrigins.length === 1 && corsOrigins[0] === '*';
  await fastify.register(cors, {
    origin: corsAllowAll
      ? true
      : (origin, cb) => {
          if (!origin) return cb(null, true); // server-to-server
          if (corsOrigins.includes(origin)) return cb(null, true);
          return cb(new Error(`CORS: origin '${origin}' not allowed`), false);
        },
    credentials: true,
  });

  // Sprint 2.2: enable Content-Security-Policy. Permissive in dev, strict in prod.
  await fastify.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production'
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'wss:', 'https:'],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false, // allow loading external charts data in dev
  });

  await fastify.register(jwt, {
    secret: config.JWT_SECRET,
  });

  await fastify.register(rateLimit, {
    max: 2000,
    timeWindow: '1 minute',
  });

  await fastify.register(websocket);

  // Sprint 3.2: OpenAPI / Swagger UI — auto-generates spec from route schemas.
  // Routes opt-in by adding a `schema: { ... }` Fastify route option. Routes
  // without a schema still appear in the spec with empty descriptions.
  // Disabled in production unless EXPOSE_API_DOCS is set.
  const exposeDocs = config.NODE_ENV !== 'production' || process.env.EXPOSE_API_DOCS === '1';
  if (exposeDocs) {
    await fastify.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'TradeXLabel API',
          description: 'Multi-tenant trading platform API. Endpoints expect X-Tenant-ID header for tenant routes; admin routes additionally require Bearer JWT.',
          version: '1.0.0',
        },
        servers: [{ url: `http://${config.HOST}:${config.PORT}` }],
        components: {
          securitySchemes: {
            BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
            TenantHeader: { type: 'apiKey', in: 'header', name: 'X-Tenant-ID' },
          },
        },
        tags: [
          { name: 'auth', description: 'Trader registration & login' },
          { name: 'admin', description: 'Broker admin operations (deposit, withdraw, KYC)' },
          { name: 'trading', description: 'Order placement, positions, history' },
          { name: 'instruments', description: 'Tradable instruments' },
          { name: 'crm', description: 'Lead pipeline, affiliates, email' },
          { name: 'dealer', description: 'Dealer interventions (B_BOOK_DEALER tenants only)' },
          { name: 'totp', description: 'Two-factor authentication setup' },
          { name: 'super', description: 'SuperAdmin platform operations' },
        ],
      },
    });
    await fastify.register(swaggerUi, {
      routePrefix: '/api/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
      staticCSP: true,
    });
  }

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
  await fastify.register(totpRoutes);
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
