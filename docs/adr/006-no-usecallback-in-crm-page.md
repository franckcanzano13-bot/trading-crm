# ADR 006: No `useCallback` in `crm/page.tsx` (MetaMask SES compatibility)

- **Status:** Accepted
- **Date:** 2026-04-27

## Context

When a user has the MetaMask browser extension installed, the page loads
LavaMoat's SES (Secure ECMAScript) lockdown into the page. SES freezes
intrinsics (Object.is, Map.prototype.get, etc.) which interferes with React's
internal hook dependency comparison.

Specifically: `useCallback` and `useMemo` use a `Object.is` polyfill that SES
lockdown wraps. The wrapped version returns `undefined` instead of a boolean
in some cases, causing React to throw error #310 ("Objects are not valid as a
React child") on the very first render of `/crm`.

The trader / admin / dealer / superadmin pages are not affected because they
don't call `useCallback` in the same component tree depth.

## Decision

In `packages/web/src/app/crm/page.tsx` and the components in
`packages/web/src/components/crm/`, **do not use `useCallback`**. Plain
function declarations work fine — React reconciles them as new references
each render, but the cost is negligible at this component count and the
correctness wins.

For values that need to be stable (like `tokenRef`, `tenantIdRef`), use
`useRef` directly.

## Alternatives considered

- **Wrap MetaMask compatibility check** — detect SES presence, conditionally
  use `useCallback`. Rejected: too brittle, hard to test both code paths.
- **Use `useEvent`-style stable callback** — same root issue: relies on
  identity comparison.
- **Tell users to disable MetaMask** — unacceptable UX for a trading platform
  that must coexist with crypto wallets.

## Consequences

- New CRM components must be reviewed for `useCallback` usage. ESLint rule
  `react-hooks/exhaustive-deps` may push devs to add it; we document the
  exception in CLAUDE.md.
- Performance impact is invisible at the current scale (200 lead rows, etc.).
  If we ever virtualize a list with hundreds of stable handlers, revisit.
- The `dealer-page.tsx` and `admin-page.tsx` are not subject to this rule
  because they don't currently exhibit the bug. If they grow, watch for it.
