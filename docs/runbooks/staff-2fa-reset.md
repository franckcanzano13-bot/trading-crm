# A broker staff member lost their 2FA device

Backup codes first; superadmin reset second; never disable 2FA by editing the
database.

## 1. Backup codes (self-service)

Every staff account that enabled 2FA received 10 single-use backup codes
(Sprint 5.1). The login page accepts a backup code in place of the TOTP code.
After logging in, the person regenerates codes: `POST /api/v1/admin/2fa/regenerate-backup-codes`
(Settings → Security in the back-office).

## 2. Superadmin reset (Phase 9.3)

When no backup code is left:

1. **Verify identity out of band**: phone call to the broker's registered support number, or a video call with the broker's primary contact. Write down who confirmed what. Social engineering of this step is the most likely attack on the platform.
2. Superadmin logs into `/superadmin`, finds the tenant, then calls:
   ```
   POST /api/v1/super/tenants/<tenantId>/admins/<adminId>/2fa/reset
   Authorization: Bearer <superadmin token>
   ```
   (UI button pending; use the API docs at `/api/docs` on staging.)
3. The admin's TOTP secret, flag and backup codes are cleared. The event is audited as `2FA_RESET` with `actor_type = superadmin`.
4. Tell the person to log in (password only) and immediately re-enrol: `POST /api/v1/admin/2fa/setup` then `/verify`. Until then their account is password-only — if they do not re-enrol within 24 h, deactivate the account (`is_active=false`) and escalate to the broker.

## What not to do

- Do not `UPDATE tenant_admins SET totp_enabled=false` by hand: it bypasses the audit trail.
- Do not reset for a request that arrived only by email, even from the correct address.
