#!/usr/bin/env node
/**
 * Sprint 9.6 — Local PostgreSQL without Docker.
 *
 * Some dev machines (VMs without nested virtualization, locked-down
 * laptops) cannot run Docker Desktop. This script downloads a real
 * PostgreSQL binary once via the `embedded-postgres` npm package into a
 * git-ignored `.local/pg/` folder, then starts it with the same
 * credentials docker-compose uses, so DATABASE_URL from .env.example
 * works unchanged.
 *
 * Usage:
 *   node scripts/dev-postgres.mjs            # start on 5432 (Ctrl+C stops)
 *   PG_PORT=5433 node scripts/dev-postgres.mjs
 *   PG_RESET=1 node scripts/dev-postgres.mjs # wipe data dir first
 *
 * Then, in another terminal:
 *   cd packages/server && npx prisma migrate deploy && npm run seed
 *
 * Nothing here is used by CI or production. CI runs the postgres:16
 * service container; production uses a managed PostgreSQL.
 */
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.local', 'pg');
const dataDir = path.join(local, 'data');
const port = Number(process.env.PG_PORT || 5432);
const user = 'tradexlabel';
const password = 'tradexlabel_dev';
const database = 'tradexlabel';

// 1. One-time install of embedded-postgres into .local/pg (not the workspace).
const pkgEntry = path.join(local, 'node_modules', 'embedded-postgres', 'dist', 'index.js');
if (!existsSync(pkgEntry)) {
  console.log('[dev-postgres] installing embedded-postgres into .local/pg (one-time, ~40MB)...');
  mkdirSync(local, { recursive: true });
  const r = spawnSync('npm', ['install', '--prefix', local, '--no-audit', '--no-fund', '--no-package-lock', 'embedded-postgres'], {
    stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (r.status !== 0) { console.error('[dev-postgres] npm install failed'); process.exit(1); }
}

if (process.env.PG_RESET === '1' && existsSync(dataDir)) {
  console.log('[dev-postgres] PG_RESET=1 — removing', dataDir);
  rmSync(dataDir, { recursive: true, force: true });
}

// 2. Start.
const { default: EmbeddedPostgres } = await import(pathToFileURL(pkgEntry).href);
const fresh = !existsSync(dataDir);
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user, password, port, persistent: true });
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase(database);

console.log(`[dev-postgres] ready — DATABASE_URL="postgresql://${user}:${password}@localhost:${port}/${database}"`);
console.log('[dev-postgres] Ctrl+C to stop.');

const stop = async () => { console.log('\n[dev-postgres] stopping...'); await pg.stop().catch(() => {}); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
