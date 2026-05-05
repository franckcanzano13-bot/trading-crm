/**
 * QA Step 7 — Stress Test
 * Load test API, WebSocket, DB, resilience, memory
 */
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
  console.log('\n==========================================');
  console.log('  QA STEP 7: STRESS TEST');
  console.log('==========================================\n');

  // Get token
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

  // ─── Test 1: API Concurrent Requests ───
  console.log('─── Test 1: API Concurrent Load (50 parallel requests) ───');
  const t1Start = Date.now();
  const concurrent = await Promise.allSettled(
    Array.from({ length: 50 }, () => api('/api/v1/account', { headers: H }))
  );
  const t1Duration = Date.now() - t1Start;
  const t1Success = concurrent.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  console.log(`  ${t1Success}/50 succeeded in ${t1Duration}ms`);
  assert(t1Success >= 45, `≥90% success rate (${t1Success}/50)`);
  assert(t1Duration < 10000, `Completed under 10s (${t1Duration}ms)`);

  // ─── Test 2: Rapid Sequential Requests ───
  console.log('\n─── Test 2: Rapid Sequential (100 requests) ───');
  const t2Start = Date.now();
  let t2Success = 0;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await api('/api/v1/instruments', { headers: H });
      if (r.status === 200) t2Success++;
    } catch {}
  }
  const t2Duration = Date.now() - t2Start;
  console.log(`  ${t2Success}/100 succeeded in ${t2Duration}ms`);
  assert(t2Success >= 90, `≥90% sequential success (${t2Success}/100)`);
  assert(t2Duration < 30000, `Sequential under 30s (${t2Duration}ms)`);

  // ─── Test 3: Concurrent Trade Execution ───
  console.log('\n─── Test 3: Concurrent Trade Execution (10 trades) ───');
  const t3Start = Date.now();
  const trades = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      api('/api/v1/orders', {
        method: 'POST', headers: H,
        body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
      })
    )
  );
  const t3Duration = Date.now() - t3Start;
  const t3Success = trades.filter(r => r.status === 'fulfilled' && r.value.status === 201).length;
  console.log(`  ${t3Success}/10 trades executed in ${t3Duration}ms`);
  assert(t3Success >= 8, `≥80% trades succeeded (${t3Success}/10)`);

  // Close all opened positions
  const openPos = (await api('/api/v1/positions', { headers: H })).data?.data || [];
  let closedCount = 0;
  for (const p of openPos) {
    try {
      const r = await api(`/api/v1/positions/${p.id}/close`, {
        method: 'POST', headers: H, body: '{}',
      });
      if (r.status === 200) closedCount++;
    } catch {}
  }
  console.log(`  Closed ${closedCount}/${openPos.length} positions`);
  assert(closedCount === openPos.length, `All positions closed (${closedCount}/${openPos.length})`);

  // ─── Test 4: WebSocket Stress ───
  console.log('\n─── Test 4: WebSocket Connections (5 simultaneous) ───');
  const { WebSocket } = await import('ws');
  const wsResults = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout')); }, 8000);
      const ws = new WebSocket(WS_URL);
      let msgCount = 0;
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD', 'BTCUSD'] }));
      });
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'tick' || msg.type === 'snapshot' || msg.data) {
            msgCount++;
          }
        } catch { msgCount++; }
        if (msgCount >= 3) { clearTimeout(timeout); ws.close(); resolve(msgCount); }
      });
      ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
    }))
  );
  const wsSuccess = wsResults.filter(r => r.status === 'fulfilled').length;
  console.log(`  ${wsSuccess}/5 WS connections received data`);
  assert(wsSuccess >= 4, `≥80% WS connections OK (${wsSuccess}/5)`);

  // ─── Test 5: WebSocket Message Throughput ───
  console.log('\n─── Test 5: WebSocket Throughput (10s collection) ───');
  const wsMsgCount = await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let count = 0;
    const timeout = setTimeout(() => { ws.close(); resolve(count); }, 10000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD', 'BTCUSD', 'ETHUSD', 'XAUUSD'] }));
    });
    ws.on('message', () => count++);
    ws.on('error', () => { clearTimeout(timeout); resolve(count); });
  });
  console.log(`  Received ${wsMsgCount} messages in 10s`);
  assert(wsMsgCount >= 5, `≥5 WS messages in 10s (${wsMsgCount})`);

  // ─── Test 6: Database Consistency Under Load ───
  console.log('\n─── Test 6: DB Consistency (deposit/withdraw cycle x10) ───');
  const emmaAcct = '8fe3655e-4bdc-4d04-8c8f-54d180093db4';
  const balBefore = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  for (let i = 0; i < 10; i++) {
    await api(`/api/v1/admin/accounts/${emmaAcct}/deposit`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ amount: 10 }), // $10
    });
    await api(`/api/v1/admin/accounts/${emmaAcct}/withdraw`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ amount: 10 }),
    });
  }

  const balAfter = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  const drift = Math.abs(balAfter - balBefore);
  console.log(`  Balance drift: ${drift} cents (before: ${balBefore}, after: ${balAfter})`);
  assert(drift === 0, `Zero balance drift after 10 cycles (drift: ${drift})`);

  // ─── Test 7: Large Payload Handling ───
  console.log('\n─── Test 7: Large Payload & Error Handling ───');
  const bigPayload = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET', extra: 'x'.repeat(10000) }),
  });
  assert([200, 201, 400].includes(bigPayload.status), `Large payload handled (${bigPayload.status})`);

  // Invalid data
  const invalid1 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'INVALIDXYZ', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(invalid1.status >= 400, `Invalid symbol rejected (${invalid1.status})`);

  const invalid2 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: -1, type: 'MARKET' }),
  });
  assert(invalid2.status >= 400, `Negative volume rejected (${invalid2.status})`);

  // ─── Test 8: Auth Resilience ───
  console.log('\n─── Test 8: Auth Resilience ───');
  const noAuth = await api('/api/v1/account', { headers: { 'X-Tenant-ID': TENANT_ID } });
  assert(noAuth.status === 401, `No token → 401 (${noAuth.status})`);

  const badToken = await api('/api/v1/account', {
    headers: { 'Authorization': 'Bearer invalidtoken123', 'X-Tenant-ID': TENANT_ID },
  });
  assert(badToken.status === 401, `Bad token → 401 (${badToken.status})`);

  const noTenant = await api('/api/v1/account', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert([400, 401, 403].includes(noTenant.status), `No tenant → error (${noTenant.status})`);

  // ─── Test 9: Memory / Response Time Stability ───
  console.log('\n─── Test 9: Response Time Stability ───');
  const times = [];
  for (let i = 0; i < 20; i++) {
    const s = Date.now();
    await api('/api/v1/account', { headers: H });
    times.push(Date.now() - s);
  }
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  console.log(`  Avg: ${avgTime.toFixed(0)}ms, Max: ${maxTime}ms`);
  assert(avgTime < 500, `Avg response < 500ms (${avgTime.toFixed(0)}ms)`);
  assert(maxTime < 2000, `Max response < 2s (${maxTime}ms)`);

  // ─── Test 10: Concurrent Admin + Trader ───
  console.log('\n─── Test 10: Concurrent Admin + Trader Operations ───');
  const mixed = await Promise.allSettled([
    api('/api/v1/account', { headers: H }),
    api('/api/v1/positions', { headers: H }),
    api('/api/v1/instruments', { headers: H }),
    api('/api/v1/admin/clients', { headers: AH }),
    api('/api/v1/admin/positions', { headers: AH }),
    api('/api/v1/instruments', { headers: AH }),
  ]);
  const mixedOk = mixed.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  assert(mixedOk >= 5, `≥5/6 mixed requests OK (${mixedOk}/6)`);

  console.log(`\n==========================================`);
  console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`==========================================\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
