/**
 * Sprint 2.8 — TOTP 2FA routes for tenant admins (admin / dealer / seller / retention).
 *
 * Routes (all require an authenticated admin JWT):
 *   POST /api/v1/admin/2fa/setup    → generate fresh secret + QR code data URI
 *   POST /api/v1/admin/2fa/verify   → verify a 6-digit code, flips totp_enabled = true
 *   POST /api/v1/admin/2fa/disable  → verify current code, clears secret + flag
 *   GET  /api/v1/admin/2fa/status   → { enabled: boolean }
 *
 * Secret storage:
 *   The base32 secret is encrypted at rest via shared/crypto.encrypt() (AES-256-GCM).
 *   The plaintext secret is ONLY returned once, in the /setup response.
 *
 * Auditing:
 *   2FA_SETUP_INITIATED, 2FA_ENABLED, 2FA_DISABLED.
 *   LOGIN_2FA_FAILED is emitted from the login route (users/routes.ts).
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { requireAdmin } from '../../shared/middleware/auth';
import { prisma } from '../../shared/database/prisma';
import { encrypt, decrypt, sha256 } from '../../shared/crypto';
import { audit, AuditActorType } from '../../shared/audit';

// Sprint 5.1: backup codes — 8 single-use 10-char alphanumeric codes
function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Crockford alphabet (no confusing 0/O/1/I) split with a dash for readability
    const raw = crypto.randomBytes(8).toString('base64').replace(/[+/=]/g, '').slice(0, 10).toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Returns true if a normalized incoming code matches any stored hash; consumes that hash. */
export function consumeBackupCode(storedHashesEncrypted: string, incomingCode: string):
  | { ok: false }
  | { ok: true; remainingHashesEncrypted: string; remainingCount: number } {
  if (!storedHashesEncrypted) return { ok: false };
  let hashes: string[];
  try {
    const decrypted = decrypt(storedHashesEncrypted);
    if (!decrypted) return { ok: false };
    hashes = JSON.parse(decrypted);
    if (!Array.isArray(hashes)) return { ok: false };
  } catch {
    return { ok: false };
  }
  const normalized = incomingCode.replace(/[-\s]/g, '').toUpperCase();
  const incomingHash = sha256(normalized);
  const idx = hashes.indexOf(incomingHash);
  if (idx === -1) return { ok: false };
  hashes.splice(idx, 1);
  return {
    ok: true,
    remainingHashesEncrypted: encrypt(JSON.stringify(hashes)),
    remainingCount: hashes.length,
  };
}

const VerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

const ISSUER = 'TradeXLabel';

