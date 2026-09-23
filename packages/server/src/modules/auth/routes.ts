import { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { RegisterSchema, LoginSchema, BCRYPT_SALT_ROUNDS } from '@tradexlabel/shared';
import { tenantResolver } from '../../shared/middleware/tenant-resolver';
import { requireAuth } from '../../shared/middleware/auth';
import { serializeBigInt, logger } from '../../shared/utils/index';
import { checkUserQuota, auditQuotaHit, quotaMessages } from '../../shared/quotas';
import { issueEmailVerification, tenantRequiresEmailVerification } from './email-verification';

export async function authRoutes(fastify: FastifyInstance) {
  // Register
  fastify.post('/api/v1/auth/register', {
    preHandler: [tenantResolver],
    config: {
      // Phase 1.2: registration was unlimited — 5 accounts / hour / IP.
      rateLimit: { max: 5, timeWindow: '1 hour' },
    },
  }, async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const { email, password, name } = parsed.data;
    const tq = request.tenantQuery!;

    const existing = await tq.findUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    // Phase 1.3: plan quota (max_users). No subscription → unlimited.
    const quota = await checkUserQuota(request.tenantId!);
    if (!quota.ok) {
      await auditQuotaHit({ tenantId: request.tenantId!, kind: 'users', check: quota, ip: request.ip });
      return reply.status(403).send({ error: quotaMessages.users(quota), code: 'PLAN_LIMIT_USERS' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await tq.createUser({ email, password_hash: passwordHash, name });

    // Create default trading account
    const account = await tq.createAccount(user.id);

    // Phase 1.2: confirmation email (24 h link). Trading stays locked until
    // the address is confirmed, unless the broker opted out in tenant.config.
    const verificationRequired = tenantRequiresEmailVerification(request.tenantConfig);
    if (verificationRequired) {
      await issueEmailVerification({ tenantId: request.tenantId!, userId: user.id, email: user.email, name: user.name, ip: request.ip });
    }

    const token = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: 'trader', tenantId: request.tenantId },
      { expiresIn: '4h' }
    );
    const refreshToken = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: 'trader', tenantId: request.tenantId },
      { expiresIn: '7d' }
    );

    logger.info({ userId: user.id, tenant: request.tenantSlug }, 'User registered');

    return reply.status(201).send({
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        account: serializeBigInt(account),
        token,
        refreshToken,
        email_verification_required: verificationRequired,
      },
    });
  });

  // Login
  fastify.post('/api/v1/auth/login', {
    preHandler: [tenantResolver],
    config: {
      // Sprint 2.1: brute-force protection — 5 attempts per 15 min per IP
      rateLimit: { max: 5, timeWindow: '15 minutes' },
    },
  }, async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const tq = request.tenantQuery!;

    const user = await tq.findUserByEmail(email);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    if (user.status === 'BLOCKED') {
      return reply.status(403).send({ error: 'Account blocked', code: 'ACCOUNT_BLOCKED' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    const token = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: 'trader', tenantId: request.tenantId },
      { expiresIn: '4h' }
    );
    const refreshToken = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: 'trader', tenantId: request.tenantId },
      { expiresIn: '7d' }
    );

    logger.info({ userId: user.id, tenant: request.tenantSlug }, 'User logged in');

    return reply.send({
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        token,
        refreshToken,
        execution_mode: request.tenantExecutionMode || 'B_BOOK',
      },
    });
  });

  // Refresh token
  fastify.post('/api/v1/auth/refresh', async (request, reply) => {
    try {
      const decoded = await request.jwtVerify() as { sub: string; email: string; role: string; tenantId: string };
      const token = fastify.jwt.sign(
        { sub: decoded.sub, email: decoded.email, role: decoded.role, tenantId: decoded.tenantId },
        { expiresIn: '4h' }
      );
      const refreshToken = fastify.jwt.sign(
        { sub: decoded.sub, email: decoded.email, role: decoded.role, tenantId: decoded.tenantId },
        { expiresIn: '7d' }
      );
      return reply.send({ data: { token, refreshToken } });
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token', code: 'INVALID_TOKEN' });
    }
  });

  // Get current user
  fastify.get('/api/v1/auth/me', {
    preHandler: [tenantResolver, requireAuth],
  }, async (request, reply) => {
    const tq = request.tenantQuery!;
    const user = await tq.findUserById(request.userData!.sub);
    if (!user) {
      return reply.status(404).send({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    const account = await tq.findAccountByUserId(user.id);

    return reply.send({
      data: {
        email_verified: !!user.email_verified_at, // Phase 1.2
        user: { id: user.id, email: user.email, name: user.name, status: user.status, kyc_status: user.kyc_status },
        account: serializeBigInt(account),
        execution_mode: request.tenantExecutionMode || 'B_BOOK',
      },
    });
  });
}
