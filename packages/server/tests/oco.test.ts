import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sprint 5.4 — OCO (One-Cancels-the-Other) sibling cancellation.
 *
 * Two PENDING orders share an `oco_group_id`. When one fills, the other
 * must be auto-cancelled. Verified by spying on the `prisma.order.updateMany`
 * call issued by the position monitor's `cancelOcoSiblings` helper.
 */

// Mock prisma BEFORE importing the position-monitor module so the import
// receives the mocked client.
const updateManyMock = vi.fn();
const createMock = vi.fn();
vi.mock('../src/shared/database/prisma', () => ({
  prisma: {
    order: {
      updateMany: (...args: any[]) => updateManyMock(...args),
      create: (...args: any[]) => createMock(...args),
    },
    $transaction: vi.fn(),
  },
  createTenantSchema: vi.fn(),
}));

// Mock price-store since position-monitor imports it.
vi.mock('../src/modules/pricing/price-store', () => ({
  getCurrentPrice: () => ({ symbol: '', bid: 0, ask: 0 }),
  getPriceMap: () => new Map(),
}));

describe('Sprint 5.4 — OCO sibling cancellation', () => {
  beforeEach(() => {
    updateManyMock.mockReset();
  });

  it('cancels the sibling order when the primary fills', async () => {
    updateManyMock.mockResolvedValueOnce({ count: 1 });
    const { cancelOcoSiblings } = await import('../src/modules/trading/position-monitor');

    const cancelled = await cancelOcoSiblings('group-abc', 'order-primary');

    expect(cancelled).toBe(1);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const [args] = updateManyMock.mock.calls[0];
    expect(args).toMatchObject({
      where: {
        oco_group_id: 'group-abc',
        status: 'PENDING',
        NOT: { id: 'order-primary' },
      },
      data: { status: 'CANCELLED', filled_at: null },
    });
  });

  it('cancels the sibling order when the secondary fills (symmetric)', async () => {
    updateManyMock.mockResolvedValueOnce({ count: 1 });
    const { cancelOcoSiblings } = await import('../src/modules/trading/position-monitor');

    const cancelled = await cancelOcoSiblings('group-xyz', 'order-secondary');

    expect(cancelled).toBe(1);
    const [args] = updateManyMock.mock.calls[0];
    expect(args.where.NOT.id).toBe('order-secondary');
    expect(args.where.oco_group_id).toBe('group-xyz');
    expect(args.data.status).toBe('CANCELLED');
  });

  it('is a no-op when no oco_group_id is provided', async () => {
    const { cancelOcoSiblings } = await import('../src/modules/trading/position-monitor');
    const cancelled = await cancelOcoSiblings('', 'order-x');
    expect(cancelled).toBe(0);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('returns 0 cancellations when the sibling is already filled or cancelled', async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 });
    const { cancelOcoSiblings } = await import('../src/modules/trading/position-monitor');

    const cancelled = await cancelOcoSiblings('group-stale', 'order-primary');
    expect(cancelled).toBe(0);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
  });
});
