/**
 * Sprint 5.5 — MiFIR/EMIR-style trade export endpoints.
 *
 *   GET /api/v1/admin/reports/trades-mifir.csv   ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   GET /api/v1/admin/reports/trades-mifir.json  ?from=...&to=...
 *
 * Constraints:
 *   - Date range required (from <= to).
 *   - Range cannot exceed 366 days (one year + leap day).
 *   - Hard cap 50 000 rows; 4xx if exceeded so the operator narrows the range.
 *   - Only CLOSED-flavour trades are exported (status != OPEN).
 *   - Audited as REGULATORY_EXPORT — the export itself is a regulated event.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAdmin } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database/prisma';
import { audit } from '../../shared/audit';
import { logger } from '../../shared/utils/index';
import { buildMifirCsv, buildMifirJson, MifirTradeRow } from './mifir-export';

const QuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});

const MAX_DAYS = 366;
const MAX_ROWS = 50_000;

async function fetchRows(tenantId: string, from: Date, to: Date) {
  const trades = await prisma.trade.findMany({
    where: {
      tenant_id: tenantId,
      NOT: { status: 'OPEN' },
      close_time: { gte: from, lte: to },
    },
    include: {
      instrument: { select: { symbol: true, lot_size: true } },
    },
    orderBy: { close_time: 'asc' },
    take: MAX_ROWS + 1,
  });
  return trades.map<MifirTradeRow>((t) => ({
    id: t.id,
    user_id: t.user_id,
    open_time: t.open_time,
    close_time: t.close_time,
    side: t.side,
    volume: t.volume,
    open_price: t.open_price,
    close_price: t.close_price,
    status: t.status,
    pnl: t.pnl,
    commission: t.commission,
    symbol: t.instrument.symbol,
    lot_size: t.instrument.lot_size,
  }));
}

function parseRange(q: { from: string; to: string }): { from: Date; to: Date } | string {
  const from = new Date(`${q.from}T00:00:00.000Z`);
  const to = new Date(`${q.to}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'invalid date';
  if (from > to) return 'from must be <= to';
  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  if (days > MAX_DAYS) return `range exceeds ${MAX_DAYS} days; narrow the window`;
  return { from, to };
}

export async function reportsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/admin/reports/trades-mifir.csv',
    { preHandler: [tenantResolver, requireAdmin] },
    async (request, reply) => {
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const range = parseRange(parsed.data);
      if (typeof range === 'string') {
        return reply.status(400).send({ error: range, code: 'INVALID_RANGE' });
      }

      const rows = await fetchRows(request.tenantId!, range.from, range.to);
      if (rows.length > MAX_ROWS) {
        return reply.status(413).send({
          error: `Result exceeds ${MAX_ROWS} rows; narrow the date range`,
          code: 'RESULT_TOO_LARGE',
        });
      }

      const lei = request.tenantSlug || request.tenantId!;
      const body = buildMifirCsv(rows, lei);

      await audit.log({
        tenantId: request.tenantId!, actorId: request.userData!.sub, actorType: 'admin',
        action: 'REGULATORY_EXPORT',
        target: `mifir:${parsed.data.from}_${parsed.data.to}`,
        details: { format: 'csv', from: parsed.data.from, to: parsed.data.to, row_count: rows.length },
        ip: request.ip,
      });
      logger.info({ tenantId: request.tenantId, rows: rows.length, range: parsed.data }, 'MiFIR CSV exported');

      const filename = `mifir_${lei}_${parsed.data.from}_${parsed.data.to}.csv`;
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(body);
    },
  );

  fastify.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/v1/admin/reports/trades-mifir.json',
    { preHandler: [tenantResolver, requireAdmin] },
    async (request, reply) => {
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const range = parseRange(parsed.data);
      if (typeof range === 'string') {
        return reply.status(400).send({ error: range, code: 'INVALID_RANGE' });
      }

      const rows = await fetchRows(request.tenantId!, range.from, range.to);
      if (rows.length > MAX_ROWS) {
        return reply.status(413).send({
          error: `Result exceeds ${MAX_ROWS} rows; narrow the date range`,
          code: 'RESULT_TOO_LARGE',
        });
      }

      const lei = request.tenantSlug || request.tenantId!;
      const data = buildMifirJson(rows, lei);

      await audit.log({
        tenantId: request.tenantId!, actorId: request.userData!.sub, actorType: 'admin',
        action: 'REGULATORY_EXPORT',
        target: `mifir:${parsed.data.from}_${parsed.data.to}`,
        details: { format: 'json', from: parsed.data.from, to: parsed.data.to, row_count: rows.length },
        ip: request.ip,
      });

      return reply.send({ executing_lei: lei, from: parsed.data.from, to: parsed.data.to, count: rows.length, data });
    },
  );
}
