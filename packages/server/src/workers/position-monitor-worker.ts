/**
 * Sprint 3.6 — Position monitor as a standalone worker process.
 *
 * The audit recommended externalizing the position monitor so a fault in
 * SL/TP / liquidation handling doesn't kill the API. This entry point lets
 * ops run it as a separate Node process (e.g. on a different container).
 *
 * Run:
 *   node dist/workers/position-monitor-worker.js
 *
 * The API process can opt out of starting its own monitor by setting
 * `RUN_AS_API_ONLY=1`. When that env var is set, src/index.ts skips
 * `startPositionMonitor()`.
 *
 * BullMQ-based job queueing is a follow-up — see ADR-007 (TBD).
 */
import 'dotenv/config';
import { logger } from '../shared/utils/index';
import { prisma } from '../shared/database/prisma';
import { priceEngine } from '../modules/pricing/price-engine';
import { startPositionMonitor } from '../modules/trading/position-monitor';

async function main() {
  logger.info('[Worker] Position monitor worker starting...');
  await prisma.$connect();
  logger.info('[Worker] DB connected');

  // Position monitor needs live prices to decide SL/TP and liquidation
  priceEngine.start();
  logger.info('[Worker] Price engine started');

  startPositionMonitor();
  logger.info('[Worker] Position monitor running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, '[Worker] shutting down');
    try { await prisma.$disconnect(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, '[Worker] fatal error');
  process.exit(1);
});
