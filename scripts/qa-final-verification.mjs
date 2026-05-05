/**
 * QA Step 8 — Final Shareholder Verification
 * Full demo walkthrough: login → trade → close → admin → dealer → superadmin
 */
const BASE = 'http://localhost:5500';
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
  console.log('\n==============================================');
  console.log('  QA STEP 8: FINAL SHAREHOLDER VERIFICATION');
  console.log('==============================================\n');

  // ─── 1. Platform Health ───
  console.log('─── 1. Platform Health Check ───');
  const health = await api('/api/v1/health');
  assert(health.status === 200, `Health endpoint OK (${health.status})`);

  // ─── 2. Client Login Flow ───
  console.log('\n─── 2. Client Login Flow ───');
  const login = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'trader123' }),
  });
  assert(login.status === 200, `Client login (${login.status})`);
  const token = login.data?.data?.token;
  const refreshToken = login.data?.data?.refreshToken;
  assert(!!token, 'JWT token received');
  assert(!!refreshToken, 'Refresh token received');
  const H = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID };

  // ─── 3. Account Overview ───
  console.log('\n─── 3. Account Overview ───');
  const acct = (await api('/api/v1/account', { headers: H })).data?.data;
  assert(!!acct, 'Account data retrieved');
  assert(Number(acct?.balance) > 0, `Balance positive ($${(Number(acct?.balance)/100).toFixed(2)})`);
  assert(acct?.currency === 'USD', `Currency is USD`);

  // ─── 4. Instruments Available ───
  console.log('\n─── 4. Instruments Available ───');
  const instruments = (await api('/api/v1/instruments', { headers: H })).data?.data || [];
  assert(instruments.length >= 10, `≥10 instruments (${instruments.length})`);

  const categories = new Set(instruments.map(i => i.type));
  assert(categories.has('FOREX'), 'Has FOREX instruments');
  assert(categories.has('CRYPTO'), 'Has CRYPTO instruments');

  const eurusd = instruments.find(i => i.symbol === 'EURUSD');
  assert(!!eurusd, 'EUR/USD available');
  assert(eurusd?.pip_size > 0, 'EUR/USD has pip_size');

  // ─── 5. Real-time Prices (WebSocket) ───
  console.log('\n─── 5. Real-time Prices ───');
  const { default: WebSocket } = await import('ws');
  const priceData = await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:5500/ws/prices');
    const prices = {};
    const timeout = setTimeout(() => { ws.close(); resolve(prices); }, 6000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD', 'BTCUSD', 'XAUUSD'] }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'tick' && msg.data?.symbol) {
          prices[msg.data.symbol] = msg.data;
        }
      } catch {}
    });
    ws.on('error', () => { clearTimeout(timeout); resolve(prices); });
  });
  const priceSymbols = Object.keys(priceData);
  assert(priceSymbols.length >= 2, `≥2 symbols with prices (${priceSymbols.join(', ')})`);
  for (const sym of priceSymbols) {
    const p = priceData[sym];
    assert(p.bid > 0 && p.ask > 0, `${sym}: bid=${p.bid}, ask=${p.ask}`);
    assert(p.ask > p.bid, `${sym}: spread positive (${(p.ask - p.bid).toFixed(5)})`);
  }

  // ─── 6. Full Trade Lifecycle ───
  console.log('\n─── 6. Full Trade Lifecycle ───');
  const balBefore = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  // Open
  const order = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.1, type: 'MARKET' }),
  });
  assert(order.status === 201, `Market order executed (${order.status})`);
  const tradeId = order.data?.data?.trade?.id;
  assert(!!tradeId, `Trade ID returned (${tradeId?.substring(0, 8)}...)`);

  // Position visible
  const positions = (await api('/api/v1/positions', { headers: H })).data?.data || [];
  const myPos = positions.find(p => p.id === tradeId);
  assert(!!myPos, 'Position visible in list');
  assert(myPos?.open_price > 0, `Open price set (${myPos?.open_price})`);

  // Close
  const close = await api(`/api/v1/positions/${tradeId}/close`, {
    method: 'POST', headers: H, body: '{}',
  });
  assert(close.status === 200, `Position closed (${close.status})`);
  assert(close.data?.data?.status === 'CLOSED', 'Status is CLOSED');
  const pnl = Number(close.data?.data?.pnl);
  assert(typeof pnl === 'number' && !isNaN(pnl), `P&L calculated (${pnl} cents)`);

  // Balance reflects P&L
  const balAfter = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  assert(Math.abs(balAfter - (balBefore + pnl)) <= 1, `Balance = before + P&L`);

  // ─── 7. Trade History ───
  console.log('\n─── 7. Trade History ───');
  const history = (await api('/api/v1/trades/history?limit=5', { headers: H })).data?.data || [];
  assert(history.length > 0, `History has entries (${history.length})`);
  assert(history[0]?.pnl !== undefined, 'History includes P&L');
  assert(history[0]?.close_price > 0, 'History includes close_price');

  // ─── 8. Admin Dashboard ───
  console.log('\n─── 8. Admin Dashboard ───');
  const adminLogin = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'dealer123', tenant_id: TENANT_ID }),
  });
  assert(adminLogin.status === 200, `Admin login (${adminLogin.status})`);
  const adminToken = adminLogin.data?.data?.token;
  const AH = { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-ID': TENANT_ID };

  const dashboard = (await api('/api/v1/admin/dashboard', { headers: AH })).data?.data;
  assert(!!dashboard, 'Dashboard data retrieved');
  assert(dashboard?.total_users > 0, `Total users: ${dashboard?.total_users}`);
  assert(dashboard?.total_accounts > 0, `Total accounts: ${dashboard?.total_accounts}`);

  const clients = (await api('/api/v1/admin/clients', { headers: AH })).data?.data || [];
  assert(clients.length > 0, `Client list (${clients.length} clients)`);

  // ─── 9. Dealer Operations ───
  console.log('\n─── 9. Dealer Operations ───');
  const dealerTrade = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({
      user_id: 'ead77af7-16b1-434c-a6a7-3b607d1ef2e2',
      symbol: 'EURUSD', side: 'BUY', volume: 0.01,
      invest_amount: 25000, pnl_target: 5000,
      close_after_seconds: 3600, reason: 'Shareholder demo',
    }),
  });
  assert([200, 201].includes(dealerTrade.status), `Dealer trade created (${dealerTrade.status})`);
  const dtId = dealerTrade.data?.data?.id;

  if (dtId) {
    const closeDT = await api(`/api/v1/dealer/close-trade/${dtId}`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ pnl: 5000, reason: 'Demo close' }),
    });
    assert(closeDT.status === 200, `Dealer trade closed (${closeDT.status})`);
  }

  // ─── 10. SuperAdmin ───
  console.log('\n─── 10. SuperAdmin ───');
  const saLogin = await api('/api/v1/super/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@tradexlabel.com', password: 'superadmin123' }),
  });
  assert(saLogin.status === 200, `SuperAdmin login (${saLogin.status})`);
  const saToken = saLogin.data?.data?.token;
  const SAH = { 'Authorization': `Bearer ${saToken}` };

  const tenants = (await api('/api/v1/super/tenants', { headers: SAH })).data?.data || [];
  assert(tenants.length > 0, `Tenants list (${tenants.length})`);
  assert(tenants[0]?.name, `Tenant has name (${tenants[0]?.name})`);

  // ─── 11. Security Checks ───
  console.log('\n─── 11. Security Checks ───');
  const noAuth = await api('/api/v1/positions', { headers: { 'X-Tenant-ID': TENANT_ID } });
  assert(noAuth.status === 401, `Positions require auth (${noAuth.status})`);

  const wrongTenant = await api('/api/v1/account', {
    headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': '00000000-0000-0000-0000-000000000000' },
  });
  assert(wrongTenant.status >= 400, `Wrong tenant rejected (${wrongTenant.status})`);

  // ─── 12. Data Integrity ───
  console.log('\n─── 12. Data Integrity ───');
  const finalAcct = (await api('/api/v1/account', { headers: H })).data?.data;
  assert(Number(finalAcct?.balance) > 0, 'Balance still positive');
  assert(Number(finalAcct?.equity) > 0, 'Equity positive');

  const finalPositions = (await api('/api/v1/positions', { headers: H })).data?.data || [];
  for (const p of finalPositions) {
    assert(p.status === 'OPEN', `Position ${p.id?.substring(0,8)} is OPEN`);
    assert(p.volume > 0, `Position has volume`);
  }

  // ─── 13. Frontend Availability ───
  console.log('\n─── 13. Frontend Availability ───');
  for (const [path, label] of [['/', 'Trading'], ['/admin', 'Admin'], ['/dealer', 'Dealer'], ['/superadmin', 'SuperAdmin']]) {
    try {
      const res = await fetch(`http://localhost:5501${path}`, { redirect: 'follow' });
      assert(res.status === 200, `${label} page loads (${res.status})`);
    } catch (e) {
      assert(false, `${label} page loads (error: ${e.message})`);
    }
  }

  console.log(`\n==============================================`);
  console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`==============================================\n`);

  if (failCount === 0) {
    console.log('  🎉 PLATFORM READY FOR SHAREHOLDER PRESENTATION');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
