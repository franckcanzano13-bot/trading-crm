/**
 * Sprint 5.3 — Postgres advisory-lock based leader election.
 *
 * Workers compete for a named advisory lock. Whoever holds the lock is the
 * leader; if the leader dies (process crash, network split, etc.), Postgres
 * releases the session lock automatically and another worker takes over on
 * the next heartbeat.
 *
 * Usage:
 *   const leader = new LeaderLock('position-monitor');
 *   await leader.acquireOrWait();           // blocks until we are leader
 *   // ... do leader-only work, periodically check leader.isLeader() ...
 *   await leader.release();
 *
 * SQLite fallback: when running under SQLite (dev), the lock is a no-op —
 * the caller is always considered the leader. Only one worker should run
 * in dev anyway.
 */
import { prisma } from '../database/prisma';
import { logger } from '../utils/index';
import crypto from 'crypto';

const HEARTBEAT_MS = 5_000;

function lockKey(name: string): bigint {
  // Postgres advisory locks use a bigint key. Map a human name to a stable
  // 63-bit integer via SHA-256.
  const h = crypto.createHash('sha256').update(name).digest();
  // Take 8 bytes, force the sign bit to 0 to keep it positive.
  let n = 0n;
  for (let i = 0; i < 8; i++) {
    n = (n << 8n) | BigInt(h[i]);
  }
  return n & 0x7fffffffffffffffn;
}

function isPostgres(): boolean {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

export class LeaderLock {
  private name: string;
  private leader = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private released = false;

  constructor(name: string) {
    this.name = name;
  }

  isLeader(): boolean {
    return this.leader;
  }

  /** Try to acquire the lock once. Returns true on success. */
  async tryAcquire(): Promise<boolean> {
    if (!isPostgres()) {
      // Dev SQLite mode: assume single-process, always leader.
      this.leader = true;
      return true;
    }
    try {
      const key = lockKey(this.name);
      const rows = await prisma.$queryRawUnsafe<Array<{ pg_try_advisory_lock: boolean }>>(
        `SELECT pg_try_advisory_lock(${key.toString()}::bigint) AS pg_try_advisory_lock`,
      );
      const acquired = !!rows[0]?.pg_try_advisory_lock;
      this.leader = acquired;
      return acquired;
    } catch (err) {
      logger.error({ err, lock: this.name }, '[LeaderLock] tryAcquire failed');
      return false;
    }
  }

  /** Block (with backoff) until we become leader. */
  async acquireOrWait(intervalMs = 5_000): Promise<void> {
    while (!this.released) {
      if (await this.tryAcquire()) {
        logger.info({ lock: this.name }, '[LeaderLock] acquired leadership');
        this.startHeartbeat();
        return;
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  /**
   * Periodically verify the lock is still held. Postgres releases session-
   * scope advisory locks on disconnect, so the only failure mode is the
   * connection dropping under us — we re-try acquiring.
   */
  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(async () => {
      if (this.released) return;
      const stillLeader = await this.tryAcquire();
      // pg_try_advisory_lock is stackable: if we already hold it, calling again
      // just increments the count. We still treat success as "we're leader".
      if (!stillLeader) {
        logger.warn({ lock: this.name }, '[LeaderLock] lost leadership');
        this.leader = false;
      }
    }, HEARTBEAT_MS);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  async release(): Promise<void> {
    this.released = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const wasLeader = this.leader;
    this.leader = false;
    if (!isPostgres() || !wasLeader) return;
    try {
      const key = lockKey(this.name);
      await prisma.$queryRawUnsafe(
        `SELECT pg_advisory_unlock(${key.toString()}::bigint)`,
      );
      logger.info({ lock: this.name }, '[LeaderLock] released');
    } catch (err) {
      logger.error({ err, lock: this.name }, '[LeaderLock] release failed');
    }
  }
}
