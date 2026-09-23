import 'dotenv/config';

// Phase 0.2 diagnostics: the api container exited with code 1 in CI without a
// single error line. These handlers write synchronously to stderr so a crash
// is never lost to buffered logging, whatever the cause.
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException', err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection', reason instanceof Error ? reason.stack || reason.message : reason);
  process.exit(1);
});
process.on('exit', (code) => {
  if (code !== 0) console.error(`[process] exiting with code ${code}`);
});
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registry, httpRequestsTotal, httpRequestDuration } from './shared/metrics';
import './shared/metrics/runtime'; // Phase 1.7: drift / price source / monitor gauges
import { config } from './config/index';
import { logger } from './shared/utils/index';
import { prisma } from './shared/database/prisma';
import { priceEngine } from './modules/pricing/price-engine';
import { setupWebSocketServer } from './shared/websocket/ws-server';
import { startPositionMonitor } from './modules/trading/position-monitor';
import { assertProductionKey } from './shared/crypto';
import { timingSafeEqual } from 'crypto';

// Route imports
import { authRoutes } from './modules/auth/routes';
import { passwordResetRoutes } from './modules/auth/password-reset';
import { emailVerificationRoutes } from './modules/auth/email-verification';
import { instrumentRoutes } from './modules/instruments/routes';
import { tradingRoutes } from './modules/trading/routes';
import { accountRoutes } from './modules/accounts/routes';
import { withdrawalRoutes } from './modules/accounts/withdrawals';
import { adminClientRoutes } from './modules/users/routes';
import { totpRoutes } from './modules/totp/routes';
import { tenantRoutes } from './modules/tenants/routes';
import { candlesRoute } from './modules/pricing/candles-route';
import { crmRoutes } from './modules/crm/routes';
import { emailRoutes } from './modules/crm/email-routes';
import { reportsRoutes } from './modules/reports/routes';


/**
 * Sprint 9.2 — Try to reach Redis for the rate-limit store. Returns a
 * connected client or null (in-memory fallback). Bounded to ~1s so a
 * missing Redis never delays boot noticeably.
 */
