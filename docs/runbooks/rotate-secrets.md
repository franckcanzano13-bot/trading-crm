# Rotate secrets

Four secrets matter. Rotating the wrong way locks every broker out at once,
so read the whole page first.

| Secret | What breaks if lost | Rotation impact |
|--------|---------------------|-----------------|
| `ENCRYPTION_KEY` (AES-256-GCM, 64 hex) | Every staff TOTP secret, backup codes, SMTP passwords, KYC API keys become unreadable | Must re-encrypt stored values (procedure below) |
| `JWT_SECRET` | Nobody can log in | Every session ends immediately; users just log in again |
| `JWT_REFRESH_SECRET` | Refresh tokens rejected | Same as above, softer |
| `METRICS_AUTH_TOKEN` | Prometheus scrape fails | Update the scraper at the same time |

Generate any of them with `openssl rand -hex 32`.

## JWT secrets (5 minutes, user-visible)

1. Announce a 1-minute reconnection window to brokers if you can.
2. Edit `/opt/tradexlabel/.env`: new `JWT_SECRET`, `JWT_REFRESH_SECRET`.
3. `docker compose up -d api position-monitor` (recreates with the new env).
4. Verify: `curl -fsS https://api.<domain>/api/v1/health`, then log in on the web app.
5. Audit log gets nothing automatic; write a line in the ops journal with the date and who rotated.

## METRICS_AUTH_TOKEN (2 minutes, invisible)

1. New value in `.env`, `docker compose up -d api`.
2. Update the Prometheus `bearer_token` for the api job, reload Prometheus.
3. Check the target is UP in Prometheus.

## ENCRYPTION_KEY (30 minutes, plan it)

There is no automatic re-encryption tool yet. The safe procedure:

1. **Before anything**: `pg_dump` (see restore-database.md) and confirm the current key still decrypts: `docker compose exec api node -e "require('/app/packages/server/dist/shared/crypto').assertProductionKey(); console.log('key ok')"`.
2. Export the plaintext of every encrypted column with the OLD key. From a dev machine with an SSH tunnel to Postgres and the old `ENCRYPTION_KEY` in the environment:
   ```bash
   cd packages/server
   DATABASE_URL=postgresql://... ENCRYPTION_KEY=<old> npx tsx -e "
   const { prisma } = require('./src/shared/database/prisma');
   const { decrypt } = require('./src/shared/crypto');
   (async () => {
     const admins = await prisma.tenantAdmin.findMany({ where: { totp_enabled: true } });
     const cfgs = await prisma.brokerConfig.findMany({ where: { smtp_pass: { not: '' } } });
     require('fs').writeFileSync('rekey.json', JSON.stringify({
       admins: admins.map(a => ({ id: a.id, totp: decrypt(a.totp_secret), codes: decrypt(a.totp_backup_codes) })),
       cfgs: cfgs.map(c => ({ id: c.id, smtp: decrypt(c.smtp_pass) })),
     }));
     console.log(admins.length, 'admins,', cfgs.length, 'smtp configs exported');
   })()"
   ```
   `rekey.json` is plaintext secrets: keep it on an encrypted disk, delete it at the end.
3. Put the NEW key in `.env`, `docker compose up -d api position-monitor`.
4. Re-encrypt with the NEW key (same tunnel, `ENCRYPTION_KEY=<new>`):
   ```bash
   ENCRYPTION_KEY=<new> npx tsx -e "
   const { prisma } = require('./src/shared/database/prisma');
   const { encrypt } = require('./src/shared/crypto');
   const d = JSON.parse(require('fs').readFileSync('rekey.json','utf8'));
   (async () => {
     for (const a of d.admins) await prisma.tenantAdmin.update({ where: { id: a.id }, data: { totp_secret: encrypt(a.totp), totp_backup_codes: encrypt(a.codes) } });
     for (const c of d.cfgs) await prisma.brokerConfig.update({ where: { id: c.id }, data: { smtp_pass: encrypt(c.smtp) } });
     console.log('re-encrypted');
   })()"
   ```
5. Verify: a staff member with 2FA logs in; the CRM sends a test email.
6. `shred -u rekey.json`. Store the new key in the password manager; the old key can be destroyed after one successful backup cycle with the new one.

If step 4 fails halfway, the exported file still lets you finish; do not rotate back.

## Suspected leak

Rotate JWT secrets first (kills stolen sessions), then `METRICS_AUTH_TOKEN`, then plan the `ENCRYPTION_KEY` rotation the same day. Reset the passwords of all superadmins. Check `audit_logs` for `actor_type = 'superadmin'` actions in the suspected window.
