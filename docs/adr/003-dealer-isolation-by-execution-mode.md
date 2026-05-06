# ADR 003: Dealer module isolation by `execution_mode`

- **Status:** Accepted
- **Date:** 2026-04-27
- **Context tag:** Architecture finding from external audit

## Context

The dealer module lets brokers manually override trade outcomes (P&L override,
slippage, requote). This is legal only for brokers operating as B-Book
counterparties under a clear contractual disclosure. For regulated A-Book
brokers (EU/UK retail under ESMA / FCA), exposing dealer routes is a
compliance violation.

The original CLAUDE.md promised "this code does not exist in the runtime for
regulated brokers." The audit found the dealer plugin was loaded globally
in `src/index.ts` for every tenant — promise broken.

## Decision

Dealer routes stay registered in a single Fastify instance, but each route
runs a `requireDealerMode` preHandler:

```typescript
async function requireDealerMode(request, reply) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: request.tenantId },
    select: { execution_mode: true },
  });
  if (tenant?.execution_mode !== 'B_BOOK_DEALER') {
    return reply.status(403).send({
      error: 'Dealer module not enabled for this tenant',
      code: 'DEALER_DISABLED',
    });
  }
}
```

Inserted between `tenantResolver` and `requireAdmin` on every dealer route.

## Alternatives considered

- **Run the dealer module in a separate Node process / container** — would
  satisfy the literal "code doesn't exist in runtime" promise. Rejected for
  now: increases ops cost, requires inter-process communication, and the
  middleware-level gate provides equivalent guarantees as long as the
  enforcement is itself audited (see test `tests/dealer-isolation.test.ts`).
- **Conditional plugin registration based on broker execution_mode** —
  rejected because tenants can switch execution_mode at runtime; we'd have
  to restart the server.

## Consequences

- Single-process simplicity preserved.
- Compliance gate is a unit-tested middleware (`tests/dealer-isolation.test.ts`)
  with two cases: A_BOOK tenant → 403 DEALER_DISABLED, B_BOOK_DEALER tenant
  → not 403 (auth or success).
- If we ever want true process-level isolation (e.g., to ship the dealer
  module in a separate Docker image for offshore-only deployments), the
  current code is already organized in `modules/dealer/routes.ts` and can be
  lifted into a worker without touching the main app.
