import { describe, it, expect, vi } from 'vitest';
import {
  recordDeposit,
  recordWithdrawal,
  recordTradePnl,
  CLIENT_TRUST,
  BROKER_OPERATING,
} from '../src/shared/segregation';

/**
 * Sprint 7.6 — Segregation ledger contract.
 *
 * The helper functions are pure orchestration over Prisma; the integration
 * test that exercises a full $transaction lives elsewhere (CI runs against
 * Postgres). Here we lock down the SHAPE of what gets written so a future
 * "hey just refactor this" change can't accidentally break the regulatory
 * invariant: trade-pnl writes paired entries that net to zero.
 */
function makeMockTx() {
  const create = vi.fn(async () => undefined);
  const createMany = vi.fn(async () => ({ count: 0 }));
  return {
    tx: { clientFundsLedger: { create, createMany } },
    create,
    createMany,
  };
}

describe('Sprint 7.6 — segregation ledger writes', () => {
  it('deposit writes a single +CLIENT_TRUST row', async () => {
    const { tx, create } = makeMockTx();
    await recordDeposit(tx as never, {
      tenantId: 't', accountId: 'a', amountCents: 12345n,
      reference: 'transaction:1', description: 'Test deposit',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      tenant_id: 't', account_id: 'a', pool: CLIENT_TRUST,
      amount_cents: 12345n, kind: 'DEPOSIT',
    });
  });

  it('deposit rejects zero or negative amount', async () => {
    const { tx } = makeMockTx();
    await expect(recordDeposit(tx as never, {
      tenantId: 't', accountId: 'a', amountCents: 0n, reference: '',
    })).rejects.toThrow(/positive/);
    await expect(recordDeposit(tx as never, {
      tenantId: 't', accountId: 'a', amountCents: -1n, reference: '',
    })).rejects.toThrow(/positive/);
  });

  it('withdrawal writes a single -CLIENT_TRUST row', async () => {
    const { tx, create } = makeMockTx();
    await recordWithdrawal(tx as never, {
      tenantId: 't', accountId: 'a', amountCents: 500n, reference: 'transaction:2',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      pool: CLIENT_TRUST, amount_cents: -500n, kind: 'WITHDRAWAL',
    });
  });

  it('trade pnl > 0 (client wins) writes paired +CLIENT_TRUST / -BROKER_OPERATING', async () => {
    const { tx, createMany } = makeMockTx();
    await recordTradePnl(tx as never, {
      tenantId: 't', accountId: 'a', pnlCents: 100n, reference: 'trade:x',
    });
    expect(createMany).toHaveBeenCalledTimes(1);
    const rows = createMany.mock.calls[0][0].data as Array<{ pool: string; amount_cents: bigint }>;
    expect(rows).toHaveLength(2);
    const trust = rows.find(r => r.pool === CLIENT_TRUST)!;
    const broker = rows.find(r => r.pool === BROKER_OPERATING)!;
    expect(trust.amount_cents).toBe(100n);
    expect(broker.amount_cents).toBe(-100n);
    // Conservation: pool entries must net to zero.
    expect(trust.amount_cents + broker.amount_cents).toBe(0n);
  });

  it('trade pnl < 0 (client loses) writes -CLIENT_TRUST / +BROKER_OPERATING', async () => {
    const { tx, createMany } = makeMockTx();
    await recordTradePnl(tx as never, {
      tenantId: 't', accountId: 'a', pnlCents: -250n, reference: 'trade:y',
    });
    const rows = createMany.mock.calls[0][0].data as Array<{ pool: string; amount_cents: bigint }>;
    const trust = rows.find(r => r.pool === CLIENT_TRUST)!;
    const broker = rows.find(r => r.pool === BROKER_OPERATING)!;
    expect(trust.amount_cents).toBe(-250n);
    expect(broker.amount_cents).toBe(250n);
    expect(trust.amount_cents + broker.amount_cents).toBe(0n);
  });

  it('trade pnl == 0 short-circuits (no rows written)', async () => {
    const { tx, create, createMany } = makeMockTx();
    await recordTradePnl(tx as never, {
      tenantId: 't', accountId: 'a', pnlCents: 0n, reference: 'trade:z',
    });
    expect(create).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('reference and description propagate to all rows', async () => {
    const { tx, createMany } = makeMockTx();
    await recordTradePnl(tx as never, {
      tenantId: 't1', accountId: 'a1',
      pnlCents: 7n,
      reference: 'trade:abc', description: 'EURUSD close',
    });
    const rows = createMany.mock.calls[0][0].data as Array<{ tenant_id: string; account_id: string; reference: string; description: string }>;
    for (const r of rows) {
      expect(r.tenant_id).toBe('t1');
      expect(r.account_id).toBe('a1');
      expect(r.reference).toBe('trade:abc');
      expect(r.description).toBe('EURUSD close');
    }
  });
});
