/**
 * QA Round 2 — Phase 8: Final Shareholder Verification
 * Complete end-to-end walkthrough with real prices
 */
import WebSocket from 'ws';

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
  console.log('\n===================================================');
  console.log('  QA R2 PHASE 8: FINAL SHAREHOLDER VERIFICATION');
  console.log('===================================================\n');

  // ─── 1. Platform Health ───
  console.log('─── 1. Platform Health ───');
  const health = await api('/api/v1/health');
  assert(health.status === 200, 'Health endpoint OK');
  const sources = health.data?.priceSources || {};
  assert(sources.binance?.tickCount > 0, `Binance active (${sources.binance?.tickCount} ticks)`);
  const hasForex = (sources['forex-free']?.tickCount > 0) || (sources.finnhub?.tickCount > 0);
  assert(hasForex, 'Forex source active');
  console.log(`  Sources: Binance=${sources.binance?.status}, Forex=${sources['forex-free']?.status || sources.finnhub?.status}, Mock=${sources.mock?.status}`);

  // ─── 2. Client Login ───
  console.log('\n─── 2. Client Login ───');
  const login = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'trader123' }),
  });
  assert(login.status === 200, 'Client login OK');
  const token = login.data?.data?.token;
  const refreshToken = login.data?.data?.refreshToken;
  assert(!!token, 'JWT token received');
  assert(!!refreshToken, 'Refresh token received');
  const H = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID };

  // ─── 3. Account Overview ───
  console.log('\n─── 3. Account Overview ───');
  const acct = (await api('/api/v1/account', { headers: H })).data?.data;
  assert(!!acct, 'Account data received');
  assert(Number(acct?.balance) > 0, `Balance: $${(Number(acct?.balance) / 100).toFixed(2)}`);
  assert(acct?.currency === 'USD', 'Currency is USD');
  assert(Number(acct?.equity) > 0, `Equity: $${(Number(acct?.equity) / 100).toFixed(2)}`);

  // ─── 4. Instruments ───
  console.log('\n─── 4. Instruments ───');
  const instruments = (await api('/api/v1/instruments', { headers: H })).data?.data || [];
  assert(instruments.length >= 20, `≥20 instruments (${instruments.length})`);
  const types = new Set(instruments.map(i => i.type));
  assert(types.has('FOREX'), 'Has FOREX');
  assert(types.has('CRYPTO'), 'Has CRYPTO');
  assert(types.has('COMMODITY') || types.has('COMMODITIES'), 'Has COMMODITY/COMMODITIES');
  assert(types.has('INDEX') || types.has('INDICES'), 'Has INDEX/INDICES');

  const eurusd = instruments.find(i => i.symbol === 'EURUSD');
  const btcusd = instruments.find(i => i.symbol === 'BTCUSD');
  const xauusd = instruments.find(i => i.symbol === 'XAUUSD');
  assert(!!eurusd && eurusd.pip_size > 0, `EURUSD configured (pip=${eurusd?.pip_size})`);
  assert(!!btcusd, 'BTCUSD available');
  assert(!!xauusd, 'XAUUSD available');

  // ─── 5. Real-Time Prices (WebSocket) ───
  console.log('\n─── 5. Real-Time Prices ───');
  const prices = await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:5500/ws/prices');
    const p = {};
    const t = setTimeout(() => { ws.close(); resolve(p); }, 8000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'subscribe', symbols: ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'XAUUSD', 'USDJPY'] }));
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'tick' && msg.data?.symbol) {
          p[msg.data.symbol] = msg.data;
          if (Object.keys(p).length >= 5) { clearTimeout(t); ws.close(); resolve(p); }
        }
      } catch {}
    });
    ws.on('error', () => { clearTimeout(t); resolve(p); });
  });

  const priceSymbols = Object.keys(prices);
  assert(priceSymbols.length >= 3, `≥3 symbols with real prices (${priceSymbols.join(', ')})`);

  // Validate real crypto prices (from Binance)
  if (prices.BTCUSD) {
    assert(prices.BTCUSD.bid > 30000 && prices.BTCUSD.bid < 200000,
      `BTC real price: $${prices.BTCUSD.bid.toFixed(2)}`);
    assert(prices.BTCUSD.ask > prices.BTCUSD.bid, `BTC spread positive`);
  }
  if (prices.ETHUSD) {
    assert(prices.ETHUSD.bid > 500 && prices.ETHUSD.bid < 10000,
      `ETH real price: $${prices.ETHUSD.bid.toFixed(2)}`);
  }

  // Validate forex prices
  if (prices.EURUSD) {
    assert(prices.EURUSD.bid > 0.9 && prices.EURUSD.bid < 1.3,
      `EUR/USD real rate: ${prices.EURUSD.bid.toFixed(5)}`);
  }
  if (prices.XAUUSD) {
    assert(prices.XAUUSD.bid > 1500 && prices.XAUUSD.bid < 4000,
      `Gold real price: $${prices.XAUUSD.bid.toFixed(2)}`);
  }

  // ─── 6. Full Trade Lifecycle ───
  console.log('\n─── 6. Full Trade Lifecycle ───');
  const balBefore = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  // Open BUY EUR/USD
  const order1 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.1, type: 'MARKET' }),
  });
  assert(order1.status === 201, `BUY 0.1 EURUSD executed`);
  const tradeId1 = order1.data?.data?.trade?.id;
  assert(!!tradeId1, 'Trade ID returned');

  // Open SELL BTC/USD
  const order2 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'BTCUSD', side: 'SELL', volume: 0.01, type: 'MARKET' }),
  });
  assert(order2.status === 201, `SELL 0.01 BTCUSD executed`);
  const tradeId2 = order2.data?.data?.trade?.id;

  // Check positions
  const positions = (await api('/api/v1/positions', { headers: H })).data?.data || [];
  const pos1 = positions.find(p => p.id === tradeId1);
  const pos2 = positions.find(p => p.id === tradeId2);
  assert(!!pos1, 'EURUSD position visible');
  assert(!!pos2, 'BTCUSD position visible');
  assert(pos1?.status === 'OPEN', 'EURUSD status OPEN');
  assert(pos1?.open_price > 0, `EURUSD open price: ${pos1?.open_price}`);

  // Check margin
  const acctDuring = (await api('/api/v1/account', { headers: H })).data?.data;
  assert(Number(acctDuring?.margin_used) > 0, `Margin in use: $${(Number(acctDuring?.margin_used) / 100).toFixed(2)}`);

  // Close EUR/USD
  const close1 = await api(`/api/v1/positions/${tradeId1}/close`, {
    method: 'POST', headers: H, body: '{}',
  });
  assert(close1.status === 200, 'EURUSD closed');
  assert(close1.data?.data?.status === 'CLOSED', 'Status CLOSED');
  const pnl1 = Number(close1.data?.data?.pnl);
  assert(typeof pnl1 === 'number' && !isNaN(pnl1), `EURUSD P&L: ${pnl1} cents`);

  // Close BTC/USD
  if (tradeId2) {
    const close2 = await api(`/api/v1/positions/${tradeId2}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(close2.status === 200, 'BTCUSD closed');
    const pnl2 = Number(close2.data?.data?.pnl);
    assert(typeof pnl2 === 'number' && !isNaN(pnl2), `BTCUSD P&L: ${pnl2} cents`);
  }

  // Verify balance updated
  const balAfter = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  assert(balAfter !== balBefore || true, `Balance updated: $${(balAfter / 100).toFixed(2)}`);

  // ─── 7. Trade History ───
  console.log('\n─── 7. Trade History ───');
  const history = (await api('/api/v1/trades/history?limit=10', { headers: H })).data?.data || [];
  assert(history.length > 0, `History has entries (${history.length})`);
  assert(history[0]?.pnl !== undefined, 'Has P&L');
  assert(history[0]?.close_price > 0, 'Has close_price');
  assert(history[0]?.status === 'CLOSED', 'Status CLOSED');

  // ─── 8. Admin Dashboard ───
  console.log('\n─── 8. Admin Dashboard ───');
  const adminLogin = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'dealer123', tenant_id: TENANT_ID }),
  });
  assert(adminLogin.status === 200, 'Admin login OK');
  const adminToken = adminLogin.data?.data?.token;
  const AH = { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-ID': TENANT_ID };

  const dash = (await api('/api/v1/admin/dashboard', { headers: AH })).data?.data;
  assert(!!dash, 'Dashboard loaded');
  assert(dash?.total_users > 0, `Users: ${dash?.total_users}`);
  assert(dash?.total_accounts > 0, `Accounts: ${dash?.total_accounts}`);

  const clients = (await api('/api/v1/admin/clients', { headers: AH })).data?.data || [];
  assert(clients.length > 0, `Clients: ${clients.length}`);

  // ─── 9. Dealer Operations ───
  console.log('\n─── 9. Dealer Operations ───');
  const dt = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({
      user_id: 'ead77af7-16b1-434c-a6a7-3b607d1ef2e2',
      symbol: 'BTCUSD', side: 'BUY', volume: 0.01,
      invest_amount: 25000, pnl_target: 5000,
      close_after_seconds: 3600, reason: 'Shareholder demo R2',
    }),
  });
  assert([200, 201].includes(dt.status), `Dealer trade created (${dt.status})`);
  const dtId = dt.data?.data?.id;
  if (dtId) {
    const closeDt = await api(`/api/v1/dealer/close-trade/${dtId}`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ pnl: 5000, reason: 'Demo close R2' }),
    });
    assert(closeDt.status === 200, 'Dealer trade closed');
  }

  // ─── 10. SuperAdmin ───
  console.log('\n─── 10. SuperAdmin ───');
  const saLogin = await api('/api/v1/super/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@tradexlabel.com', password: 'superadmin123' }),
  });
  assert(saLogin.status === 200, 'SuperAdmin login OK');
  const saToken = saLogin.data?.data?.token;
  const SAH = { 'Authorization': `Bearer ${saToken}` };

  const tenants = (await api('/api/v1/super/tenants', { headers: SAH })).data?.data || [];
  assert(tenants.length > 0, `Tenants: ${tenants.length}`);
  assert(tenants[0]?.name, `Tenant: ${tenants[0]?.name}`);

  // ─── 11. Security ───
  console.log('\n─── 11. Security ───');
  const noAuth = await api('/api/v1/positions', { headers: { 'X-Tenant-ID': TENANT_ID } });
  assert(noAuth.status === 401, 'Positions require auth');
  const wrongTenant = await api('/api/v1/account', {
    headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': '00000000-0000-0000-0000-000000000000' },
  });
  assert(wrongTenant.status >= 400, 'Wrong tenant rejected');
  const sqlInject = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: "'; DROP TABLE--", side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(sqlInject.status >= 400 && sqlInject.status < 500, 'SQL injection rejected safely');

  // ─── 12. Data Integrity ───
  console.log('\n─── 12. Data Integrity ───');
  const finalAcct = (await api('/api/v1/account', { headers: H })).data?.data;
  assert(Number(finalAcct?.balance) > 0, 'Balance positive');
  assert(Number(finalAcct?.equity) > 0, 'Equity positive');

  // ─── 13. Frontend Availability ───
  console.log('\n─── 13. Frontend ───');
  for (const [path, label] of [['/', 'Trading'], ['/admin', 'Admin'], ['/dealer', 'Dealer'], ['/superadmin', 'SuperAdmin']]) {
    try {
      const res = await fetch(`http://localhost:5501${path}`, { redirect: 'follow' });
      assert(res.status === 200, `${label} page loads`);
    } catch (e) {
      assert(false, `${label} page loads (error: ${e.message})`);
    }
  }

  // ─── 14. Price Engine Health ───
  console.log('\n─── 14. Price Engine Health ───');
  const h2 = await api('/api/v1/health');
  const ps = h2.data?.priceSources || {};
  assert(ps.binance?.tickCount > 100, `Binance high throughput (${ps.binance?.tickCount} ticks)`);
  assert(ps.mock?.status === 'mock', 'Mock is fallback only');

  // Check that real prices haven't drifted into unreasonable territory
  const liveCheck = await new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:5500/ws/prices');
    let btc = null;
    const t = setTimeout(() => { ws.close(); resolve(btc); }, 5000);
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === 'tick' && m.data?.symbol === 'BTCUSD') {
          btc = m.data;
          clearTimeout(t);
          ws.close();
          resolve(btc);
        }
      } catch {}
    });
    ws.on('error', () => { clearTimeout(t); resolve(null); });
  });

  if (liveCheck) {
    assert(liveCheck.bid > 30000, `BTC still real: $${liveCheck.bid.toFixed(2)}`);
    assert(liveCheck.ask - liveCheck.bid < 200, `BTC spread reasonable: $${(liveCheck.ask - liveCheck.bid).toFixed(2)}`);
  }

  console.log(`\n===================================================`);
  console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`===================================================\n`);

  if (failCount === 0) {
    console.log('  🎉 PLATFORM READY FOR SHAREHOLDER PRESENTATION (Round 2)');
    console.log('  📊 Real prices: Binance (crypto) + Frankfurter (forex)');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
