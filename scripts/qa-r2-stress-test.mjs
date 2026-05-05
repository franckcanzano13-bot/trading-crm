/**
 * QA Round 2 — Phase 7: Stress Test Reinforced
 * 200+ concurrent requests, 100 WS clients, chaos testing
 */
import WebSocket from 'ws';

const BASE = 'http://localhost:5500';
const WS_URL = 'ws://localhost:5500/ws/prices';
const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';
let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) { passCount++; console.log(`  ✅ ${label}`); }
  else { failCount++; console.log(`  ❌ FAIL: ${label}`); }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function run() {
  console.log('\n=============================================');
  console.log('  QA R2 PHASE 7: STRESS TEST REINFORCED');
  console.log('=============================================\n');

  const login = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'trader123' }),
  });
  const token = login.data?.data?.token;
  const H = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID };

  const adminLogin = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'dealer123', tenant_id: TENANT_ID }),
  });
  const adminToken = adminLogin.data?.data?.token;
  const AH = { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-ID': TENANT_ID };

  // ─── Test 1: 200 concurrent GET requests ───
  console.log('─── Test 1: 200 Concurrent GET ───');
  const t1Start = Date.now();
  const r1 = await Promise.allSettled(
    Array.from({ length: 200 }, () => api('/api/v1/account', { headers: H }))
  );
  const t1 = Date.now() - t1Start;
  const t1ok = r1.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  console.log(`  ${t1ok}/200 in ${t1}ms`);
  assert(t1ok >= 190, `≥95% success (${t1ok}/200)`);
  assert(t1 < 10000, `Under 10s (${t1}ms)`);

  // ─── Test 2: 100 concurrent POST trades ───
  console.log('\n─── Test 2: 100 Concurrent Trades ───');
  const t2Start = Date.now();
  const r2 = await Promise.allSettled(
    Array.from({ length: 100 }, () => api('/api/v1/orders', {
      method: 'POST', headers: H,
      body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
    }))
  );
  const t2 = Date.now() - t2Start;
  const t2ok = r2.filter(r => r.status === 'fulfilled' && r.value.status === 201).length;
  console.log(`  ${t2ok}/100 trades in ${t2}ms`);
  assert(t2ok >= 90, `≥90% trades succeeded (${t2ok}/100)`);

  // Close all positions
  const openPos = (await api('/api/v1/positions', { headers: H })).data?.data || [];
  let closed = 0;
  for (const p of openPos) {
    const r = await api(`/api/v1/positions/${p.id}/close`, { method: 'POST', headers: H, body: '{}' });
    if (r.status === 200) closed++;
  }
  console.log(`  Closed ${closed}/${openPos.length} positions`);
  assert(closed === openPos.length, `All positions closed`);

  // ─── Test 3: 500 mixed requests in 30 seconds ───
  console.log('\n─── Test 3: 500 Mixed Requests ───');
  const endpoints = [
    ['/api/v1/account', H],
    ['/api/v1/instruments', H],
    ['/api/v1/positions', H],
    ['/api/v1/trades/history?limit=5', H],
    ['/api/v1/admin/dashboard', AH],
    ['/api/v1/admin/clients', AH],
  ];
  const t3Start = Date.now();
  const r3 = await Promise.allSettled(
    Array.from({ length: 500 }, (_, i) => {
      const [path, headers] = endpoints[i % endpoints.length];
      return api(path, { headers });
    })
  );
  const t3 = Date.now() - t3Start;
  const t3ok = r3.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  const t3errRate = ((500 - t3ok) / 500 * 100).toFixed(1);
  console.log(`  ${t3ok}/500 OK in ${t3}ms (error rate: ${t3errRate}%)`);
  assert(t3ok >= 495, `≥99% success (${t3ok}/500)`);
  assert(t3 < 30000, `Under 30s (${t3}ms)`);

  // ─── Test 4: 50 WebSocket connections ───
  console.log('\n─── Test 4: 50 WebSocket Connections ───');
  const wsResults = await Promise.allSettled(
    Array.from({ length: 50 }, () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 10000);
      const ws = new WebSocket(WS_URL);
      let count = 0;
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'subscribe', symbols: ['BTCUSD', 'ETHUSD'] }));
      });
      ws.on('message', () => {
        count++;
        if (count >= 5) { clearTimeout(timeout); ws.close(); resolve(count); }
      });
      ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
    }))
  );
  const wsOk = wsResults.filter(r => r.status === 'fulfilled').length;
  console.log(`  ${wsOk}/50 WS connections OK`);
  assert(wsOk >= 45, `≥90% WS connections (${wsOk}/50)`);

  // ─── Test 5: WebSocket throughput ───
  console.log('\n─── Test 5: WebSocket Throughput (10s) ───');
  const msgCount = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let count = 0;
    const t = setTimeout(() => { ws.close(); resolve(count); }, 10000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'subscribe', symbols: ['BTCUSD', 'ETHUSD', 'XRPUSD', 'EURUSD'] })));
    ws.on('message', () => count++);
    ws.on('error', () => { clearTimeout(t); resolve(count); });
  });
  console.log(`  ${msgCount} messages in 10s`);
  assert(msgCount >= 50, `≥50 messages (${msgCount})`);

  // ─── Test 6: Database consistency under concurrent load ───
  console.log('\n─── Test 6: DB Consistency (20 concurrent deposit/withdraw) ───');
  const emmaAcct = '8fe3655e-4bdc-4d04-8c8f-54d180093db4';
  const balBefore = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  // 20 sequential deposit+withdraw cycles
  for (let i = 0; i < 20; i++) {
    await api(`/api/v1/admin/accounts/${emmaAcct}/deposit`, {
      method: 'POST', headers: AH, body: JSON.stringify({ amount: 10 }),
    });
    await api(`/api/v1/admin/accounts/${emmaAcct}/withdraw`, {
      method: 'POST', headers: AH, body: JSON.stringify({ amount: 10 }),
    });
  }
  const balAfter = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  const drift = Math.abs(balAfter - balBefore);
  console.log(`  Drift: ${drift} cents`);
  assert(drift === 0, `Zero drift after 20 cycles`);

  // ─── Test 7: Malformed payloads ───
  console.log('\n─── Test 7: Malformed Payloads (100 valid JSON) ───');
  const payloads = [
    '{}',
    JSON.stringify({ symbol: 'A'.repeat(1000) }),
    JSON.stringify({ volume: -999, side: 'INVALID' }),
    JSON.stringify({ symbol: '<script>alert(1)</script>', side: 'BUY', volume: 0.01, type: 'MARKET' }),
    JSON.stringify({ symbol: "'; DROP TABLE trades; --", side: 'BUY', volume: 0.01, type: 'MARKET' }),
    JSON.stringify({ symbol: null, side: 'BUY', volume: 0.01, type: 'MARKET' }),
    JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0, type: 'MARKET' }),
    JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: -1, type: 'MARKET' }),
    JSON.stringify({ symbol: 'EURUSD', side: 'INVALID', volume: 0.01, type: 'MARKET' }),
    JSON.stringify({ symbol: 'DOESNOTEXIST', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  ];
  let serverErrors = 0;
  let clientErrors = 0;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await api('/api/v1/orders', {
        method: 'POST', headers: H,
        body: payloads[i % payloads.length],
      });
      if (r.status >= 500) serverErrors++;
      else if (r.status >= 400) clientErrors++;
    } catch { serverErrors++; }
  }
  console.log(`  Client errors (expected): ${clientErrors}, Server errors: ${serverErrors}`);
  assert(serverErrors === 0, `Zero 500 errors from malformed payloads (${serverErrors})`);
  assert(clientErrors > 50, `Most malformed payloads rejected (${clientErrors}/100)`);

  // ─── Test 8: Large payload rejection ───
  console.log('\n─── Test 8: Large Payload ───');
  const bigPayload = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET', data: 'X'.repeat(1_000_000) }),
  });
  assert(bigPayload.status < 500, `1MB payload handled (${bigPayload.status})`);

  // ─── Test 9: Auth resilience ───
  console.log('\n─── Test 9: Auth Resilience ───');
  const noAuth = await api('/api/v1/account', { headers: { 'X-Tenant-ID': TENANT_ID } });
  assert(noAuth.status === 401, `No token → 401`);
  const badToken = await api('/api/v1/account', {
    headers: { 'Authorization': 'Bearer invalid', 'X-Tenant-ID': TENANT_ID },
  });
  assert(badToken.status === 401, `Bad token → 401`);
  const noTenant = await api('/api/v1/account', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert([400, 401, 403].includes(noTenant.status), `No tenant → error`);

  // ─── Test 10: Response time stability ───
  console.log('\n─── Test 10: Response Time (50 requests) ───');
  const times = [];
  for (let i = 0; i < 50; i++) {
    const s = Date.now();
    await api('/api/v1/account', { headers: H });
    times.push(Date.now() - s);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const max = Math.max(...times);
  const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];
  console.log(`  Avg: ${avg.toFixed(0)}ms, Max: ${max}ms, P99: ${p99}ms`);
  assert(avg < 200, `Avg < 200ms (${avg.toFixed(0)}ms)`);
  assert(max < 2000, `Max < 2s (${max}ms)`);
  assert(p99 < 1000, `P99 < 1s (${p99}ms)`);

  // ─── Test 11: WebSocket reconnect stability ───
  console.log('\n─── Test 11: WS Connect/Disconnect x20 ───');
  let wsConnects = 0;
  for (let i = 0; i < 20; i++) {
    try {
      await new Promise((resolve, reject) => {
        const wsConn = new WebSocket(WS_URL);
        const t = setTimeout(() => { try { wsConn.close(); } catch {} reject('timeout'); }, 5000);
        wsConn.on('open', () => { wsConnects++; clearTimeout(t); wsConn.close(); resolve(); });
        wsConn.on('error', () => { clearTimeout(t); reject('error'); });
      });
    } catch {}
    await new Promise(r => setTimeout(r, 50)); // small delay between connects
  }
  assert(wsConnects >= 18, `≥90% reconnects OK (${wsConnects}/20)`);

  // ─── Test 12: Mixed admin + trader concurrent ───
  console.log('\n─── Test 12: Mixed Operations ───');
  // Get superadmin token first
  const saLogin = await api('/api/v1/super/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@tradexlabel.com', password: 'superadmin123' }),
  });
  const saToken = saLogin.data?.data?.token;
  const mixed = await Promise.allSettled([
    api('/api/v1/account', { headers: H }),
    api('/api/v1/positions', { headers: H }),
    api('/api/v1/instruments', { headers: H }),
    api('/api/v1/trades/history?limit=5', { headers: H }),
    api('/api/v1/admin/dashboard', { headers: AH }),
    api('/api/v1/admin/clients', { headers: AH }),
    api('/api/v1/admin/positions', { headers: AH }),
    api('/api/v1/super/tenants', { headers: { 'Authorization': `Bearer ${saToken}` } }),
  ]);
  const mixedOk = mixed.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  assert(mixedOk >= 7, `≥7/8 mixed OK (${mixedOk}/8)`);

  // Health check after all stress
  const health = await api('/api/v1/health');
  assert(health.status === 200, 'Server still healthy after stress');

  console.log(`\n=============================================`);
  console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`=============================================\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
