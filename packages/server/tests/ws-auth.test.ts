import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * VULN-002 regression: ws-server.ts must not blindly trust client-supplied
 * userId/tenantId in 'auth' messages. It must verify the JWT.
 *
 * This is a static check on the source (verifying the dangerous pattern
 * has been removed and JWT verification is in place). A full e2e test
 * would require booting a real WS server, which is beyond unit scope.
 */
describe('WebSocket authentication (VULN-002)', () => {
  const wsServerSource = readFileSync(
    resolve(__dirname, '../src/shared/websocket/ws-server.ts'),
    'utf8'
  );

  it('does not trust client-supplied userId in auth message', () => {
    // The pre-fix line was: client.userId = msg.userId;
    expect(wsServerSource).not.toMatch(/client\.userId\s*=\s*msg\.userId/);
  });

  it('does not trust client-supplied tenantId in auth message', () => {
    expect(wsServerSource).not.toMatch(/client\.tenantId\s*=\s*msg\.tenantId/);
  });

  it('calls fastify.jwt.verify on auth message', () => {
    expect(wsServerSource).toMatch(/fastify\.jwt\.verify\s*\(\s*msg\.token/);
  });

  it('uses decoded.sub (from verified JWT) as userId source', () => {
    expect(wsServerSource).toMatch(/client\.userId\s*=\s*decoded\.sub/);
  });

  it('closes the socket with 1008 on auth failure', () => {
    expect(wsServerSource).toMatch(/socket\.close\s*\(\s*1008/);
  });
});
