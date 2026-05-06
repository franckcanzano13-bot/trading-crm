/**
 * Sprint 7.6 — Client funds segregation ledger writes.
 *
 * Every movement of client money also writes a `client_funds_ledger` row
 * (or pair of rows for movements that cross the CLIENT_TRUST /
 * BROKER_OPERATING boundary). The writes happen INSIDE the same
 * `prisma.$transaction` that already wraps the financial operation, so
 * the ledger and the account update either both succeed or both roll back.
 *
 * Use the helpers via the `tx` Prisma transactional client passed into
 * the `$transaction(async (tx) => ...)` callback.
 *
 *   recordDeposit(tx, ...)         — +client trust
 *   recordWithdrawal(tx, ...)      — -client trust
 *   recordTradePnl(tx, ...)        — paired entries between pools
 *
 * Reading: `getPoolBalances(tenantId)` returns the running sums per pool,
 * suitable for the GET /api/v1/admin/reports/segregation endpoint.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

export const CLIENT_TRUST = 'CLIENT_TRUST' as const;
export const BROKER_OPERATING = 'BROKER_OPERATING' as const;
export type Pool = typeof CLIENT_TRUST | typeof BROKER_OPERATING;

type TxClient = Prisma.TransactionClient;

interface DepositArgs {
  tenantId: string;
  accountId: string;
  amountCents: bigint;     // positive
  reference: string;       // e.g. `transaction:${id}`
  description?: string;
}

/** Client deposits cash → +CLIENT_TRUST. No broker leg. */
export async function recordDeposit(tx: TxClient, args: DepositArgs): Promise<void> {
  if (args.amountCents <= 0n) {
    throw new Error('recordDeposit: amount_cents must be positive');
  }
  await tx.clientFundsLedger.create({
    data: {
      tenant_id: args.tenantId,
      account_id: args.accountId,
      pool: CLIENT_TRUST,
      amount_cents: args.amountCents,
      kind: 'DEPOSIT',
      reference: args.reference,
      description: args.description ?? '',
    },
  });
}

/** Client withdraws cash → -CLIENT_TRUST. No broker leg. */
export async function recordWithdrawal(tx: TxClient, args: DepositArgs): Promise<void> {
  if (args.amountCents <= 0n) {
    throw new Error('recordWithdrawal: amount_cents must be positive');
  }
  await tx.clientFundsLedger.create({
    data: {
      tenant_id: args.tenantId,
      account_id: args.accountId,
      pool: CLIENT_TRUST,
      amount_cents: -args.amountCents,
      kind: 'WITHDRAWAL',
      reference: args.reference,
      description: args.description ?? '',
    },
  });
}

interface TradePnlArgs {
  tenantId: string;
  accountId: string;
  /**
   * Trade P&L in cents from the CLIENT's perspective.
   * Positive = client won (broker paid the client).
   * Negative = client lost (broker kept the difference).
   * Zero = no movement; helper short-circuits.
   */
  pnlCents: bigint;
  /** e.g. `trade:${id}` */
  reference: string;
  description?: string;
}

/**
 * Trade close — movement crosses the segregation boundary.
 *
 * Client wins $100 (pnl=+100):  +100 CLIENT_TRUST,  -100 BROKER_OPERATING
 * Client loses $100 (pnl=-100): -100 CLIENT_TRUST,  +100 BROKER_OPERATING
 * Two ledger rows; sum across both pools is always zero (conservation).
 */
export async function recordTradePnl(tx: TxClient, args: TradePnlArgs): Promise<void> {
  if (args.pnlCents === 0n) return;
  const baseFields = {
    tenant_id: args.tenantId,
    account_id: args.accountId,
    kind: 'TRADE_PNL',
    reference: args.reference,
    description: args.description ?? '',
  };
  await tx.clientFundsLedger.createMany({
    data: [
      { ...baseFields, pool: CLIENT_TRUST,     amount_cents: args.pnlCents },
      { ...baseFields, pool: BROKER_OPERATING, amount_cents: -args.pnlCents },
    ],
  });
}

export interface PoolBalances {
  client_trust_cents: bigint;
  broker_operating_cents: bigint;
  /** sum of user account balances for the tenant — should match client_trust_cents */
  account_balance_total_cents: bigint;
  /** drift = client_trust_cents - account_balance_total_cents; non-zero is a red flag */
  drift_cents: bigint;
}

/** Aggregate balances per pool for a tenant + drift check vs sum(account.balance). */
export async function getPoolBalances(tenantId: string): Promise<PoolBalances> {
  const [trustAgg, brokerAgg, accountAgg] = await Promise.all([
    prisma.clientFundsLedger.aggregate({
      where: { tenant_id: tenantId, pool: CLIENT_TRUST },
      _sum: { amount_cents: true },
    }),
    prisma.clientFundsLedger.aggregate({
      where: { tenant_id: tenantId, pool: BROKER_OPERATING },
      _sum: { amount_cents: true },
    }),
    prisma.account.aggregate({
      where: { tenant_id: tenantId },
      _sum: { balance: true },
    }),
  ]);
  const trust = trustAgg._sum.amount_cents ?? 0n;
  const broker = brokerAgg._sum.amount_cents ?? 0n;
  const accounts = accountAgg._sum.balance ?? 0n;
  return {
    client_trust_cents: trust,
    broker_operating_cents: broker,
    account_balance_total_cents: accounts,
    drift_cents: trust - accounts,
  };
}