async function connectRedisForRateLimit(log: FastifyBaseLogger): Promise<Redis | null> {
  if (!config.REDIS_URL) return null;
  const client = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null, // never reconnect in a loop; the fallback is in-memory
  });
  client.on('error', () => { /* surfaced by the ping below; silences reconnect noise */ });
  try {
    await client.connect();
    await client.ping();
    log.info({ redis: config.REDIS_URL.replace(/\/\/.*@/, '//***@') }, '[rate-limit] Redis store connected (shared across replicas)');
    return client;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, '[rate-limit] Redis unreachable - falling back to in-memory store (per-process)');
    client.disconnect();
    return null;
  }
}

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

  // Sprint 9.2: rate-limit counters live in Redis when REDIS_URL is
  // reachable, so the 5/15min login limiter (Sprint 2.1) is shared across
  // API replicas. If Redis is unreachable at boot (typical local dev), we
  // log a warning and fall back to the in-memory store instead of failing
  // every request — CLAUDE.md rule 6 (fallback, never block).
  const redisForRateLimit = await connectRedisForRateLimit(fastify.log);
  await fastify.register(rateLimit, {
    max: 2000,
    timeWindow: '1 minute',
    ...(redisForRateLimit ? { redis: redisForRateLimit, nameSpace: 'txl-rl:' } : {}),
  });
  if (redisForRateLimit) {
    fastify.addHook('onClose', async () => { await redisForRateLimit.quit().catch(() => {}); });
  }

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

  // Sprint 3.3: HTTP metrics — record every request duration & status
  type MetricsReq = { _metricsStart?: bigint; routeOptions?: { url?: string } };
  fastify.addHook('onRequest', async (request) => {
    (request as unknown as MetricsReq)._metricsStart = process.hrtime.bigint();
  });
  fastify.addHook('onResponse', async (request, reply) => {
    const r = request as unknown as MetricsReq;
    const start = r._metricsStart;
    if (!start) return;
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    // Use routerPath (not raw URL) to avoid high-cardinality from path params
    // Fastify 5 (Sprint 9.1): request.routerPath was removed; routeOptions.url is the canonical source.
    const route = r.routeOptions?.url || 'unknown';
    httpRequestsTotal.labels(request.method, route, String(reply.statusCode)).inc();
    httpRequestDuration.labels(request.method, route).observe(seconds);
  });

  // /metrics endpoint — Prometheus scrape target.
  // Sprint 4.5: requires Bearer METRICS_AUTH_TOKEN. In dev with no token, open
  // (developer convenience). In prod with no token, denied — fail-secure.
  fastify.get('/metrics', async (request, reply) => {
    const expected = config.METRICS_AUTH_TOKEN;
    const isProd = config.NODE_ENV === 'production';
    if (expected) {
      const auth = request.headers.authorization || '';
      const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      // Sprint 6.4: constant-time compare via crypto.timingSafeEqual. The
      // length-equality short-circuit is fine — token length is not a secret
      // (it's a server-config constant), and timingSafeEqual would throw on
      // mismatched buffer lengths.
      const a = Buffer.from(provided, 'utf8');
      const b = Buffer.from(expected, 'utf8');
      const match = a.length === b.length && timingSafeEqual(a, b);
      if (!match) {
        reply.code(401).send({ error: 'metrics auth required', code: 'METRICS_AUTH' });
        return;
      }
    } else if (isProd) {
      reply.code(401).send({ error: 'METRICS_AUTH_TOKEN not configured', code: 'METRICS_AUTH' });
      return;
    }
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // ─── Routes ───
  await fastify.register(authRoutes);
  await fastify.register(passwordResetRoutes); // Phase 1.1
  await fastify.register(emailVerificationRoutes); // Phase 1.2
  await fastify.register(instrumentRoutes);
  await fastify.register(tradingRoutes);
  await fastify.register(accountRoutes);
  await fastify.register(withdrawalRoutes); // Phase 1.5
  await fastify.register(adminClientRoutes);
  await fastify.register(totpRoutes);
  await fastify.register(tenantRoutes);
  await fastify.register(candlesRoute);
  await fastify.register(crmRoutes);
  await fastify.register(emailRoutes);
  await fastify.register(reportsRoutes);

  // ─── Dealer Routes ───
  // Sprint 7.5: dealer module loads ONLY when the operator opts in via
  // ENABLE_DEALER_MODULE=1. Two layers of isolation:
  //   1. Build-time: the regulated Docker profile (BUILD_PROFILE=regulated)
  //      strips packages/server/src/modules/dealer/ before tsc — the code
  //      never enters dist/ and cannot be loaded.
  //   2. Runtime: even in a "full" build, the import below is skipped when
  //      the env flag is unset, so a misconfigured regulated tenant cannot
  //      reach dealer routes (each route also runs requireDealerMode which
  //      verifies tenant.execution_mode === 'B_BOOK_DEALER').
  if (process.env.ENABLE_DEALER_MODULE === '1') {
    try {
      // The path is assembled at runtime ON PURPOSE: with a string literal,
      // tsc resolves the module statically and the regulated Docker build
      // (dealer/ removed before compilation) fails with TS2307. The first
      // CI run of that profile caught it.
      const dealerModulePath = './modules/dealer/' + 'routes';
      const { dealerRoutes } = (await import(dealerModulePath)) as { dealerRoutes: (app: FastifyInstance) => Promise<void> };
      await fastify.register(dealerRoutes);
      logger.info('[index] dealer module loaded (ENABLE_DEALER_MODULE=1)');
    } catch (err) {
      // dist/ doesn't include the module (regulated build) — fail loud so
      // operators don't silently lose dealer functionality.
      logger.error({ err }, '[index] ENABLE_DEALER_MODULE=1 but dealer module not present in build');
      throw err;
    }
  } else {
    logger.info('[index] dealer module disabled (set ENABLE_DEALER_MODULE=1 to enable)');
  }

  // ─── WebSocket ───
  setupWebSocketServer(fastify);

  // ─── Health check ───
  fastify.get('/api/v1/health', async () => {
    const sources: Record<string, { name: string; status: string; lastTick: string | null; tickCount: number }> = {};
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
    // Sprint 4.2: fail-fast on missing ENCRYPTION_KEY in production
    assertProductionKey();

    const fastify = await buildServer();

    // Connect to database
    await prisma.$connect();
    logger.info('Connected to PostgreSQL');

    // Start price engine
    priceEngine.start();

    // Sprint 3.6: position monitor can be hosted in a separate worker process.
    // Set RUN_AS_API_ONLY=1 to skip; run dist/workers/position-monitor-worker.js
    // as a sibling process in production.
    if (process.env.RUN_AS_API_ONLY === '1') {
      logger.info('[index] RUN_AS_API_ONLY=1 — position monitor not started in this process');
    } else {
      startPositionMonitor();
    }

    // Start server
    await fastify.listen({ port: config.PORT, host: config.HOST });
    logger.info(`Server running on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    console.error('[start] failed:', err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  }
}

// Export for testing
export { buildServer };

// Sprint 7.5: skip auto-start when imported by the test runner. Tests
// `import { buildServer }` and exercise the route table without listening.
if (process.env.NODE_ENV !== 'test') {
  start();
}
