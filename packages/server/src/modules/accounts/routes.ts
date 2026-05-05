import { FastifyInstance } from 'fastify';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth } from '../../shared/middleware/auth';
import { serializeBigInt } from '../../shared/utils/index';

export async function accountRoutes(fastify: FastifyInstance) {
  // Get account info
  fastify.get('/api/v1/account', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const account = await request.tenantQuery!.findAccountByUserId(request.userData!.sub);
    if (!account) {
      return reply.status(404).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    }
    return reply.send({ data: serializeBigInt(account) });
  });

  // Get transactions
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/api/v1/account/transactions', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const account = await request.tenantQuery!.findAccountByUserId(request.userData!.sub);
    if (!account) {
      return reply.status(404).send({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    }
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);
    const transactions = await request.tenantQuery!.findTransactions(account.id, limit, offset);
    return reply.send({ data: serializeBigInt(transactions) });
  });
}
