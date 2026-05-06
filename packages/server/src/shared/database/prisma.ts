import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const baseClient =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

/**
 * Sprint 5.2 — audit_logs is append-only. We forbid UPDATE / DELETE / upsert
 * on AuditLog at the Prisma client level. This is defense-in-depth — a real
 * production hardening would also revoke UPDATE/DELETE on the table at the
 * Postgres role level (or use a trigger that raises EXCEPTION).
 *
 * Reads, finds, counts, and creates remain allowed.
 */
export const prisma = baseClient.$extends({
  query: {
    auditLog: {
      async update() { throw new Error('audit_logs is append-only — UPDATE forbidden'); },
      async updateMany() { throw new Error('audit_logs is append-only — UPDATE forbidden'); },
      async upsert() { throw new Error('audit_logs is append-only — UPSERT forbidden'); },
      async delete() { throw new Error('audit_logs is append-only — DELETE forbidden'); },
      async deleteMany() { throw new Error('audit_logs is append-only — DELETE forbidden'); },
    },
  },
}) as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = baseClient;
}

/**
 * No-op for SQLite mode. In production PostgreSQL mode, this would create a schema.
 */
export async function createTenantSchema(_tenantSlug: string): Promise<void> {
  // SQLite mode: all tables share one database, tenant isolation via tenant_id column
}
