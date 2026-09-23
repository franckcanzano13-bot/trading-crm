import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database/prisma';
import { TenantQuery } from '../database/tenant-queries';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    tenantSlug?: string;
    tenantConfig?: string;
    tenantExecutionMode?: string;
    tenantQuery?: TenantQuery;
  }
}

type ResolvedTenant = { id: string; slug: string; config: string; execution_mode: string; name: string };
const TENANT_SELECT = { id: true, slug: true, config: true, execution_mode: true, name: true } as const;

/** Host header → bare hostname: lower-case, no port, no trailing dot. */
export function normalizeHost(raw: string | undefined | null): string {
  if (!raw) return '';
  const first = raw.split(',')[0].trim().toLowerCase();
  return first.replace(/:\d+$/, '').replace(/\.$/, '');
}

/**
 * Phase 1.4 — Resolve a tenant from the host it is served on.
 *
 * Order:
 *   1. tenant.domain equals the host, or the host minus a leading `api.` /
 *      `www.` (the API is typically on api.<broker-domain>).
 *   2. Legacy: first label of the host is the tenant slug (<slug>.tradexlabel.com).
 *
 * Only active tenants resolve. Returns null when nothing matches.
 */
export async function resolveTenantByHost(rawHost: string | undefined | null): Promise<ResolvedTenant | null> {
  const host = normalizeHost(rawHost);
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;

  const candidates = new Set<string>([host]);
  for (const prefix of ['api.', 'www.', 'app.']) {
    if (host.startsWith(prefix)) candidates.add(host.slice(prefix.length));
  }
  const byDomain = await prisma.tenant.findFirst({
    where: { domain: { in: [...candidates], mode: 'insensitive' }, is_active: true },
    select: TENANT_SELECT,
  });
  if (byDomain) return byDomain;

  const subdomain = host.split('.')[0];
  if (subdomain && subdomain !== 'www' && subdomain !== 'api' && host.includes('.')) {
    const bySlug = await prisma.tenant.findFirst({ where: { slug: subdomain, is_active: true }, select: TENANT_SELECT });
    if (bySlug) return bySlug;
  }
  return null;
}

function attach(request: FastifyRequest, tenant: ResolvedTenant) {
  request.tenantId = tenant.id;
  request.tenantSlug = tenant.slug;
  request.tenantConfig = tenant.config;
  request.tenantExecutionMode = tenant.execution_mode;
  request.tenantQuery = new TenantQuery(tenant.id);
}

/**
 * Middleware: X-Tenant-ID header first (explicit, used by the SPA), otherwise
 * the host the request came in on (X-Forwarded-Host behind a proxy, then Host).
 */
export async function tenantResolver(request: FastifyRequest, reply: FastifyReply) {
  const tenantId = request.headers['x-tenant-id'] as string | undefined;

  if (!tenantId) {
    const forwarded = request.headers['x-forwarded-host'];
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || request.headers.host || '';
    const tenant = await resolveTenantByHost(host);
    if (tenant) { attach(request, tenant); return; }
    return reply.status(400).send({ error: 'Missing tenant identifier', code: 'TENANT_REQUIRED' });
  }

  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, is_active: true }, select: TENANT_SELECT });
  if (!tenant) {
    return reply.status(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
  }
  attach(request, tenant);
}
