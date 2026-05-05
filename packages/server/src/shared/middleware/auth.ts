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

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify() as JwtUserPayload;
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
