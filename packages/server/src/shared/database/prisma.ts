import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const baseClient =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

/**
 * Sprint 5.2 / 6.5 — audit_logs is append-only. Layered defense:
 *   1. Prisma client extension below throws loudly on update/delete/upsert.
 *   2. The 20260506000100_audit_logs_append_only migration installs Postgres
 *      INSTEAD-OF-NOTHING rules so even raw `$queryRawUnsafe('UPDATE
 *      audit_logs ...')` or external psql sessions silently no-op instead
 *      of mutating the table. TRUNCATE is also revoked from PUBLIC.
 *
 * Reads, finds, counts, and creates remain allowed at both layers.
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
