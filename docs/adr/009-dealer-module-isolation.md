# ADR 009: Dealer module — runtime flag + build-time strip

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** Backend team (Sprint 7.5)

## Context

`CLAUDE.md` promises that for regulated brokers, the dealer-intervention
code "n'existe pas dans leur runtime". Up to Sprint 7.4 that promise was
broken: the dealer routes were always imported into the API process and
each route gated only at HTTP level by `requireDealerMode` middleware. The
code was still in memory, still auditable, and a misconfiguration could
expose it.

Audit v3 flagged this as the largest residual blocker for an EU-regulated
deployment.

## Decision

Two layers of isolation:

1. **Runtime flag** — `index.ts` only imports `./modules/dealer/routes`
   when `process.env.ENABLE_DEALER_MODULE === '1'`. By default the routes
   are absent from the Fastify route table; not 403, not present at all.
   Verified by `tests/dealer-flag.test.ts` (3 cases: unset, "0", "1").
2. **Build-time strip** — the multi-stage Dockerfile takes a
   `BUILD_PROFILE` arg. With `BUILD_PROFILE=regulated` the `builder` stage
   `rm -rf` the dealer source tree before tsc runs. The resulting `dist/`
   contains no dealer code at all; even `ENABLE_DEALER_MODULE=1` fails at
   boot with a fail-loud error. The image used by a regulated broker
   physically cannot serve dealer routes.

Operators of B_BOOK_DEALER tenants build with the default `full` profile
and set `ENABLE_DEALER_MODULE=1` in their deployment. Operators of A_BOOK
or regulated B_BOOK tenants build with `--build-arg BUILD_PROFILE=regulated`
and leave the env var unset.

## Alternatives considered

- **Keep routes always-loaded with HTTP-level gating only.** Violates the
  CLAUDE.md promise; an SSRF or auth bypass elsewhere could potentially
  reach dealer code. Rejected.
- **Move dealer to a separate repository / package.** Cleanest separation
  but creates a coordination tax for code shared with the rest of the
  trading engine (audit logging, position close paths). The strip-at-build
  approach gets the same artifact-level guarantee without the
  multi-repo overhead.
- **Replace the dealer module with a stub at build time.** Considered,
  but `rm -rf` is simpler and the dynamic import in index.ts already
  fails loudly when the path is missing — that gives the deployment-time
  guard we want.

## Consequences

- The CLAUDE.md promise is now enforceable: a `regulated` image, by
  inspection of `dist/`, contains no `modules/dealer/` directory.
- Test/CI can verify the runtime layer in unit tests (no Docker needed).
  The build-time layer is verified by image inspection in deployment
  pipelines (operator's responsibility).
- `index.ts` skips its `start()` call when `NODE_ENV=test` so unit tests
  can import `buildServer` without the auto-listen side effect.
- Follow-up: when a CI matrix runs the Docker build, add a job that
  `docker run --rm regulated-image find packages/server/dist -name
  '*dealer*'` and asserts no output.
