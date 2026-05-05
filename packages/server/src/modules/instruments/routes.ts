import { FastifyInstance } from 'fastify';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth } from '../../shared/middleware/auth';

export async function instrumentRoutes(fastify: FastifyInstance) {
  // List all active instruments
  fastify.get('/api/v1/instruments', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const instruments = await request.tenantQuery!.listInstruments(true);
    return reply.send({ data: instruments });
  });

  // Get candles for an instrument
  fastify.get<{
    Params: { symbol: string };
    Querystring: { timeframe?: string; limit?: string };
  }>('/api/v1/instruments/:symbol/candles', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const { symbol } = request.params;
    const timeframe = request.query.timeframe || '1h';
    const limit = Math.min(parseInt(request.query.limit || '500', 10), 1000);

    const instrument = await request.tenantQuery!.findInstrumentBySymbol(symbol);
    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found', code: 'INSTRUMENT_NOT_FOUND' });
    }

    const candles = await request.tenantQuery!.getCandles(instrument.id, timeframe, limit);
    return reply.send({ data: candles });
  });
}
