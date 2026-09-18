#!/usr/bin/env node
/**
 * Sprint 8.5 — End-to-end HTTP smoke test against a RUNNING API.
 *
 * Exercises the money paths a broker actually uses, in order, on a seeded
 * database (`npm run seed`): logins, instruments, admin deposit, market
 * order open/close, trade history, client-funds segregation drift (must be
 * exactly 0), CRM lead creation + conversion with FTD, cross-tenant
 * isolation, /metrics auth and security headers.
 *
 * Usage (after `npm run seed` printed the tenant IDs):
 *   SMOKE_TENANT_ID=<demo tenant> SMOKE_OTHER_TENANT_ID=<dealer tenant> \
 *   SMOKE_METRICS_TOKEN=<METRICS_AUTH_TOKEN> \
 *   node scripts/smoke-api.mjs [http://127.0.0.1:5500]
 *
 * Exit code 1 on any failure. No dependencies beyond Node 18+ fetch.
 */
const BASE = process.argv[2] || process.env.SMOKE_API_URL || 'http://127.0.0.1:5500';
const T = process.env.SMOKE_TENANT_ID;
const OTHER = process.env.SMOKE_OTHER_TENANT_ID;
const METRICS_TOKEN = process.env.SMOKE_METRICS_TOKEN || '';
if (!T) { console.error('SMOKE_TENANT_ID is required (demo tenant id from `npm run seed`)'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const short = (j) => JSON.stringify(j ?? null).slice(0, 100);
async function call(method, path, { token, body, tenant = T } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenant, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null; try { j = await r.json(); } catch { /* non-JSON body */ }
  return { status: r.status, j };
}

console.log(`Smoke test against ${BASE} (tenant ${T})`);

// 1. Auth
const tr = await call('POST', '/api/v1/auth/login', { body: { email: 'trader@demo.com', password: 'trader123' } });
ok(tr.status === 200 && tr.j?.data?.token, 'trader login');
const trader = tr.j?.data?.token;
const ad = await call('POST', '/api/v1/admin/login', { body: { email: 'admin@demo.com', password: 'admin123', tenant_id: T } });
ok(ad.status === 200 && ad.j?.data?.token, 'admin login');
const admin = ad.j?.data?.token;
if (!trader || !admin) { console.log('\nCannot continue without tokens.'); process.exit(1); }
const bad = await call('POST', '/api/v1/auth/login', { body: { email: 'trader@demo.com', password: 'wrong' } });
ok(bad.status === 401, 'wrong password → 401');

// 2. Instruments
const ins = await call('GET', '/api/v1/instruments', { token: trader });
ok(ins.status === 200 && Array.isArray(ins.j?.data) && ins.j.data.length > 0, `instruments listed (${ins.j?.data?.length ?? 0})`);
const sym = (ins.j?.data?.find((i) => i.symbol === 'EURUSD') || ins.j?.data?.[0])?.symbol;

// 3. Admin deposit
const clients = await call('GET', '/api/v1/admin/clients', { token: admin });
ok(clients.status === 200, 'admin clients');
const me = clients.j?.data?.find((c) => c.email === 'trader@demo.com');
const acct = me?.accounts?.[0];
const dep = await call('POST', `/api/v1/admin/accounts/${acct?.id}/deposit`, { token: admin, body: { amount: 1000, description: 'smoke' } });
ok(dep.status === 200, `admin deposit → ${dep.status} ${short(dep.j)}`);

// 4. Market order open / close
const ord = await call('POST', '/api/v1/orders', { token: trader, body: { symbol: sym, side: 'BUY', type: 'MARKET', volume: 0.01 } });
ok(ord.status === 201 || ord.status === 200, `market BUY ${sym} 0.01 → ${ord.status}`);
const pos = await call('GET', '/api/v1/positions', { token: trader });
ok(pos.status === 200 && pos.j?.data?.length >= 1, `open positions (${pos.j?.data?.length ?? 0})`);
const p = pos.j?.data?.[0];
const cl = await call('POST', `/api/v1/positions/${p?.id}/close`, { token: trader, body: {} });
ok(cl.status === 200, `close position → ${cl.status} ${cl.status === 200 ? '' : short(cl.j)}`);
const hist = await call('GET', '/api/v1/trades/history', { token: trader });
ok(hist.status === 200 && hist.j?.data?.some((t) => t.id === p?.id && t.status === 'CLOSED'), 'trade appears CLOSED in history');

// 5. CRM: create lead + convert with FTD (Sprint 8.3 / 8.4)
const email = `smoke-${Date.now()}@example.test`;
const lead = await call('POST', '/api/v1/crm/leads', { token: admin, body: { email, first_name: 'Smoke', last_name: 'Test', phone: '+15550000', country: 'US' } });
ok(lead.status === 201 || lead.status === 200, `crm lead created → ${lead.status}`);
const lid = lead.j?.data?.id;
const conv = await call('POST', `/api/v1/crm/leads/${lid}/convert`, { token: admin, body: { password: 'Secret123!', deposit_amount: 50 } });
ok(conv.status === 200, `crm convert with FTD → ${conv.status} ${conv.status === 200 ? '' : short(conv.j)}`);
const conv2 = await call('POST', `/api/v1/crm/leads/${lid}/convert`, { token: admin, body: {} });
ok(conv2.status === 400 && conv2.j?.code === 'ALREADY_CONVERTED', 'second convert → 400 ALREADY_CONVERTED');
const newLogin = await call('POST', '/api/v1/auth/login', { body: { email, password: 'Secret123!' } });
ok(newLogin.status === 200, 'converted client can log in');

// 6. Segregation: after deposits, a closed trade and an FTD, drift must be 0
const seg = await call('GET', '/api/v1/admin/reports/segregation', { token: admin });
ok(seg.status === 200, `segregation report → ${seg.status}`);
ok(String(seg.j?.drift_cents) === '0', `segregation drift_cents = ${seg.j?.drift_cents} (${seg.j?.drift_status})`);

// 7. Tenant isolation
if (OTHER) {
  const other = await call('GET', '/api/v1/positions', { token: trader, tenant: OTHER });
  ok(other.status === 403, `trader token on another tenant → ${other.status}`);
}

// 8. Ops endpoints and headers
const mNo = await fetch(BASE + '/metrics');
ok(mNo.status === 401 || mNo.status === 403, `metrics without token → ${mNo.status}`);
if (METRICS_TOKEN) {
  const m = await fetch(BASE + '/metrics', { headers: { authorization: `Bearer ${METRICS_TOKEN}` } });
  ok(m.status === 200, `metrics with token → ${m.status}`);
}
const h = await fetch(BASE + '/api/v1/health');
ok(h.status === 200, 'health → 200');
ok(h.headers.get('content-security-policy') !== null, 'CSP header present');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
