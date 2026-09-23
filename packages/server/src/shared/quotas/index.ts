/**
 * Phase 1.3 — Plan quota enforcement.
 *
 * Plans (superadmin) carry max_users and max_instruments. Until now they were
 * stored and displayed but never applied. Rules:
 *
 *   - The tenant's plan is the ACTIVE or TRIAL subscription that has not
 *     ended (ends_at null or in the future; trial_ends_at likewise).
 *   - No such subscription → no quota (superadmin-managed sandboxes, demo
 *     tenants). Selling a plan is what switches limits on.
 *   - max_users counts users (traders) of the tenant. Enforced where users
 *     are created: /auth/register and CRM lead conversion.
 *   - max_instruments counts ACTIVE instruments. Enforced when an admin
 *     activates one. Deactivating is always allowed.
 *
 * Every refusal is audited as PLAN_LIMIT_HIT so the broker's account manager
 * sees upsell signals in the audit log.
 */
import { prisma } from '../database/prisma';
import { audit } from '../audit';

export interface PlanLimits {
  plan_id: string;
  plan_name: string;
  status: string;
  max_users: number;
  max_instruments: number;
}

export interface QuotaCheck {
  ok: boolean;
  limit: number | null;   // null = unlimited (no plan)
  current: number;
  plan: PlanLimits | null;
}

export async function getTenantPlanLimits(tenantId: string): Promise<PlanLimits | null> {
  const now = new Date();
  const sub = await prisma.subscription.findFirst({
    where: {
      tenant_id: tenantId,
      status: { in: ['ACTIVE', 'TRIAL'] },
      OR: [{ ends_at: null }, { ends_at: { gt: now } }],
    },
    orderBy: { created_at: 'desc' },
    include: { plan: true },
  });
  if (!sub) return null;
  if (sub.status === 'TRIAL' && sub.trial_ends_at && sub.trial_ends_at.getTime() < now.getTime()) return null;
  return {
    plan_id: sub.plan_id,
    plan_name: sub.plan.name,
    status: sub.status,
    max_users: sub.plan.max_users,
    max_instruments: sub.plan.max_instruments,
  };
}

export async function checkUserQuota(tenantId: string): Promise<QuotaCheck> {
  const plan = await getTenantPlanLimits(tenantId);
  const current = await prisma.user.count({ where: { tenant_id: tenantId } });
  if (!plan) return { ok: true, limit: null, current, plan: null };
  return { ok: current < plan.max_users, limit: plan.max_users, current, plan };
}

/** @param excludeInstrumentId the instrument being activated (not counted if already active). */
export async function checkInstrumentQuota(tenantId: string, excludeInstrumentId?: string): Promise<QuotaCheck> {
  const plan = await getTenantPlanLimits(tenantId);
  const current = await prisma.instrument.count({
    where: { tenant_id: tenantId, is_active: true, ...(excludeInstrumentId ? { id: { not: excludeInstrumentId } } : {}) },
  });
  if (!plan) return { ok: true, limit: null, current, plan: null };
  return { ok: current < plan.max_instruments, limit: plan.max_instruments, current, plan };
}

/** Usage block for the broker dashboard. */
export async function getTenantPlanUsage(tenantId: string) {
  const plan = await getTenantPlanLimits(tenantId);
  const [users, activeInstruments] = await Promise.all([
    prisma.user.count({ where: { tenant_id: tenantId } }),
    prisma.instrument.count({ where: { tenant_id: tenantId, is_active: true } }),
  ]);
  return {
    plan: plan ? { id: plan.plan_id, name: plan.plan_name, status: plan.status } : null,
    users: { current: users, max: plan?.max_users ?? null },
    instruments: { current: activeInstruments, max: plan?.max_instruments ?? null },
  };
}

export async function auditQuotaHit(params: { tenantId: string; kind: 'users' | 'instruments'; check: QuotaCheck; actorId?: string; actorType?: 'admin' | 'trader' | 'system'; ip?: string }) {
  await audit.log({
    tenantId: params.tenantId,
    actorId: params.actorId || 'system',
    actorType: params.actorType || 'system',
    action: 'PLAN_LIMIT_HIT',
    target: `tenant:${params.tenantId}`,
    details: { kind: params.kind, limit: params.check.limit, current: params.check.current, plan: params.check.plan?.plan_name },
    ip: params.ip,
  });
}

export const quotaMessages = {
  users: (c: QuotaCheck) => `This broker has reached the maximum number of client accounts allowed by its plan (${c.current}/${c.limit}).`,
  instruments: (c: QuotaCheck) => `Your plan allows ${c.limit} active instruments (${c.current} active). Deactivate one or upgrade the plan.`,
};
