# ADR 005: TOTP-only 2FA for staff accounts

- **Status:** Accepted
- **Date:** 2026-04-27

## Context

The audit flagged "no 2FA on admin accounts" as HIGH (CVSS 6.5). Trader
accounts have effective leverage on real money; admin accounts can deposit,
withdraw, change KYC status, and intervene on trades. Both need a second
factor.

## Decision

TOTP (RFC 6238) only, for now:
- Admin/dealer/seller/retention accounts can enable TOTP via
  `POST /api/v1/admin/2fa/setup`. The QR code (data URI) and base32 secret
  are returned **once**; subsequent `GET /2fa/status` returns only `enabled`.
- The secret is stored AES-256-GCM encrypted at rest (see ADR 006 for the
  crypto helper).
- `POST /api/v1/admin/login` returns `{ requires_2fa: true }` (200) when the
  password is correct but no TOTP code was supplied. The client then
  re-submits with `code`.
- Wrong code → `LOGIN_2FA_FAILED` audit log entry + 401.

Trader accounts: not in this iteration. Their attack surface is smaller
(can't withdraw without admin approval) and adding it requires UX work.

## Alternatives considered

- **SMS / email codes** — rejected: SIM swap, email compromise, GDPR data
  flow concerns, cost.
- **WebAuthn / Passkeys** — strictly better security, but requires a working
  HTTPS deployment and complicates dev. Deferred to a future ADR once we
  have proper hosting.
- **Skip 2FA, rely on IP whitelist** — not enough; insider risk.

## Consequences

- Admins can use Google Authenticator, Authy, 1Password, etc.
- Lost-device recovery: not yet implemented. Currently the SuperAdmin can
  manually clear `totp_secret` and `totp_enabled` via DB (or future
  `/super/admin/:id/2fa/reset` route). Captured as a follow-up.
- The encryption key (`ENCRYPTION_KEY` env var) becomes critical: losing it
  breaks all 2FA at once. Operational runbook must document key rotation.
- Trader accounts remain 2FA-less for now — the audit's CVSS 6.5 score is
  partially addressed. Re-evaluate post-launch.
