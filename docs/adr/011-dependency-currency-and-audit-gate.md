# ADR 011: Dependency currency — Fastify 5, Next 16, and the npm audit gate

**Status**: Accepted
**Date**: 2026-09-18
**Sprint**: 9.1

## Context

Sprint 6.3 made `npm audit --omit=dev --audit-level=high` a blocking CI step.
On 2026-09-18 the gate was red without any code change: advisories had
been published against the versions we pinned in May.

| Package | Installed | Finding | Fix version |
|---|---|---|---|
| fast-jwt (via @fastify/jwt 8) | 4.0.5 | **critical** — auth bypass with empty HMAC secret, cache confusion returning another token's claims, `iss` validation | @fastify/jwt 10 (fast-jwt 6) |
| @fastify/static (via swagger-ui 4) | 7.0.4 | high — authorization bypass via non-canonical paths | @fastify/swagger-ui 6 |
| nodemailer | 6.x | high — file read / SSRF via `raw`, recipient-domain bypass | 10.0.10 |
| next | 14.2.35 | critical (range up to 16.3.0-preview) | 16.3.5 |
| postcss (nested in next 14) | 8.4.31 | high | comes with next 16 |
| brace-expansion, esbuild, tar (via bcrypt's node-pre-gyp) | various | high / low | audit fix, bcrypt 6 |

Every one of the server fixes required the Fastify 5 plugin line, which
requires Fastify 5. Every web fix required Next 16, which requires React 19.

## Decision

Upgrade rather than pin around the advisories:

- **Server**: Fastify 5.12 + @fastify/{cors 11, helmet 13, jwt 10, rate-limit 10,
  swagger 9, swagger-ui 6, websocket 11}, bcrypt 6 (no node-pre-gyp), bullmq 6,
  nodemailer 10. One source change was needed: `request.routerPath` was removed
  in Fastify 5, the metrics hook now reads `request.routeOptions.url`.
- **Web**: Next 16.3 + React 19.3, lucide-react 1.x, @tanstack/react-table 9,
  react-hook-form 7.71, zustand 5. Next rewrote `tsconfig.json`
  (`jsx: react-jsx`). No component change was needed; the `useCallback` ban
  (ADR-006) still holds.
- **Single React**: npm kept a hoisted React 18 for peers while React 19 sat
  nested under `packages/web`, which would have produced two React copies at
  runtime (hooks would fail). Root `package.json` now carries `overrides` for
  `react`, `react-dom` and their types; the lockfile was rebuilt so `next`
  resolves React 19.3 from the root.
- **The audit gate stays**. A red audit on an unchanged codebase is the gate
  doing its job. The rule going forward: when the gate turns red, upgrade
  within the sprint; never add `|| true` back, never pin to a vulnerable range.

## Verification

- Server: tsc, eslint --max-warnings=0, vitest 155/155 (22 files) on PostgreSQL,
  production build booted, `npm run smoke` 21/21 (login rate-limit, CSP, WS,
  trading, CRM conversion, segregation drift 0).
- Web: tsc, `next build` (standalone output, 6 static routes).
- `npm audit --omit=dev --audit-level=high` exit 0.

## Consequences

- Node 20.9+ is now a hard floor (Next 16). The Dockerfiles pin 20.18.1.
- `next lint` no longer exists in Next 16; ESLint for the web package is
  a follow-up (the server package is the one with a lint gate today).
- Dependabot / Renovate would have surfaced these months earlier. Enabling
  Dependabot on the repository is recommended.