export async function totpRoutes(fastify: FastifyInstance) {
  // ─── POST /api/v1/admin/2fa/setup ──────────────────────────────────────────
  // Generate a fresh secret. Stores the encrypted secret on the admin row but
  // keeps totp_enabled = false until /verify is called with a valid code.
  fastify.post('/api/v1/admin/2fa/setup', { preHandler: [requireAdmin] }, async (request, reply) => {
    const adminId = request.userData!.sub;

    const admin = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
    if (!admin) {
      return reply.status(404).send({ error: 'Admin not found', code: 'ADMIN_NOT_FOUND' });
    }
    if (admin.totp_enabled) {
      return reply.status(400).send({
        error: '2FA is already enabled. Disable it first to re-enroll.',
        code: '2FA_ALREADY_ENABLED',
      });
    }

    // Generate base32 secret (otplib produces RFC 4226 / 6238 compliant secrets)
    const secret = authenticator.generateSecret();

    // Build the otpauth URL used by Google Authenticator / Authy / 1Password.
    const label = `${ISSUER}:${admin.email}`;
    const otpauthUrl =
      `otpauth://totp/${encodeURIComponent(label)}` +
      `?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}`;

    // QR code as data URI (PNG)
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    // Persist the secret encrypted. totp_enabled stays false.
    await prisma.tenantAdmin.update({
      where: { id: admin.id },
      data: { totp_secret: encrypt(secret), totp_enabled: false },
    });

    await audit.log({
      tenantId: admin.tenant_id,
      actorId: admin.id,
      actorType: (admin.role as AuditActorType) || 'admin',
      action: '2FA_SETUP_INITIATED',
      target: `tenant_admin:${admin.id}`,
      details: { email: admin.email },
      ip: request.ip,
    });

    return reply.send({
      data: {
        secret,            // one-time exposure for manual entry
        qr_code_url: qrCodeUrl,
        otpauth_url: otpauthUrl,
      },
    });
  });

  // ─── POST /api/v1/admin/2fa/verify ─────────────────────────────────────────
  // Verifies a code against the (still-pending) stored secret. On success,
  // flips totp_enabled = true.
  fastify.post('/api/v1/admin/2fa/verify', { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = VerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }

    const adminId = request.userData!.sub;
    const admin = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
    if (!admin) {
      return reply.status(404).send({ error: 'Admin not found', code: 'ADMIN_NOT_FOUND' });
    }
    if (!admin.totp_secret) {
      return reply.status(400).send({
        error: '2FA setup has not been initiated',
        code: '2FA_NOT_INITIATED',
      });
    }

    const secret = decrypt(admin.totp_secret);
    if (!secret) {
      return reply.status(500).send({ error: 'Failed to decrypt secret', code: 'CRYPTO_ERROR' });
    }

    const ok = authenticator.verify({ token: parsed.data.code, secret });
    if (!ok) {
      return reply.status(401).send({ error: 'Invalid code', code: 'INVALID_2FA_CODE' });
    }

    // Already enabled? Idempotent success — but don't regenerate backup codes.
    let backupCodes: string[] | undefined;
    if (!admin.totp_enabled) {
      // Sprint 5.1: generate 8 single-use backup codes on first activation.
      // Store SHA-256 hashes (encrypted) — never plaintext.
      backupCodes = generateBackupCodes(8);
      const hashes = backupCodes.map(c => sha256(c.replace(/[-\s]/g, '')));
      const encryptedHashes = encrypt(JSON.stringify(hashes));

      await prisma.tenantAdmin.update({
        where: { id: admin.id },
        data: { totp_enabled: true, totp_backup_codes: encryptedHashes },
      });

      await audit.log({
        tenantId: admin.tenant_id,
        actorId: admin.id,
        actorType: (admin.role as AuditActorType) || 'admin',
        action: '2FA_ENABLED',
        target: `tenant_admin:${admin.id}`,
        details: { email: admin.email, backup_codes_count: backupCodes.length },
        ip: request.ip,
      });
    }

    // Sprint 5.1: return the backup codes ONCE — admin must save them now.
    return reply.send({
      data: {
        enabled: true,
        backup_codes: backupCodes,
        backup_codes_warning: backupCodes
          ? 'Save these codes in a safe place. Each can be used once if you lose your authenticator. They will not be shown again.'
          : undefined,
      },
    });
  });

  // ─── POST /api/v1/admin/2fa/regenerate-backup-codes ──────────────────────
  // Replaces all backup codes with a fresh set. Requires a valid TOTP code
  // (not a backup code) to prevent locked-out attackers from rotating them.
  fastify.post('/api/v1/admin/2fa/regenerate-backup-codes', { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = VerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const adminId = request.userData!.sub;
    const admin = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.totp_enabled || !admin.totp_secret) {
      return reply.status(400).send({ error: '2FA not enabled', code: '2FA_NOT_ENABLED' });
    }
    const secret = decrypt(admin.totp_secret);
    if (!secret || !authenticator.verify({ token: parsed.data.code, secret })) {
      return reply.status(401).send({ error: 'Invalid code', code: 'INVALID_2FA_CODE' });
    }

    const backupCodes = generateBackupCodes(8);
    const hashes = backupCodes.map(c => sha256(c.replace(/[-\s]/g, '')));
    await prisma.tenantAdmin.update({
      where: { id: admin.id },
      data: { totp_backup_codes: encrypt(JSON.stringify(hashes)) },
    });

    await audit.log({
      tenantId: admin.tenant_id, actorId: admin.id, actorType: (admin.role as 'superadmin' | 'admin' | 'dealer' | 'seller' | 'retention' | 'trader' | 'system') || 'admin',
      action: '2FA_BACKUP_CODES_REGENERATED', target: `tenant_admin:${admin.id}`,
      details: { email: admin.email }, ip: request.ip,
    });

    return reply.send({ data: { backup_codes: backupCodes, count: backupCodes.length } });
  });

  // ─── POST /api/v1/admin/2fa/disable ────────────────────────────────────────
  // Requires a valid current code so a stolen session alone cannot disable 2FA.
  fastify.post('/api/v1/admin/2fa/disable', { preHandler: [requireAdmin] }, async (request, reply) => {
    const parsed = VerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }

    const adminId = request.userData!.sub;
    const admin = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
    if (!admin) {
      return reply.status(404).send({ error: 'Admin not found', code: 'ADMIN_NOT_FOUND' });
    }
    if (!admin.totp_enabled || !admin.totp_secret) {
      return reply.status(400).send({ error: '2FA is not enabled', code: '2FA_NOT_ENABLED' });
    }

    const secret = decrypt(admin.totp_secret);
    if (!secret) {
      return reply.status(500).send({ error: 'Failed to decrypt secret', code: 'CRYPTO_ERROR' });
    }

    const ok = authenticator.verify({ token: parsed.data.code, secret });
    if (!ok) {
      return reply.status(401).send({ error: 'Invalid code', code: 'INVALID_2FA_CODE' });
    }

    await prisma.tenantAdmin.update({
      where: { id: admin.id },
      data: { totp_secret: '', totp_enabled: false },
    });

    await audit.log({
      tenantId: admin.tenant_id,
      actorId: admin.id,
      actorType: (admin.role as AuditActorType) || 'admin',
      action: '2FA_DISABLED',
      target: `tenant_admin:${admin.id}`,
      details: { email: admin.email },
      ip: request.ip,
    });

    return reply.send({ data: { enabled: false } });
  });

  // ─── GET /api/v1/admin/2fa/status ──────────────────────────────────────────
  fastify.get('/api/v1/admin/2fa/status', { preHandler: [requireAdmin] }, async (request, reply) => {
    const adminId = request.userData!.sub;
    const admin = await prisma.tenantAdmin.findUnique({
      where: { id: adminId },
      select: { totp_enabled: true },
    });
    if (!admin) {
      return reply.status(404).send({ error: 'Admin not found', code: 'ADMIN_NOT_FOUND' });
    }
    return reply.send({ data: { enabled: admin.totp_enabled } });
  });
}
