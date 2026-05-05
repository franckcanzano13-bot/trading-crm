import { FastifyRequest, FastifyReply } from 'fastify';

export interface JwtUserPayload {
  sub: string;
  email: string;
  role: 'trader' | 'admin' | 'seller' | 'retention' | 'superadmin';
  tenantId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    userData?: JwtUserPayload;
  }
}

/**
 * Verify the JWT tenant claim matches the resolved request tenant.
 * Prevents cross-tenant escalation where an admin of tenant A sends
 * X-Tenant-ID: B and accesses tenant B data.
 *
 * SuperAdmin bypasses this check (no tenantId in their JWT).
 */
function checkTenantMatch(decoded: JwtUserPayload, request: FastifyRequest): string | null {
  if (decoded.role === 'superadmin') return null;
  const resolvedTenantId = (request as any).tenantId;
  if (!resolvedTenantId) return null; // tenantResolver hasn't run, skip
  if (!decoded.tenantId) return 'JWT missing tenantId claim';
  if (decoded.tenantId !== resolvedTenantId) return 'Tenant mismatch';
  return null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify() as JwtUserPayload;
    const mismatch = checkTenantMatch(decoded, request);
    if (mismatch) return reply.status(403).send({ error: mismatch, code: 'TENANT_MISMATCH' });
    request.userData = decoded;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify() as JwtUserPayload;
    if (!['admin', 'seller', 'retention'].includes(decoded.role)) {
      return reply.status(403).send({ error: 'Forbidden', code: 'ADMIN_REQUIRED' });
    }
    const mismatch = checkTenantMatch(decoded, request);
    if (mismatch) return reply.status(403).send({ error: mismatch, code: 'TENANT_MISMATCH' });
    request.userData = decoded;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }
}

export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify() as JwtUserPayload;
    if (decoded.role !== 'superadmin') {
      return reply.status(403).send({ error: 'Forbidden', code: 'SUPERADMIN_REQUIRED' });
    }
    request.userData = decoded;
  } catch {
    return reply.status(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }
}
