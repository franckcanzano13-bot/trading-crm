/**
 * Sprint 2.4 — AES-256-GCM encryption helper for sensitive DB columns.
 *
 * Use cases:
 *   - BrokerConfig.smtp_pass
 *   - Affiliate.api_key
 *
 * Format on disk:  "v1:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>"
 *
 * Key:  ENCRYPTION_KEY env var = 32 raw bytes encoded as 64-char hex.
 *       Generate with:  openssl rand -hex 32
 *
 * Backward-compat: if a value doesn't have the "v1:" prefix, decrypt() returns
 * it as-is. This means existing plaintext rows keep working until rotated.
 */
import crypto from 'crypto';
import { logger } from '../utils/index';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const VERSION = 'v1';

function getKey(): Buffer | null {
  const hex = (process.env.ENCRYPTION_KEY || '').trim();
  if (!hex) return null;
  if (hex.length !== 64) {
    logger.error({ keyLength: hex.length }, '[crypto] ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
    return null;
  }
  try {
    return Buffer.from(hex, 'hex');
  } catch {
    return null;
  }
}

let warnedNoKey = false;

export function encrypt(plaintext: string): string {
  if (plaintext === '' || plaintext == null) return '';
  const key = getKey();
  if (!key) {
    if (!warnedNoKey) {
      logger.warn('[crypto] ENCRYPTION_KEY not set — secrets stored as plaintext (dev only)');
      warnedNoKey = true;
    }
    return plaintext; // dev fallback
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(stored: string): string {
  if (!stored) return '';
  // Backward-compat: legacy plaintext (no version prefix)
  if (!stored.startsWith(`${VERSION}:`)) return stored;

  const key = getKey();
  if (!key) {
    logger.error('[crypto] cannot decrypt: ENCRYPTION_KEY not set but value is encrypted');
    return '';
  }

  const parts = stored.split(':');
  if (parts.length !== 4) {
    logger.error('[crypto] malformed ciphertext');
    return '';
  }
  const [, ivHex, tagHex, dataHex] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    logger.error({ err }, '[crypto] decrypt failed (wrong key or tampered ciphertext)');
    return '';
  }
}

/** Detect whether a value is already in encrypted form. */
export function isEncrypted(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith(`${VERSION}:`);
}

/**
 * SHA-256 hash. Used for API keys: store the hash, compare incoming-hash
 * against stored hash. Never store the plaintext API key.
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}
