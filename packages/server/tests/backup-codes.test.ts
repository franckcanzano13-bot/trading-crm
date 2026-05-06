import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

/**
 * Sprint 5.1 — backup codes: generation, hashing, single-use consumption.
 */
describe('Sprint 5.1 — 2FA backup codes', () => {
  let totp: typeof import('../src/modules/totp/routes');
  let crypt: typeof import('../src/shared/crypto');

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    totp = await import('../src/modules/totp/routes');
    crypt = await import('../src/shared/crypto');
  });

  it('consumeBackupCode rejects when no codes stored', () => {
    const r = totp.consumeBackupCode('', 'AAAAA-BBBBB');
    expect(r.ok).toBe(false);
  });

  it('consumes a valid code and returns reduced encrypted blob', () => {
    const codes = ['ABCDE-FGHIJ', 'KLMNO-PQRST', 'UVWXY-Z1234'];
    const hashes = codes.map(c => crypt.sha256(c.replace(/[-]/g, '')));
    const stored = crypt.encrypt(JSON.stringify(hashes));

    const r = totp.consumeBackupCode(stored, 'KLMNO-PQRST');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.remainingCount).toBe(2);

    // Remaining blob should not validate the just-used code
    const r2 = totp.consumeBackupCode(r.remainingHashesEncrypted, 'KLMNO-PQRST');
    expect(r2.ok).toBe(false);

    // But should still validate the others
    const r3 = totp.consumeBackupCode(r.remainingHashesEncrypted, 'ABCDE-FGHIJ');
    expect(r3.ok).toBe(true);
  });

  it('rejects an unknown code', () => {
    const codes = ['ABCDE-FGHIJ'];
    const hashes = codes.map(c => crypt.sha256(c.replace(/[-]/g, '')));
    const stored = crypt.encrypt(JSON.stringify(hashes));
    const r = totp.consumeBackupCode(stored, 'NOPE1-NOPE2');
    expect(r.ok).toBe(false);
  });

  it('handles input with mixed case and whitespace', () => {
    const code = 'ABCDE-FGHIJ';
    const hashes = [crypt.sha256(code.replace(/[-]/g, ''))];
    const stored = crypt.encrypt(JSON.stringify(hashes));
    // Lowercase, spaces, no dash — all should still match
    const r = totp.consumeBackupCode(stored, ' abcde fghij ');
    expect(r.ok).toBe(true);
  });

  it('rejects malformed stored blob', () => {
    expect(totp.consumeBackupCode('not-encrypted', 'ABCDE-FGHIJ').ok).toBe(false);
  });
});
