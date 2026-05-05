/**
 * Sprint 2.3 — Audit logging helper.
 *
 * Writes a row to audit_logs for every financially-sensitive action.
 * Required by MiFID II / ESMA. Failures must NOT block the main operation,
 * so all writes are best-effort and errors are logged but swallowed.
 *
 * Usage:
 *   import { audit } from '@/shared/audit';
 *   await audit.log({
 *     tenantId, actorId, actorType: 'admin',
 *     action: 'DEPOSIT', target: `account:${accountId}`,
 *     details: { amount_cents: 100000, before: 50000, after: 150000 },
 *     ip: request.ip,
 *   });
 */
import { prisma } from '../database/prisma';
import { logger } from '../utils/index';

export type AuditActorType = 'superadmin' | 'admin' | 'dealer' | 'seller' | 'retention' | 'trader' | 'system';

export interface AuditEntry {
  tenantId?: string;        // empty for superadmin/system
  actorId: string;          // 'system' if no human actor
  actorType: AuditActorType;
  action: string;           // verb-noun, uppercase: DEPOSIT, WITHDRAW, KYC_APPROVE, etc.
  target?: string;          // e.g. "user:uuid", "trade:uuid"
  details?: Record<string, any>;
  ip?: string;
}

export const audit = {
  async log(entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          tenant_id: entry.tenantId || '',
          actor_id: entry.actorId,
          actor_type: entry.actorType,
          action: entry.action,
          target: entry.target || '',
          details: JSON.stringify(entry.details || {}, (_, v) =>
            typeof v === 'bigint' ? v.toString() : v
          ),
          ip_address: entry.ip || '',
        },
      });
    } catch (err) {
      // Best-effort — never block the caller
      logger.error({ err, entry }, '[Audit] failed to write audit log');
    }
  },
};
