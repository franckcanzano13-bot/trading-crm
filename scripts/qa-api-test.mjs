/**
 * QA Step 3 — Exhaustive API Endpoint Testing
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
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function run() {
  console.log('\n========================================');
  console.log('  QA STEP 3: API ENDPOINTS EXHAUSTIVE');
  console.log('========================================\n');

  // ─── Auth ───
  console.log('─── AUTH ───');

  const regEmail = `qa_${Date.now()}@test.com`;
  const register = await api('/api/v1/auth/register', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: regEmail, password: 'Test123456!', name: 'QA User' }),
  });
  assert(register.status === 201, `Register new user => 201 (${register.status})`);

  const regDup = await api('/api/v1/auth/register', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: regEmail, password: 'Test123456!', name: 'Dup' }),
  });
  assert(regDup.status === 409, `Register duplicate => 409 (${regDup.status})`);

  const regBad = await api('/api/v1/auth/register', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'bademail', password: 'Test123456!', name: 'Bad' }),
  });
  assert(regBad.status === 400, `Register bad email => 400 (${regBad.status})`);

  const login = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'trader123' }),
  });
  assert(login.status === 200, `Login valid => 200`);
  const token = login.data?.data?.token;
  const refreshToken = login.data?.data?.refreshToken;
  assert(!!token, 'Login returns access token');
  assert(!!refreshToken, 'Login returns refresh token');

  const loginBad = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'wrong' }),
  });
  assert(loginBad.status === 401, `Login bad password => 401 (${loginBad.status})`);

  const refresh = await api('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${refreshToken}` },
    body: '{}',
  });
  assert(refresh.status === 200, `Refresh token => 200 (${refresh.status})`);
  assert(!!refresh.data?.data?.token, 'Refresh returns new token');

  const me = await api('/api/v1/auth/me', {
    headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(me.status === 200, `GET /auth/me => 200`);
  assert(me.data?.data?.user?.email === 'emma.thompson@hotmail.com', 'Returns correct user email');

  const meNoAuth = await api('/api/v1/auth/me', { headers: { 'X-Tenant-ID': TENANT_ID } });
  assert(meNoAuth.status === 401, `GET /auth/me no token => 401 (${meNoAuth.status})`);

  const H = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID };

  // ─── Instruments ───
  console.log('\n─── INSTRUMENTS ───');

  const instruments = await api('/api/v1/instruments', { headers: H });
  assert(instruments.status === 200, 'GET /instruments => 200');
  const instList = instruments.data?.data || [];
  assert(instList.length === 23, `23 instruments (${instList.length})`);

  const inst0 = instList[0];
  assert(!!inst0.symbol, 'Instrument has symbol');
  assert(!!inst0.display_name, 'Instrument has display_name');
  assert(inst0.pip_size > 0, 'Instrument has pip_size > 0');
  assert(inst0.lot_size > 0, 'Instrument has lot_size > 0');

  // ─── Trading ───
  console.log('\n─── TRADING ───');

  const buyOrder = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(buyOrder.status === 201, `BUY EURUSD MARKET => 201 (${buyOrder.status})`);
  const buyTradeId = buyOrder.data?.data?.trade?.id || buyOrder.data?.data?.id;
  assert(!!buyTradeId, `Trade ID returned (${buyTradeId?.substring(0, 8)})`);

  const positions = await api('/api/v1/positions', { headers: H });
  assert(positions.status === 200, 'GET /positions => 200');
  const posList = positions.data?.data || [];
  assert(posList.length > 0, `At least 1 open position (${posList.length})`);

  if (buyTradeId) {
    const close = await api(`/api/v1/positions/${buyTradeId}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(close.status === 200, `Close position => 200 (${close.status})`);
    assert(close.data?.data?.status === 'CLOSED', 'Position status CLOSED');
  }

  const closeGhost = await api('/api/v1/positions/00000000-0000-0000-0000-000000000000/close', {
    method: 'POST', headers: H, body: '{}',
  });
  assert(closeGhost.status === 404, `Close non-existent => 404 (${closeGhost.status})`);

  // Bad symbol — validation rejects before lookup, so 400 is correct
  const badSymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'FAKEUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(badSymbol.status === 400 || badSymbol.status === 404, `Bad symbol rejected (${badSymbol.status})`);

  // SELL order
  const sellOrder = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'BTCUSD', side: 'SELL', volume: 0.01, type: 'MARKET' }),
  });
  assert(sellOrder.status === 201, `SELL BTCUSD => 201 (${sellOrder.status})`);
  const sellTradeId = sellOrder.data?.data?.trade?.id || sellOrder.data?.data?.id;
  if (sellTradeId) {
    await api(`/api/v1/positions/${sellTradeId}/close`, { method: 'POST', headers: H, body: '{}' });
  }

  const history = await api('/api/v1/trades/history', { headers: H });
  assert(history.status === 200, 'GET /trades/history => 200');
  assert(Array.isArray(history.data?.data), 'History is array');
  assert(history.data?.data?.length > 0, `History has trades (${history.data?.data?.length})`);

  // ─── Account ───
  console.log('\n─── ACCOUNT ───');

  const account = await api('/api/v1/account', { headers: H });
  assert(account.status === 200, 'GET /account => 200');
  const acct = account.data?.data;
  assert(acct?.balance !== undefined, 'Has balance');
  assert(acct?.equity !== undefined, 'Has equity');
  assert(acct?.margin_used !== undefined, 'Has margin_used');

  const transactions = await api('/api/v1/account/transactions', { headers: H });
  assert(transactions.status === 200, 'GET /account/transactions => 200');
  assert(Array.isArray(transactions.data?.data), 'Transactions is array');

  // ─── Admin ───
  console.log('\n─── ADMIN ───');

  const adminLogin = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'dealer123', tenant_id: TENANT_ID }),
  });
  assert(adminLogin.status === 200, 'Admin login => 200');
  const adminToken = adminLogin.data?.data?.token;
  const AH = { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-ID': TENANT_ID };

  const dashboard = await api('/api/v1/admin/dashboard', { headers: AH });
  assert(dashboard.status === 200, 'GET /admin/dashboard => 200');
  assert(dashboard.data?.data?.total_users !== undefined, 'Dashboard has total_users');
  assert(dashboard.data?.data?.total_balance_cents !== undefined, 'Dashboard has total_balance_cents');

  const clients = await api('/api/v1/admin/clients', { headers: AH });
  assert(clients.status === 200, 'GET /admin/clients => 200');
  assert(Array.isArray(clients.data?.data), 'Clients is array');
  assert(clients.data?.data?.length > 0, 'Has clients');

  const emmaAccountId = '8fe3655e-4bdc-4d04-8c8f-54d180093db4';
  const balBefore = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  const deposit = await api(`/api/v1/admin/accounts/${emmaAccountId}/deposit`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }),
  });
  assert(deposit.status === 200, `Deposit $1 => 200`);
  const balAfter = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  assert(balAfter > balBefore, `Balance increased (${balBefore} -> ${balAfter})`);

  const withdraw = await api(`/api/v1/admin/accounts/${emmaAccountId}/withdraw`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }),
  });
  assert(withdraw.status === 200, `Withdraw $1 => 200`);

  const adminInst = await api('/api/v1/admin/instruments', { headers: AH });
  assert(adminInst.status === 200, 'GET /admin/instruments => 200');

  // Update instrument spread
  const firstInst = (adminInst.data?.data || [])[0];
  if (firstInst) {
    const patchInst = await api(`/api/v1/admin/instruments/${firstInst.id}`, {
      method: 'PATCH', headers: AH,
      body: JSON.stringify({ spread_markup: 2.0 }),
    });
    assert(patchInst.status === 200, `PATCH instrument spread => 200 (${patchInst.status})`);
  }

  const adminPos = await api('/api/v1/admin/positions', { headers: AH });
  assert(adminPos.status === 200, 'GET /admin/positions => 200');

  const adminTrades = await api('/api/v1/admin/trades', { headers: AH });
  assert(adminTrades.status === 200, 'GET /admin/trades => 200');

  const adminTx = await api('/api/v1/admin/transactions', { headers: AH });
  assert(adminTx.status === 200, 'GET /admin/transactions => 200');

  // Update client status
  const firstClient = (clients.data?.data || [])[0];
  if (firstClient) {
    const patchClient = await api(`/api/v1/admin/clients/${firstClient.id}`, {
      method: 'PATCH', headers: AH,
      body: JSON.stringify({ status: firstClient.status }),
    });
    assert(patchClient.status === 200, `PATCH client => 200 (${patchClient.status})`);
  }

  // ─── Dealer ───
  console.log('\n─── DEALER ───');

  const dealerPos = await api('/api/v1/dealer/positions', { headers: AH });
  assert(dealerPos.status === 200, 'GET /dealer/positions => 200');

  const dealerClients = await api('/api/v1/dealer/clients', { headers: AH });
  assert(dealerClients.status === 200, 'GET /dealer/clients => 200');

  const dealerInterventions = await api('/api/v1/dealer/interventions', { headers: AH });
  assert(dealerInterventions.status === 200, 'GET /dealer/interventions => 200');

  const dealerSettings = await api('/api/v1/dealer/settings', { headers: AH });
  assert(dealerSettings.status === 200, 'GET /dealer/settings => 200');

  const dealerTrade = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({
      user_id: 'ead77af7-16b1-434c-a6a7-3b607d1ef2e2',
      symbol: 'EURUSD', side: 'BUY', volume: 0.01,
      invest_amount: 50000, pnl_target: 10000,
      close_after_seconds: 3600, reason: 'QA test',
    }),
  });
  assert([200, 201].includes(dealerTrade.status), `Dealer create-trade => ${dealerTrade.status}`);
  const dealerTradeId = dealerTrade.data?.data?.id;

  if (dealerTradeId) {
    // Intervene
    const intervene = await api(`/api/v1/dealer/intervene/${dealerTradeId}`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ action: 'SLIPPAGE', modified_price: 1.0855, reason: 'QA intervention' }),
    });
    assert(intervene.status === 200 || intervene.status === 201, `Dealer intervene => ${intervene.status}`);

    // Close
    const closeDT = await api(`/api/v1/dealer/close-trade/${dealerTradeId}`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ pnl: 5000, reason: 'QA close' }),
    });
    assert(closeDT.status === 200, `Dealer close-trade => 200 (${closeDT.status})`);
  }

  // ─── SuperAdmin ───
  console.log('\n─── SUPERADMIN ───');

  const superLogin = await api('/api/v1/super/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@tradexlabel.com', password: 'superadmin123' }),
  });
  assert(superLogin.status === 200, `Super login => 200 (${superLogin.status})`);
  const superToken = superLogin.data?.data?.token;
  const SH = { 'Authorization': `Bearer ${superToken}` };

  if (superToken) {
    const tenants = await api('/api/v1/super/tenants', { headers: SH });
    assert(tenants.status === 200, 'GET /super/tenants => 200');
    assert(Array.isArray(tenants.data?.data), 'Tenants is array');
    assert(tenants.data?.data?.length > 0, 'Has tenants');

    const monitoring = await api('/api/v1/super/monitoring', { headers: SH });
    assert(monitoring.status === 200, 'GET /super/monitoring => 200');
  } else {
    console.log('  ⚠ Skipping super endpoints (login failed)');
  }

  // ─── Security ───
  console.log('\n─── SECURITY ───');

  const userAsAdmin = await api('/api/v1/admin/dashboard', { headers: H });
  assert(userAsAdmin.status === 401 || userAsAdmin.status === 403, `User cannot access admin (${userAsAdmin.status})`);

  const userAsDealer = await api('/api/v1/dealer/positions', { headers: H });
  assert(userAsDealer.status === 401 || userAsDealer.status === 403, `User cannot access dealer (${userAsDealer.status})`);

  const sqlInj = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: "'; DROP TABLE users;--", password: 'x' }),
  });
  assert(sqlInj.status === 400 || sqlInj.status === 401, `SQL injection blocked (${sqlInj.status})`);

  // XSS in order
  const xssOrder = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: "<script>alert('xss')</script>", side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(xssOrder.status === 400 || xssOrder.status === 404, `XSS in order rejected (${xssOrder.status})`);

  const health = await api('/api/v1/health');
  assert(health.status === 200, `Health check => 200`);

  console.log(`\n========================================`);
  console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`========================================\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
