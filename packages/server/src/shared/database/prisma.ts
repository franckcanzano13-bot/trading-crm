import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * No-op for SQLite mode. In production PostgreSQL mode, this would create a schema.
 */
export async function createTenantSchema(_tenantSlug: string): Promise<void> {
  // SQLite mode: all tables share one database, tenant isolation via tenant_id column
}
