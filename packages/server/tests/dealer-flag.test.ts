import { describe, it, expect } from 'vitest';

/**
 * Sprint 7.5 — Dealer module is gated by ENABLE_DEALER_MODULE.
 *
 * Two layers:
 *   1. Build-time: BUILD_PROFILE=regulated strips src/modules/dealer
 *      before tsc. Tested by inspecting dist/ in the built image (out of
 *      scope for unit tests).
 *   2. Runtime: index.ts skips the dynamic import when the flag is unset.
 *      That's what we exercise here — start the server twice (with and
 *      without the flag) and check whether /api/v1/dealer/* exists in
 *      the route table.
 *
 * We need to re-import buildServer in each test so module-level state
 * (Fastify instance, env reads) is fresh.
 */
async function buildWithFlag(flag: string | undefined) {
  const prev = process.env.ENABLE_DEALER_MODULE;
  if (flag === undefined) delete process.env.ENABLE_DEALER_MODULE;
  else process.env.ENABLE_DEALER_MODULE = flag;
  // Force a fresh module graph — buildServer reads the env in its body.
  const fresh = await import(`../src/index.ts?cb=${Date.now()}`).catch(() => import('../src/index'));
  const restore = () => {
    if (prev === undefined) delete process.env.ENABLE_DEALER_MODULE;
    else process.env.ENABLE_DEALER_MODULE = prev;
  };
  return { buildServer: fresh.buildServer as () => Promise<any>, restore };
}

function listRoutes(fastify: any): string[] {
  // Fastify exposes the print-routes tree; parse the URLs out of it.
  const tree = fastify.printRoutes({ commonPrefix: false });
  // printRoutes yields "GET /api/v1/foo (...)" etc.
  return tree.split('\n').filter(Boolean);
}

describe('Sprint 7.5 — dealer module flag gating', () => {
  it('omits dealer routes when ENABLE_DEALER_MODULE is unset', async () => {
    const { buildServer, restore } = await buildWithFlag(undefined);
    const fastify = await buildServer();
    try {
      const all = listRoutes(fastify).join('\n');
      expect(all).not.toMatch(/\/api\/v1\/dealer/);
    } finally {
      await fastify.close();
      restore();
    }
  });

  it('omits dealer routes when ENABLE_DEALER_MODULE is "0"', async () => {
    const { buildServer, restore } = await buildWithFlag('0');
    const fastify = await buildServer();
    try {
      const all = listRoutes(fastify).join('\n');
      expect(all).not.toMatch(/\/api\/v1\/dealer/);
    } finally {
      await fastify.close();
      restore();
    }
  });

  it('loads dealer routes when ENABLE_DEALER_MODULE="1"', async () => {
    const { buildServer, restore } = await buildWithFlag('1');
    const fastify = await buildServer();
    try {
      const all = listRoutes(fastify).join('\n');
      // Any dealer-prefixed route is enough to confirm the module loaded.
      expect(all).toMatch(/\/api\/v1\/dealer/);
    } finally {
      await fastify.close();
      restore();
    }
  });
});
