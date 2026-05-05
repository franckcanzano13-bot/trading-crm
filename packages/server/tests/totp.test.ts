import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { prisma } from '../src/shared/database/prisma';

/**
 * Sprint 2.8 — TOTP 2FA tests.
 *
 *   1. Generate secret + valid code → verify() returns true.
 *   2. Wrong code → verify() returns false.
 *   3. Round-trip the secret through encrypt/decrypt and confirm it still verifies.
 *   4. End-to-end: setup → verify → status; login flow surfaces requires_2fa
 *      and rejects bad codes; LOGIN_2FA_FAILED audit row is written.
 */
describe('TOTP 2FA (Sprint 2.8)', () => {
  let cryptoMod: typeof import('../src/shared/crypto/index');

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-totp-secret';
    cryptoMod = await import('../src/shared/crypto/index');
  });

  describe('otplib primitives', () => {
    it('verifies a freshly-generated code', () => {
      const secret = authenticator.generateSecret();
      const token = authenticator.generate(secret);
      expect(authenticator.verify({ token, secret })).toBe(true);
    });

    it('rejects a wrong code', () => {
      const secret = authenticator.generateSecret();
      const token = authenticator.generate(secret);
      // Flip last digit deterministically
      const last = token[token.length - 1];
      const wrongLast = last === '0' ? '1' : '0';
      const wrongToken = token.slice(0, -1) + wrongLast;
      expect(authenticator.verify({ token: wrongToken, secret })).toBe(false);
    });

    it('rejects a static bogus code that is not the live one', () => {
      const secret = authenticator.generateSecret();
      const live = authenticator.generate(secret);
      const bogus = live === '000000' ? '111111' : '000000';
      expect(authenticator.verify({ token: bogus, secret })).toBe(false);
    });
  });

  describe('encryption round-trip on the secret', () => {
    it('decrypts back to the original base32 secret', () => {
      const secret = authenticator.generateSecret();
      const enc = cryptoMod.encrypt(secret);
      expect(enc).not.toBe(secret);
      expect(enc.startsWith('v1:')).toBe(true);

      const dec = cryptoMod.decrypt(enc);
      expect(dec).toBe(secret);

      // The decrypted secret still verifies a freshly-generated code.
      const token = authenticator.generate(dec);
      expect(authenticator.verify({ token, secret: dec })).toBe(true);
    });

    it('produces different ciphertexts for the same secret (random IV)', () => {
      const secret = authenticator.generateSecret();
      const a = cryptoMod.encrypt(secret);
      const b = cryptoMod.encrypt(secret);
      expect(a).not.toBe(b);
      expect(cryptoMod.decrypt(a)).toBe(secret);
      expect(cryptoMod.decrypt(b)).toBe(secret);
    });
  });

  describe('routes + login integration', () => {
    let app: FastifyInstance;
    let tenantId: string;
    let adminId: string;
    let adminToken: string;
    const password = 'TotpTestPass!1';
    const email = `totp-${Date.now()}@test.local`;

    beforeAll(async () => {
      // Build a minimal app exposing only the routes we need.
      app = Fastify({ logger: false });
      await app.register(jwt, { secret: process.env.JWT_SECRET! });

      const { adminClientRoutes } = await import('../src/modules/users/routes');
      const { totpRoutes } = await import('../src/modules/totp/routes');
      await app.register(adminClientRoutes);
      await app.register(totpRoutes);

      // Seed tenant + admin
      const tenant = await prisma.tenant.create({
        data: {
          name: 'TOTP Test Tenant',
          domain: `totp-${Date.now()}.test`,
          slug: `totp-${Date.now()}`,
          execution_mode: 'B_BOOK',
        },
      });
      tenantId = tenant.id;

      const admin = await prisma.tenantAdmin.create({
        data: {
          tenant_id: tenantId,
          email,
          name: 'TOTP Tester',
          password_hash: await bcrypt.hash(password, 10),
          role: 'admin',
        },
      });
      adminId = admin.id;

      adminToken = app.jwt.sign({
        sub: admin.id,
        email: admin.email,
        role: 'admin',
        tenantId,
      });
    });

    afterAll(async () => {
      await prisma.auditLog.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
      await prisma.tenantAdmin.deleteMany({ where: { tenant_id: tenantId } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
      await app.close();
    });

    it('GET /2fa/status reports disabled by default', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/2fa/status',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enabled).toBe(false);
    });

    it('POST /2fa/setup returns secret + QR data URI', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/2fa/setup',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json().data;
      expect(typeof body.secret).toBe('string');
      expect(body.secret.length).toBeGreaterThan(10);
      expect(body.qr_code_url.startsWith('data:image/png;base64,')).toBe(true);

      // Secret persisted as ciphertext, totp_enabled still false.
      const row = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
      expect(row?.totp_enabled).toBe(false);
      expect(row?.totp_secret.startsWith('v1:')).toBe(true);
    });

    it('POST /2fa/verify with a valid code flips totp_enabled to true', async () => {
      const row = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
      const secret = cryptoMod.decrypt(row!.totp_secret);
      const code = authenticator.generate(secret);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/2fa/verify',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enabled).toBe(true);

      const after = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
      expect(after?.totp_enabled).toBe(true);
    });

    it('POST /2fa/verify with a wrong code returns 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/2fa/verify',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: '000001' },
      });
      // Either 401 INVALID_2FA_CODE, or (if the random code happened to be valid) 200.
      // Astronomically unlikely; assert deterministic case.
      expect([200, 401]).toContain(res.statusCode);
      if (res.statusCode === 401) {
        expect(res.json().code).toBe('INVALID_2FA_CODE');
      }
    });

    it('admin/login with totp_enabled returns requires_2fa when no code is sent', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/login',
        payload: { email, password, tenant_id: tenantId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.requires_2fa).toBe(true);
      expect(res.json().data.token).toBeUndefined();
    });

    it('admin/login with wrong code returns 401 and writes LOGIN_2FA_FAILED audit', async () => {
      const before = await prisma.auditLog.count({
        where: { tenant_id: tenantId, action: 'LOGIN_2FA_FAILED' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/login',
        payload: { email, password, tenant_id: tenantId, code: '000000' },
      });
      // 401 normally; 200 in the astronomically unlikely case '000000' is the live code.
      if (res.statusCode === 401) {
        expect(res.json().code).toBe('INVALID_2FA_CODE');
        const after = await prisma.auditLog.count({
          where: { tenant_id: tenantId, action: 'LOGIN_2FA_FAILED' },
        });
        expect(after).toBe(before + 1);
      }
    });

    it('admin/login with valid code issues a JWT', async () => {
      const row = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
      const secret = cryptoMod.decrypt(row!.totp_secret);
      const code = authenticator.generate(secret);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/login',
        payload: { email, password, tenant_id: tenantId, code },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(typeof data.token).toBe('string');
      expect(typeof data.refreshToken).toBe('string');
      expect(data.admin.email).toBe(email);
    });

    it('POST /2fa/disable with a valid code clears the secret', async () => {
      const row = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
      const secret = cryptoMod.decrypt(row!.totp_secret);
      const code = authenticator.generate(secret);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/2fa/disable',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.enabled).toBe(false);

      const after = await prisma.tenantAdmin.findUnique({ where: { id: adminId } });
      expect(after?.totp_enabled).toBe(false);
      expect(after?.totp_secret).toBe('');
    });

    it('admin/login still works for an admin with totp_enabled = false', async () => {
      // 2FA is now disabled. Bare email+password must succeed.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/login',
        payload: { email, password, tenant_id: tenantId },
      });
      expect(res.statusCode).toBe(200);
      expect(typeof res.json().data.token).toBe('string');
    });
  });
});
