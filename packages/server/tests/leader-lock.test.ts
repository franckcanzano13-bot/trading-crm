import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LeaderLock } from '../src/shared/leader';

/**
 * Sprint 5.3 — leader election unit test.
 *
 * The full Postgres-backed test would require a running PG (CI does this).
 * Here we validate the SQLite fallback behavior and the API surface.
 */
describe('Sprint 5.3 — LeaderLock', () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    // Force SQLite-fallback mode
    process.env.DATABASE_URL = 'file:./test.db';
  });

  afterAll(() => {
    if (originalUrl) process.env.DATABASE_URL = originalUrl;
  });

  it('starts non-leader before tryAcquire', () => {
    const lock = new LeaderLock('test-lock');
    expect(lock.isLeader()).toBe(false);
  });

  it('SQLite fallback: tryAcquire always succeeds', async () => {
    const lock = new LeaderLock('test-lock');
    expect(await lock.tryAcquire()).toBe(true);
    expect(lock.isLeader()).toBe(true);
    await lock.release();
  });

  it('release flips leader state', async () => {
    const lock = new LeaderLock('test-lock');
    await lock.tryAcquire();
    expect(lock.isLeader()).toBe(true);
    await lock.release();
    expect(lock.isLeader()).toBe(false);
  });

  it('acquireOrWait returns immediately when SQLite fallback', async () => {
    const lock = new LeaderLock('test-acquire');
    const start = Date.now();
    await lock.acquireOrWait(100);
    expect(Date.now() - start).toBeLessThan(500);
    expect(lock.isLeader()).toBe(true);
    await lock.release();
  });
});
