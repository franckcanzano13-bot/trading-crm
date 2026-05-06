import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';

/**
 * Sprint 2.4 — encrypt / decrypt round-trips and backward-compat.
 *
 * The crypto module reads ENCRYPTION_KEY at first use. We set it before
 * importing to ensure a clean test.
 */
describe('AES-256-GCM helper (Sprint 2.4)', () => {
  let mod: typeof import('../src/shared/crypto/index');

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    mod = await import('../src/shared/crypto/index');
  });

  it('encrypts then decrypts to the same plaintext', () => {
    const plain = 'super-secret-smtp-password-123!';
    const enc = mod.encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(mod.decrypt(enc)).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = mod.encrypt('secret');
    const b = mod.encrypt('secret');
    expect(a).not.toBe(b);
    expect(mod.decrypt(a)).toBe('secret');
    expect(mod.decrypt(b)).toBe('secret');
  });

  it('returns empty string for empty input', () => {
    expect(mod.encrypt('')).toBe('');
    expect(mod.decrypt('')).toBe('');
  });

  it('passes through legacy plaintext (no v1: prefix) for backward-compat', () => {
    expect(mod.decrypt('legacy-plaintext-secret')).toBe('legacy-plaintext-secret');
  });

  it('isEncrypted detects v1 ciphertext', () => {
    const enc = mod.encrypt('foo');
    expect(mod.isEncrypted(enc)).toBe(true);
    expect(mod.isEncrypted('plain')).toBe(false);
    expect(mod.isEncrypted('')).toBe(false);
  });

  it('returns empty string when ciphertext is tampered', () => {
    const enc = mod.encrypt('hello');
    // Flip one byte in the ciphertext part
    const parts = enc.split(':');
    const data = parts[3];
    const tampered = data[0] === 'a' ? `b${data.slice(1)}` : `a${data.slice(1)}`;
    parts[3] = tampered;
    expect(mod.decrypt(parts.join(':'))).toBe('');
  });

  // Sprint 4.2: production fail-fast
  describe('assertProductionKey', () => {
    it('passes silently in development without key', () => {
      const oldEnv = process.env.NODE_ENV;
      const oldKey = process.env.ENCRYPTION_KEY;
      process.env.NODE_ENV = 'development';
      delete process.env.ENCRYPTION_KEY;
      expect(() => mod.assertProductionKey()).not.toThrow();
      process.env.NODE_ENV = oldEnv;
      if (oldKey) process.env.ENCRYPTION_KEY = oldKey;
    });

    it('throws in production when key missing', () => {
      const oldEnv = process.env.NODE_ENV;
      const oldKey = process.env.ENCRYPTION_KEY;
      process.env.NODE_ENV = 'production';
      delete process.env.ENCRYPTION_KEY;
      expect(() => mod.assertProductionKey()).toThrow(/ENCRYPTION_KEY required/);
      process.env.NODE_ENV = oldEnv;
      if (oldKey) process.env.ENCRYPTION_KEY = oldKey;
    });

    it('throws in production when key has wrong length', () => {
      const oldEnv = process.env.NODE_ENV;
      const oldKey = process.env.ENCRYPTION_KEY;
      process.env.NODE_ENV = 'production';
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => mod.assertProductionKey()).toThrow(/64 hex chars/);
      process.env.NODE_ENV = oldEnv;
      if (oldKey) process.env.ENCRYPTION_KEY = oldKey;
    });

    it('encrypt() throws in production without key', () => {
      const oldEnv = process.env.NODE_ENV;
      const oldKey = process.env.ENCRYPTION_KEY;
      process.env.NODE_ENV = 'production';
      delete process.env.ENCRYPTION_KEY;
      expect(() => mod.encrypt('secret')).toThrow();
      process.env.NODE_ENV = oldEnv;
      if (oldKey) process.env.ENCRYPTION_KEY = oldKey;
    });
  });
});
