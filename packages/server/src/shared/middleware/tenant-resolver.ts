import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database/prisma';
import { TenantQuery } from '../database/tenant-queries';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    tenantSlug?: string;
    tenantConfig?: any;
    tenantExecutionMode?: string;
    tenantQuery?: TenantQuery;
  }
}

/**
 * Middleware to resolve the tenant from X-Tenant-ID header or subdomain.
 */
export async function tenantResolver(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.headers['x-tenant-id'] as string | undefined;

  if (!tenantId) {
    // Try subdomain
    const host = request.headers.host || '';
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'localhost' && subdomain !== 'www') {
      const tenant = await prisma.tenant.findFirst({
        where: { slug: subdomain, is_active: true },
      });
      if (tenant) {
        request.tenantId = tenant.id;
        request.tenantSlug = tenant.slug;
        request.tenantConfig = tenant.config;
        request.tenantExecutionMode = tenant.execution_mode;
        request.tenantQuery = new TenantQuery(tenant.id);
        return;
      }
    }
    return reply.status(400).send({ error: 'Missing tenant identifier', code: 'TENANT_REQUIRED' });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, is_active: true },
  });

  if (!tenant) {
    return reply.status(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
  }

  request.tenantId = tenant.id;
  request.tenantSlug = tenant.slug;
  request.tenantConfig = tenant.config;
  request.tenantExecutionMode = tenant.execution_mode;
  request.tenantQuery = new TenantQuery(tenant.id);
}
