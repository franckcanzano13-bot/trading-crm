import { describe, it, expect } from 'vitest';
import { prisma } from '../src/shared/database/prisma';

/**
 * Sprint 5.2 — audit_logs are append-only at the Prisma client level.
 *
 * The extended client throws on any update/delete/upsert against AuditLog.
 * This is defense-in-depth — Postgres role grants would be the production
 * complement.
 */
describe('Sprint 5.2 — audit_logs immutability', () => {
  it('rejects update', async () => {
    await expect((prisma.auditLog as any).update({ where: { id: 'x' }, data: {} }))
      .rejects.toThrow(/append-only.*UPDATE/);
  });
  it('rejects updateMany', async () => {
    await expect((prisma.auditLog as any).updateMany({ where: {}, data: {} }))
      .rejects.toThrow(/append-only.*UPDATE/);
  });
  it('rejects upsert', async () => {
    await expect((prisma.auditLog as any).upsert({ where: { id: 'x' }, create: {} as any, update: {} }))
      .rejects.toThrow(/append-only.*UPSERT/);
  });
  it('rejects delete', async () => {
    await expect((prisma.auditLog as any).delete({ where: { id: 'x' } }))
      .rejects.toThrow(/append-only.*DELETE/);
  });
  it('rejects deleteMany', async () => {
    await expect((prisma.auditLog as any).deleteMany({ where: {} }))
      .rejects.toThrow(/append-only.*DELETE/);
  });
});
