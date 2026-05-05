/**
 * QA Round 2 — Comprehensive API Endpoint Testing (150+ assertions)
 *
 * Tests: Auth, Instruments, Trading, Account, Admin, Dealer, SuperAdmin,
 *        Validation, Auth Resilience, Security Headers
 *
 * Server: http://localhost:5500
 * Tenant: 944dc16d-ede5-4dff-81f5-839285b3229a
 */

const BASE = 'http://localhost:5500';
const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';
const EMMA_USER_ID = 'ead77af7-16b1-434c-a6a7-3b607d1ef2e2';
const EMMA_ACCOUNT_ID = '8fe3655e-4bdc-4d04-8c8f-54d180093db4';

let passCount = 0;
let failCount = 0;

/** Track trade IDs opened during tests so we can clean up at the end */
const openTradeIds = [];

function assert(condition, label) {
  if (condition) { passCount++; console.log(`  ✅ ${label}`); }
  else { failCount++; console.log(`  ❌ FAIL: ${label}`); }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, headers: res.headers };
}

async function run() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  QA ROUND 2: API ENDPOINTS (150+ tests) ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════════════════
  // 1. AUTH (15+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('══════ 1. AUTH ══════');

  // 1.1 Login success
  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'trader123' }),
  });
  assert(login.status === 200, `[AUTH-01] Login success => 200 (got ${login.status})`);
  const token = login.data?.data?.token;
  const refreshToken = login.data?.data?.refreshToken;
  assert(typeof token === 'string' && token.length > 0, '[AUTH-02] Token returned as non-empty string');
  assert(typeof refreshToken === 'string' && refreshToken.length > 0, '[AUTH-03] Refresh token returned as non-empty string');
  assert(login.data?.data?.user?.email === 'emma.thompson@hotmail.com', '[AUTH-04] Login returns correct user email');
  assert(login.data?.data?.user?.id === EMMA_USER_ID, '[AUTH-05] Login returns correct user id');
  assert(!!login.data?.data?.execution_mode, '[AUTH-06] Login returns execution_mode');

  // 1.2 Login wrong password
  const loginBadPwd = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'wrongpassword' }),
  });
  assert(loginBadPwd.status === 401, `[AUTH-07] Wrong password => 401 (got ${loginBadPwd.status})`);

  // 1.3 Login wrong email
  const loginBadEmail = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'nonexistent@test.com', password: 'trader123' }),
  });
  assert(loginBadEmail.status === 401, `[AUTH-08] Wrong email => 401 (got ${loginBadEmail.status})`);

  // 1.4 Login missing fields
  const loginNoFields = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({}),
  });
  assert(loginNoFields.status === 400, `[AUTH-09] Missing fields => 400 (got ${loginNoFields.status})`);

  const loginNoPassword = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com' }),
  });
  assert(loginNoPassword.status === 400, `[AUTH-10] Missing password => 400 (got ${loginNoPassword.status})`);

  // 1.5 Refresh token
  const refresh = await api('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${refreshToken}` },
    body: '{}',
  });
  assert(refresh.status === 200, `[AUTH-11] Refresh token => 200 (got ${refresh.status})`);
  assert(!!refresh.data?.data?.token, '[AUTH-12] Refresh returns new access token');
  assert(!!refresh.data?.data?.refreshToken, '[AUTH-13] Refresh returns new refresh token');

  // 1.6 GET /auth/me
  const H = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID };
  const me = await api('/api/v1/auth/me', { headers: H });
  assert(me.status === 200, `[AUTH-14] GET /auth/me => 200 (got ${me.status})`);
  assert(me.data?.data?.user?.email === 'emma.thompson@hotmail.com', '[AUTH-15] /me returns correct email');
  assert(me.data?.data?.user?.id === EMMA_USER_ID, '[AUTH-16] /me returns correct user id');
  assert(!!me.data?.data?.user?.name, '[AUTH-17] /me returns user name');
  assert(!!me.data?.data?.account, '[AUTH-18] /me returns account data');

  // 1.7 Access without token
  const noAuth = await api('/api/v1/auth/me', { headers: { 'X-Tenant-ID': TENANT_ID } });
  assert(noAuth.status === 401, `[AUTH-19] No token => 401 (got ${noAuth.status})`);

  // 1.8 Access with invalid token
  const badToken = await api('/api/v1/auth/me', {
    headers: { 'Authorization': 'Bearer invalid.token.here', 'X-Tenant-ID': TENANT_ID },
  });
  assert(badToken.status === 401, `[AUTH-20] Invalid token => 401 (got ${badToken.status})`);

  // 1.9 Access without X-Tenant-ID
  const noTenant = await api('/api/v1/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert(noTenant.status === 400 || noTenant.status === 401, `[AUTH-21] No X-Tenant-ID => 400/401 (got ${noTenant.status})`);

  // ═══════════════════════════════════════════════════════
  // 2. INSTRUMENTS (15+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 2. INSTRUMENTS ══════');

  const instruments = await api('/api/v1/instruments', { headers: H });
  assert(instruments.status === 200, `[INST-01] GET /instruments => 200 (got ${instruments.status})`);
  const instList = instruments.data?.data || [];
  assert(instList.length === 23, `[INST-02] 23 instruments returned (got ${instList.length})`);

  // Check each instrument has required fields
  const inst0 = instList[0];
  assert(!!inst0?.id, '[INST-03] Instrument has id');
  assert(!!inst0?.symbol, '[INST-04] Instrument has symbol');
  assert(!!inst0?.type, '[INST-05] Instrument has type');
  assert(inst0?.pip_size !== undefined && inst0?.pip_size > 0, '[INST-06] Instrument has pip_size > 0');
  assert(inst0?.lot_size !== undefined && inst0?.lot_size > 0, '[INST-07] Instrument has lot_size > 0');
  assert(inst0?.spread_markup !== undefined, '[INST-08] Instrument has spread_markup');

  // Filter by type counts
  const forexCount = instList.filter(i => i.type === 'FOREX').length;
  const cryptoCount = instList.filter(i => i.type === 'CRYPTO').length;
  const commoditiesCount = instList.filter(i => i.type === 'COMMODITY' || i.type === 'COMMODITIES').length;
  const indicesCount = instList.filter(i => i.type === 'INDEX' || i.type === 'INDICES').length;
  assert(forexCount > 0, `[INST-09] Has FOREX instruments (${forexCount})`);
  assert(cryptoCount > 0, `[INST-10] Has CRYPTO instruments (${cryptoCount})`);
  assert(commoditiesCount > 0, `[INST-11] Has COMMODITIES instruments (${commoditiesCount})`);
  assert(indicesCount > 0, `[INST-12] Has INDICES instruments (${indicesCount})`);
  assert(forexCount + cryptoCount + commoditiesCount + indicesCount === instList.length,
    `[INST-13] All instruments accounted for by type`);

  // Specific instruments exist
  const symbols = instList.map(i => i.symbol);
  assert(symbols.includes('EURUSD'), '[INST-14] EURUSD exists');
  assert(symbols.includes('BTCUSD'), '[INST-15] BTCUSD exists');
  assert(symbols.includes('XAUUSD'), '[INST-16] XAUUSD exists');
  assert(symbols.includes('US500'), '[INST-17] US500 exists');

  // Verify instrument field types
  const eurusd = instList.find(i => i.symbol === 'EURUSD');
  assert(typeof eurusd?.pip_size === 'number', '[INST-18] pip_size is number');
  assert(typeof eurusd?.lot_size === 'number', '[INST-19] lot_size is number');
  assert(typeof eurusd?.spread_markup === 'number', '[INST-20] spread_markup is number');

  // Candles endpoint
  const candles = await api('/api/v1/instruments/EURUSD/candles?timeframe=1h&limit=10', { headers: H });
  assert(candles.status === 200, `[INST-21] GET /instruments/EURUSD/candles => 200 (got ${candles.status})`);
  assert(Array.isArray(candles.data?.data), '[INST-22] Candles returns array');

  // Invalid instrument candles
  const badCandles = await api('/api/v1/instruments/FAKESYMBOL/candles', { headers: H });
  assert(badCandles.status === 404, `[INST-23] Candles for invalid symbol => 404 (got ${badCandles.status})`);

  // ═══════════════════════════════════════════════════════
  // 3. TRADING (30+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 3. TRADING ══════');

  // 3.1 Create BUY EURUSD MARKET
  const buy1 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(buy1.status === 201, `[TRADE-01] BUY EURUSD MARKET => 201 (got ${buy1.status})`);
  const buy1Trade = buy1.data?.data?.trade || buy1.data?.data;
  const buy1Id = buy1Trade?.id;
  assert(!!buy1Id, `[TRADE-02] Trade ID returned`);
  assert(buy1Trade?.status === 'OPEN', `[TRADE-03] Trade status === OPEN (got ${buy1Trade?.status})`);
  assert(buy1Trade?.side === 'BUY', `[TRADE-04] Trade side === BUY`);
  assert(buy1Trade?.volume === 0.01 || buy1Trade?.volume === '0.01', `[TRADE-05] Trade volume === 0.01`);
  if (buy1Id) openTradeIds.push(buy1Id);

  // 3.2 GET /positions — should see the position
  const positions1 = await api('/api/v1/positions', { headers: H });
  assert(positions1.status === 200, `[TRADE-06] GET /positions => 200`);
  const posList1 = positions1.data?.data || [];
  assert(posList1.length > 0, `[TRADE-07] At least 1 open position (${posList1.length})`);
  const foundBuy = posList1.find(p => p.id === buy1Id);
  assert(!!foundBuy, '[TRADE-08] Created position visible in positions list');

  // 3.3 Close position
  if (buy1Id) {
    const close1 = await api(`/api/v1/positions/${buy1Id}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(close1.status === 200, `[TRADE-09] Close position => 200 (got ${close1.status})`);
    assert(close1.data?.data?.status === 'CLOSED', `[TRADE-10] Position status CLOSED after close`);
    openTradeIds.splice(openTradeIds.indexOf(buy1Id), 1);
  }

  // 3.4 Create SELL order
  const sell1 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'BTCUSD', side: 'SELL', volume: 0.01, type: 'MARKET' }),
  });
  assert(sell1.status === 201, `[TRADE-11] SELL BTCUSD MARKET => 201 (got ${sell1.status})`);
  const sell1Trade = sell1.data?.data?.trade || sell1.data?.data;
  const sell1Id = sell1Trade?.id;
  assert(!!sell1Id, '[TRADE-12] SELL trade ID returned');
  assert(sell1Trade?.side === 'SELL', '[TRADE-13] SELL trade side === SELL');
  if (sell1Id) openTradeIds.push(sell1Id);

  // Close the SELL position
  if (sell1Id) {
    const closeSell = await api(`/api/v1/positions/${sell1Id}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(closeSell.status === 200, `[TRADE-14] Close SELL position => 200 (got ${closeSell.status})`);
    openTradeIds.splice(openTradeIds.indexOf(sell1Id), 1);
  }

  // 3.5 Invalid symbol
  const badSymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'FAKEUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(badSymbol.status === 400 || badSymbol.status === 404, `[TRADE-15] Invalid symbol => 400/404 (got ${badSymbol.status})`);

  // 3.6 Negative volume
  const negVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: -1, type: 'MARKET' }),
  });
  assert(negVol.status === 400, `[TRADE-16] Negative volume => 400 (got ${negVol.status})`);

  // 3.7 Zero volume
  const zeroVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0, type: 'MARKET' }),
  });
  assert(zeroVol.status === 400, `[TRADE-17] Zero volume => 400 (got ${zeroVol.status})`);

  // 3.8 Missing fields
  const noBody = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({}),
  });
  assert(noBody.status === 400, `[TRADE-18] Empty body => 400 (got ${noBody.status})`);

  const noSymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(noSymbol.status === 400, `[TRADE-19] Missing symbol => 400 (got ${noSymbol.status})`);

  const noSide = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', volume: 0.01, type: 'MARKET' }),
  });
  assert(noSide.status === 400, `[TRADE-20] Missing side => 400 (got ${noSide.status})`);

  const noVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', type: 'MARKET' }),
  });
  assert(noVol.status === 400, `[TRADE-21] Missing volume => 400 (got ${noVol.status})`);

  const noType = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01 }),
  });
  assert(noType.status === 400, `[TRADE-22] Missing type => 400 (got ${noType.status})`);

  // 3.9 Volume too large (9999)
  const hugeVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 9999, type: 'MARKET' }),
  });
  assert(hugeVol.status === 201 || hugeVol.status === 400, `[TRADE-23] Volume 9999 => 201 or 400 (got ${hugeVol.status})`);
  if (hugeVol.status === 201) {
    const hugeId = hugeVol.data?.data?.trade?.id || hugeVol.data?.data?.id;
    if (hugeId) {
      openTradeIds.push(hugeId);
      // Close it immediately
      await api(`/api/v1/positions/${hugeId}/close`, { method: 'POST', headers: H, body: '{}' });
      openTradeIds.splice(openTradeIds.indexOf(hugeId), 1);
    }
  }

  // 3.10 Double close same position — create, close, close again
  const buy2 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  const buy2Id = buy2.data?.data?.trade?.id || buy2.data?.data?.id;
  if (buy2Id) {
    await api(`/api/v1/positions/${buy2Id}/close`, { method: 'POST', headers: H, body: '{}' });
    const doubleClose = await api(`/api/v1/positions/${buy2Id}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(doubleClose.status === 404 || doubleClose.status === 409,
      `[TRADE-24] Double close => 404/409 (got ${doubleClose.status})`);
  } else {
    assert(false, '[TRADE-24] Could not test double close (trade creation failed)');
  }

  // 3.11 Close non-existent position
  const ghostClose = await api('/api/v1/positions/00000000-0000-0000-0000-000000000000/close', {
    method: 'POST', headers: H, body: '{}',
  });
  assert(ghostClose.status === 404, `[TRADE-25] Close non-existent => 404 (got ${ghostClose.status})`);

  // 3.12 GET /trades/history
  const history = await api('/api/v1/trades/history', { headers: H });
  assert(history.status === 200, `[TRADE-26] GET /trades/history => 200 (got ${history.status})`);
  assert(Array.isArray(history.data?.data), '[TRADE-27] History is array');
  assert(history.data?.data?.length > 0, `[TRADE-28] History has entries (${history.data?.data?.length})`);

  // 3.13 History with pagination params
  const historyPaged = await api('/api/v1/trades/history?limit=5&offset=0', { headers: H });
  assert(historyPaged.status === 200, `[TRADE-29] History with pagination => 200`);
  assert(Array.isArray(historyPaged.data?.data), '[TRADE-30] Paginated history is array');
  assert(historyPaged.data.data.length <= 5, `[TRADE-31] Paginated history respects limit (got ${historyPaged.data.data.length})`);

  // 3.14 Multiple instruments
  const buyGold = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'XAUUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(buyGold.status === 201, `[TRADE-32] BUY XAUUSD => 201 (got ${buyGold.status})`);
  const goldId = buyGold.data?.data?.trade?.id || buyGold.data?.data?.id;
  if (goldId) {
    openTradeIds.push(goldId);
    await api(`/api/v1/positions/${goldId}/close`, { method: 'POST', headers: H, body: '{}' });
    openTradeIds.splice(openTradeIds.indexOf(goldId), 1);
  }

  const buyIndex = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'US500', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(buyIndex.status === 201, `[TRADE-33] BUY US500 => 201 (got ${buyIndex.status})`);
  const indexId = buyIndex.data?.data?.trade?.id || buyIndex.data?.data?.id;
  if (indexId) {
    openTradeIds.push(indexId);
    await api(`/api/v1/positions/${indexId}/close`, { method: 'POST', headers: H, body: '{}' });
    openTradeIds.splice(openTradeIds.indexOf(indexId), 1);
  }

  // ═══════════════════════════════════════════════════════
  // 4. ACCOUNT (10+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 4. ACCOUNT ══════');

  const account = await api('/api/v1/account', { headers: H });
  assert(account.status === 200, `[ACCT-01] GET /account => 200 (got ${account.status})`);
  const acct = account.data?.data;
  assert(acct?.balance !== undefined, '[ACCT-02] Has balance field');
  assert(acct?.margin_used !== undefined, '[ACCT-03] Has margin_used field');
  assert(acct?.equity !== undefined, '[ACCT-04] Has equity field');
  assert(acct?.currency !== undefined, '[ACCT-05] Has currency field');
  assert(acct?.currency === 'USD', `[ACCT-06] Currency === USD (got ${acct?.currency})`);
  assert(Number(acct?.balance) > 0, `[ACCT-07] Balance > 0 (got ${acct?.balance})`);
  assert(!!acct?.id, '[ACCT-08] Account has id');
  assert(acct?.id === EMMA_ACCOUNT_ID, `[ACCT-09] Account ID matches expected`);
  assert(acct?.leverage !== undefined, `[ACCT-10] Account has leverage field`);

  // Transactions
  const tx = await api('/api/v1/account/transactions', { headers: H });
  assert(tx.status === 200, `[ACCT-11] GET /account/transactions => 200`);
  assert(Array.isArray(tx.data?.data), '[ACCT-12] Transactions is array');

  // ═══════════════════════════════════════════════════════
  // 5. ADMIN (30+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 5. ADMIN ══════');

  // Admin login
  const adminLogin = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'dealer123', tenant_id: TENANT_ID }),
  });
  assert(adminLogin.status === 200, `[ADMIN-01] Admin login => 200 (got ${adminLogin.status})`);
  const adminToken = adminLogin.data?.data?.token;
  assert(!!adminToken, '[ADMIN-02] Admin token returned');
  assert(!!adminLogin.data?.data?.refreshToken, '[ADMIN-03] Admin refresh token returned');
  assert(!!adminLogin.data?.data?.admin?.email, '[ADMIN-04] Admin email returned');
  assert(adminLogin.data?.data?.admin?.email === 'admin@dealer.com', '[ADMIN-05] Admin email matches');

  const AH = { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-ID': TENANT_ID };

  // Admin login wrong password
  const adminBadPwd = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'wrong', tenant_id: TENANT_ID }),
  });
  assert(adminBadPwd.status === 401, `[ADMIN-06] Admin wrong password => 401 (got ${adminBadPwd.status})`);

  // Admin login missing fields
  const adminNoFields = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(adminNoFields.status === 400, `[ADMIN-07] Admin missing fields => 400 (got ${adminNoFields.status})`);

  // Dashboard
  const dashboard = await api('/api/v1/admin/dashboard', { headers: AH });
  assert(dashboard.status === 200, `[ADMIN-08] GET /admin/dashboard => 200 (got ${dashboard.status})`);
  const dashData = dashboard.data?.data;
  assert(dashData?.total_users !== undefined, '[ADMIN-09] Dashboard has total_users');
  assert(dashData?.total_accounts !== undefined, '[ADMIN-10] Dashboard has total_accounts');
  assert(dashData?.total_volume !== undefined || dashData?.total_balance_cents !== undefined,
    '[ADMIN-11] Dashboard has total_volume or total_balance_cents');

  // Clients
  const clients = await api('/api/v1/admin/clients', { headers: AH });
  assert(clients.status === 200, `[ADMIN-12] GET /admin/clients => 200 (got ${clients.status})`);
  assert(Array.isArray(clients.data?.data), '[ADMIN-13] Clients is array');
  assert(clients.data?.data?.length > 0, `[ADMIN-14] Has clients (${clients.data?.data?.length})`);

  // Verify client data structure
  const client0 = clients.data?.data?.[0];
  assert(!!client0?.id, '[ADMIN-15] Client has id');
  assert(!!client0?.email, '[ADMIN-16] Client has email');

  // Deposit — get balance before
  const balBefore = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  const deposit = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/deposit`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }),
  });
  assert(deposit.status === 200, `[ADMIN-17] Deposit $100 => 200 (got ${deposit.status})`);
  const balAfterDeposit = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  assert(balAfterDeposit === balBefore + 10000, `[ADMIN-18] Balance increased by 10000 cents (${balBefore} -> ${balAfterDeposit})`);

  // Withdraw
  const withdraw = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/withdraw`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }),
  });
  assert(withdraw.status === 200, `[ADMIN-19] Withdraw $100 => 200 (got ${withdraw.status})`);
  const balAfterWithdraw = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  assert(balAfterWithdraw === balBefore, `[ADMIN-20] Balance returned to original after withdraw (${balAfterWithdraw})`);

  // Withdraw more than balance
  const bigWithdraw = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/withdraw`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 999999999 }),
  });
  assert(bigWithdraw.status === 400, `[ADMIN-21] Withdraw > balance => 400 (got ${bigWithdraw.status})`);

  // Deposit invalid amount
  const depositZero = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/deposit`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 0 }),
  });
  assert(depositZero.status === 400, `[ADMIN-22] Deposit $0 => 400 (got ${depositZero.status})`);

  const depositNeg = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/deposit`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: -100 }),
  });
  assert(depositNeg.status === 400, `[ADMIN-23] Deposit negative => 400 (got ${depositNeg.status})`);

  // Admin positions
  const adminPos = await api('/api/v1/admin/positions', { headers: AH });
  assert(adminPos.status === 200, `[ADMIN-24] GET /admin/positions => 200 (got ${adminPos.status})`);
  assert(Array.isArray(adminPos.data?.data), '[ADMIN-25] Admin positions is array');

  // Admin trades
  const adminTrades = await api('/api/v1/admin/trades', { headers: AH });
  assert(adminTrades.status === 200, `[ADMIN-26] GET /admin/trades => 200 (got ${adminTrades.status})`);
  assert(Array.isArray(adminTrades.data?.data), '[ADMIN-27] Admin trades is array');

  // Admin transactions
  const adminTx = await api('/api/v1/admin/transactions', { headers: AH });
  assert(adminTx.status === 200, `[ADMIN-28] GET /admin/transactions => 200 (got ${adminTx.status})`);
  assert(Array.isArray(adminTx.data?.data), '[ADMIN-29] Admin transactions is array');

  // Admin instruments
  const adminInst = await api('/api/v1/admin/instruments', { headers: AH });
  assert(adminInst.status === 200, `[ADMIN-30] GET /admin/instruments => 200 (got ${adminInst.status})`);
  assert(Array.isArray(adminInst.data?.data), '[ADMIN-31] Admin instruments is array');

  // Patch instrument spread
  const firstInst = (adminInst.data?.data || [])[0];
  if (firstInst) {
    const origSpread = firstInst.spread_markup;
    const patchInst = await api(`/api/v1/admin/instruments/${firstInst.id}`, {
      method: 'PATCH', headers: AH,
      body: JSON.stringify({ spread_markup: 2.5 }),
    });
    assert(patchInst.status === 200, `[ADMIN-32] PATCH instrument spread => 200 (got ${patchInst.status})`);
    // Restore original
    await api(`/api/v1/admin/instruments/${firstInst.id}`, {
      method: 'PATCH', headers: AH,
      body: JSON.stringify({ spread_markup: origSpread }),
    });
  }

  // Patch client status
  const firstClient = (clients.data?.data || [])[0];
  if (firstClient) {
    const patchClient = await api(`/api/v1/admin/clients/${firstClient.id}`, {
      method: 'PATCH', headers: AH,
      body: JSON.stringify({ status: firstClient.status || 'ACTIVE' }),
    });
    assert(patchClient.status === 200, `[ADMIN-33] PATCH client => 200 (got ${patchClient.status})`);
  }

  // Deposit to non-existent account
  const depositGhost = await api('/api/v1/admin/accounts/00000000-0000-0000-0000-000000000000/deposit', {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }),
  });
  assert(depositGhost.status === 404, `[ADMIN-34] Deposit to ghost account => 404 (got ${depositGhost.status})`);

  // ═══════════════════════════════════════════════════════
  // 6. DEALER (15+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 6. DEALER ══════');

  // Dealer positions
  const dealerPos = await api('/api/v1/dealer/positions', { headers: AH });
  assert(dealerPos.status === 200, `[DEAL-01] GET /dealer/positions => 200 (got ${dealerPos.status})`);
  assert(Array.isArray(dealerPos.data?.data), '[DEAL-02] Dealer positions is array');

  // Dealer clients
  const dealerClients = await api('/api/v1/dealer/clients', { headers: AH });
  assert(dealerClients.status === 200, `[DEAL-03] GET /dealer/clients => 200 (got ${dealerClients.status})`);
  assert(Array.isArray(dealerClients.data?.data), '[DEAL-04] Dealer clients is array');

  // Dealer interventions
  const dealerInterventions = await api('/api/v1/dealer/interventions', { headers: AH });
  assert(dealerInterventions.status === 200, `[DEAL-05] GET /dealer/interventions => 200 (got ${dealerInterventions.status})`);
  assert(Array.isArray(dealerInterventions.data?.data), '[DEAL-06] Interventions is array');

  // Dealer settings
  const dealerSettings = await api('/api/v1/dealer/settings', { headers: AH });
  assert(dealerSettings.status === 200, `[DEAL-07] GET /dealer/settings => 200 (got ${dealerSettings.status})`);

  // Create dealer trade (BUY, open, no immediate close)
  const dealerTrade1 = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({
      user_id: EMMA_USER_ID,
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.01,
      invest_amount: 5000,
      reason: 'QA R2 test open trade',
    }),
  });
  assert([200, 201].includes(dealerTrade1.status), `[DEAL-08] Dealer create-trade (open) => ${dealerTrade1.status}`);
  const dealerTradeId1 = dealerTrade1.data?.data?.id;
  assert(!!dealerTradeId1, '[DEAL-09] Dealer trade ID returned');

  // Verify swap field stores invest_amount
  const dt1Data = dealerTrade1.data?.data;
  assert(dt1Data?.swap !== undefined, '[DEAL-10] Dealer trade has swap (invest_amount) field');

  // Close dealer trade with custom PnL
  if (dealerTradeId1) {
    openTradeIds.push(dealerTradeId1);
    const closeDT1 = await api(`/api/v1/dealer/close-trade/${dealerTradeId1}`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ pnl: 5000, reason: 'QA R2 close with profit' }),
    });
    assert(closeDT1.status === 200, `[DEAL-11] Dealer close-trade => 200 (got ${closeDT1.status})`);
    assert(closeDT1.data?.data?.success === true, '[DEAL-12] Dealer close returns success: true');
    assert(closeDT1.data?.data?.pnl !== undefined, '[DEAL-13] Dealer close returns pnl');
    openTradeIds.splice(openTradeIds.indexOf(dealerTradeId1), 1);
  }

  // Create dealer trade with immediate PnL target (instant close)
  const dealerTrade2 = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({
      user_id: EMMA_USER_ID,
      symbol: 'BTCUSD',
      side: 'SELL',
      volume: 0.01,
      invest_amount: 10000,
      pnl_target: 2000,
      reason: 'QA R2 instant close trade',
    }),
  });
  assert([200, 201].includes(dealerTrade2.status), `[DEAL-14] Dealer create-trade (instant close) => ${dealerTrade2.status}`);
  const dt2Data = dealerTrade2.data?.data;
  assert(dt2Data?.status === 'CLOSED', `[DEAL-15] Instant close trade status === CLOSED (got ${dt2Data?.status})`);

  // Create dealer trade with missing fields
  const dealerBad = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({ user_id: EMMA_USER_ID }),
  });
  assert(dealerBad.status === 400, `[DEAL-16] Dealer create-trade missing fields => 400 (got ${dealerBad.status})`);

  // Close non-existent dealer trade
  const dealerCloseGhost = await api('/api/v1/dealer/close-trade/00000000-0000-0000-0000-000000000000', {
    method: 'POST', headers: AH,
    body: JSON.stringify({ pnl: 100, reason: 'ghost' }),
  });
  assert(dealerCloseGhost.status === 404, `[DEAL-17] Close non-existent dealer trade => 404 (got ${dealerCloseGhost.status})`);

  // Dealer close-trade missing pnl
  if (dealerTradeId1) {
    // Already closed, so this should 404 anyway, but tests the pattern
  }
  const dealerCloseBad = await api('/api/v1/dealer/close-trade/00000000-0000-0000-0000-000000000001', {
    method: 'POST', headers: AH,
    body: JSON.stringify({ reason: 'no pnl field' }),
  });
  assert(dealerCloseBad.status === 400 || dealerCloseBad.status === 404,
    `[DEAL-18] Dealer close without pnl => 400/404 (got ${dealerCloseBad.status})`);

  // Intervene on non-existent trade
  const interventionGhost = await api('/api/v1/dealer/intervene/00000000-0000-0000-0000-000000000000', {
    method: 'POST', headers: AH,
    body: JSON.stringify({ action: 'SLIPPAGE', modified_price: 1.1, reason: 'ghost test' }),
  });
  assert(interventionGhost.status === 404, `[DEAL-19] Intervene on ghost trade => 404 (got ${interventionGhost.status})`);

  // Update dealer settings
  const patchSettings = await api('/api/v1/dealer/settings', {
    method: 'PATCH', headers: AH,
    body: JSON.stringify({ max_slippage: 5, requote_enabled: true, spread_multiplier: 1.5 }),
  });
  assert(patchSettings.status === 200, `[DEAL-20] PATCH dealer settings => 200 (got ${patchSettings.status})`);

  // ═══════════════════════════════════════════════════════
  // 7. SUPERADMIN (10+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 7. SUPERADMIN ══════');

  const superLogin = await api('/api/v1/super/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@tradexlabel.com', password: 'superadmin123' }),
  });
  assert(superLogin.status === 200, `[SUPER-01] Super login => 200 (got ${superLogin.status})`);
  const superToken = superLogin.data?.data?.token;
  assert(!!superToken, '[SUPER-02] Super token returned');
  assert(!!superLogin.data?.data?.refreshToken, '[SUPER-03] Super refresh token returned');
  assert(!!superLogin.data?.data?.superadmin?.email, '[SUPER-04] Super email returned');

  const SH = { 'Authorization': `Bearer ${superToken}` };

  // Super login wrong password
  const superBadPwd = await api('/api/v1/super/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@tradexlabel.com', password: 'wrong' }),
  });
  assert(superBadPwd.status === 401, `[SUPER-05] Super wrong password => 401 (got ${superBadPwd.status})`);

  // Super login missing fields
  const superNoFields = await api('/api/v1/super/login', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert(superNoFields.status === 400, `[SUPER-06] Super missing fields => 400 (got ${superNoFields.status})`);

  if (superToken) {
    // List tenants
    const tenants = await api('/api/v1/super/tenants', { headers: SH });
    assert(tenants.status === 200, `[SUPER-07] GET /super/tenants => 200 (got ${tenants.status})`);
    assert(Array.isArray(tenants.data?.data), '[SUPER-08] Tenants is array');
    assert(tenants.data?.data?.length > 0, `[SUPER-09] Has tenants (${tenants.data?.data?.length})`);

    // Verify tenant structure
    const t0 = tenants.data?.data?.[0];
    assert(!!t0?.name, '[SUPER-10] Tenant has name');
    assert(!!t0?.domain, '[SUPER-11] Tenant has domain');
    assert(!!t0?.execution_mode, '[SUPER-12] Tenant has execution_mode');
    assert(!!t0?.id, '[SUPER-13] Tenant has id');

    // Monitoring
    const monitoring = await api('/api/v1/super/monitoring', { headers: SH });
    assert(monitoring.status === 200, `[SUPER-14] GET /super/monitoring => 200 (got ${monitoring.status})`);
    assert(monitoring.data?.data?.total_tenants !== undefined, '[SUPER-15] Monitoring has total_tenants');
    assert(monitoring.data?.data?.uptime !== undefined, '[SUPER-16] Monitoring has uptime');
  } else {
    console.log('  ⚠ Skipping super endpoints (login failed)');
  }

  // ═══════════════════════════════════════════════════════
  // 8. VALIDATION EXHAUSTIVE (20+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 8. VALIDATION EXHAUSTIVE ══════');

  // Empty body
  const valEmpty = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({}),
  });
  assert(valEmpty.status === 400, `[VAL-01] Empty body => 400 (got ${valEmpty.status})`);

  // Missing symbol
  const valNoSymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(valNoSymbol.status === 400, `[VAL-02] Missing symbol => 400 (got ${valNoSymbol.status})`);

  // Missing side
  const valNoSide = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', volume: 0.01, type: 'MARKET' }),
  });
  assert(valNoSide.status === 400, `[VAL-03] Missing side => 400 (got ${valNoSide.status})`);

  // Missing volume
  const valNoVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', type: 'MARKET' }),
  });
  assert(valNoVol.status === 400, `[VAL-04] Missing volume => 400 (got ${valNoVol.status})`);

  // Missing type
  const valNoType = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01 }),
  });
  assert(valNoType.status === 400, `[VAL-05] Missing type => 400 (got ${valNoType.status})`);

  // Wrong type value
  const valBadType = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'INVALID' }),
  });
  assert(valBadType.status === 400, `[VAL-06] Wrong type value => 400 (got ${valBadType.status})`);

  // Side not BUY/SELL
  const valBadSide = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'HOLD', volume: 0.01, type: 'MARKET' }),
  });
  assert(valBadSide.status === 400, `[VAL-07] side='HOLD' => 400 (got ${valBadSide.status})`);

  // Symbol with special chars
  const valSpecialSymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: '<script>alert(1)</script>', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(valSpecialSymbol.status === 400 || valSpecialSymbol.status === 404,
    `[VAL-08] Symbol with special chars => 400/404 (got ${valSpecialSymbol.status})`);

  // Volume as string
  const valStringVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 'abc', type: 'MARKET' }),
  });
  assert(valStringVol.status === 400, `[VAL-09] Volume as string 'abc' => 400 (got ${valStringVol.status})`);

  // Volume as negative string
  const valNegStr = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: '-0.01', type: 'MARKET' }),
  });
  assert(valNegStr.status === 400, `[VAL-10] Volume as negative string => 400 (got ${valNegStr.status})`);

  // Symbol empty string
  const valEmptySymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: '', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(valEmptySymbol.status === 400, `[VAL-11] Empty symbol => 400 (got ${valEmptySymbol.status})`);

  // Volume as boolean
  const valBoolVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: true, type: 'MARKET' }),
  });
  assert(valBoolVol.status === 400, `[VAL-12] Volume as boolean => 400 (got ${valBoolVol.status})`);

  // Volume as null
  const valNullVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: null, type: 'MARKET' }),
  });
  assert(valNullVol.status === 400, `[VAL-13] Volume as null => 400 (got ${valNullVol.status})`);

  // Extra unknown fields (should still work with valid data)
  const valExtraFields = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET', foo: 'bar', hack: true }),
  });
  assert(valExtraFields.status === 201, `[VAL-14] Extra fields ignored, valid order => 201 (got ${valExtraFields.status})`);
  const extraId = valExtraFields.data?.data?.trade?.id || valExtraFields.data?.data?.id;
  if (extraId) {
    openTradeIds.push(extraId);
    await api(`/api/v1/positions/${extraId}/close`, { method: 'POST', headers: H, body: '{}' });
    openTradeIds.splice(openTradeIds.indexOf(extraId), 1);
  }

  // SQL injection in symbol
  const valSqlSymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: "'; DROP TABLE trades;--", side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(valSqlSymbol.status === 400 || valSqlSymbol.status === 404,
    `[VAL-15] SQL injection in symbol => 400/404 (got ${valSqlSymbol.status})`);

  // Very long symbol
  const valLongSymbol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'A'.repeat(500), side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(valLongSymbol.status === 400 || valLongSymbol.status === 404,
    `[VAL-16] Very long symbol => 400/404 (got ${valLongSymbol.status})`);

  // Volume extremely small
  const valTinyVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.0001, type: 'MARKET' }),
  });
  assert(valTinyVol.status === 400 || valTinyVol.status === 201,
    `[VAL-17] Very small volume => 201 or 400 (got ${valTinyVol.status})`);
  if (valTinyVol.status === 201) {
    const tinyId = valTinyVol.data?.data?.trade?.id || valTinyVol.data?.data?.id;
    if (tinyId) {
      openTradeIds.push(tinyId);
      await api(`/api/v1/positions/${tinyId}/close`, { method: 'POST', headers: H, body: '{}' });
      openTradeIds.splice(openTradeIds.indexOf(tinyId), 1);
    }
  }

  // Login with SQL injection in email
  const valSqlLogin = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: "admin'--", password: 'x' }),
  });
  assert(valSqlLogin.status === 400 || valSqlLogin.status === 401,
    `[VAL-18] SQL injection in login email => 400/401 (got ${valSqlLogin.status})`);

  // Login with XSS in email
  const valXssLogin = await api('/api/v1/auth/login', {
    method: 'POST', headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: '<img src=x onerror=alert(1)>', password: 'x' }),
  });
  assert(valXssLogin.status === 400 || valXssLogin.status === 401,
    `[VAL-19] XSS in login email => 400/401 (got ${valXssLogin.status})`);

  // Order with side in lowercase
  const valLowerSide = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'buy', volume: 0.01, type: 'MARKET' }),
  });
  assert(valLowerSide.status === 400, `[VAL-20] Lowercase side 'buy' => 400 (got ${valLowerSide.status})`);

  // Order with type in lowercase
  const valLowerType = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'market' }),
  });
  assert(valLowerType.status === 400 || valLowerType.status === 201,
    `[VAL-21] Lowercase type 'market' => 400 or 201 (got ${valLowerType.status})`);
  if (valLowerType.status === 201) {
    const ltId = valLowerType.data?.data?.trade?.id || valLowerType.data?.data?.id;
    if (ltId) {
      openTradeIds.push(ltId);
      await api(`/api/v1/positions/${ltId}/close`, { method: 'POST', headers: H, body: '{}' });
      openTradeIds.splice(openTradeIds.indexOf(ltId), 1);
    }
  }

  // ═══════════════════════════════════════════════════════
  // 9. AUTH RESILIENCE (10+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 9. AUTH RESILIENCE ══════');

  // No auth header at all
  const resNoAuth = await api('/api/v1/positions', { headers: { 'X-Tenant-ID': TENANT_ID } });
  assert(resNoAuth.status === 401, `[RES-01] No auth header => 401 (got ${resNoAuth.status})`);

  // Malformed auth header (no Bearer prefix)
  const resMalformed = await api('/api/v1/positions', {
    headers: { 'Authorization': 'Token abc123', 'X-Tenant-ID': TENANT_ID },
  });
  assert(resMalformed.status === 401, `[RES-02] Malformed auth (Token prefix) => 401 (got ${resMalformed.status})`);

  // Just "Bearer" with no token
  const resEmptyBearer = await api('/api/v1/positions', {
    headers: { 'Authorization': 'Bearer ', 'X-Tenant-ID': TENANT_ID },
  });
  assert(resEmptyBearer.status === 401, `[RES-03] Empty Bearer => 401 (got ${resEmptyBearer.status})`);

  // Expired-looking token (just a garbage JWT-shaped string)
  const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjB9.fake_signature';
  const resExpired = await api('/api/v1/positions', {
    headers: { 'Authorization': `Bearer ${fakeJwt}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(resExpired.status === 401, `[RES-04] Expired-looking token => 401 (got ${resExpired.status})`);

  // No tenant header on endpoints that need it
  const resNoTenant = await api('/api/v1/instruments', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assert(resNoTenant.status === 400 || resNoTenant.status === 401,
    `[RES-05] No X-Tenant-ID on instruments => 400/401 (got ${resNoTenant.status})`);

  // Wrong tenant UUID format
  const resBadTenantFormat = await api('/api/v1/instruments', {
    headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': 'not-a-uuid' },
  });
  assert(resBadTenantFormat.status === 400 || resBadTenantFormat.status === 404 || resBadTenantFormat.status === 401,
    `[RES-06] Bad tenant UUID format => 400/404/401 (got ${resBadTenantFormat.status})`);

  // Random UUID (valid format, non-existent tenant)
  const resGhostTenant = await api('/api/v1/instruments', {
    headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': '00000000-0000-0000-0000-000000000000' },
  });
  assert(resGhostTenant.status === 400 || resGhostTenant.status === 404 || resGhostTenant.status === 401,
    `[RES-07] Non-existent tenant UUID => 400/404/401 (got ${resGhostTenant.status})`);

  // User token trying admin endpoints
  const resUserAsAdmin = await api('/api/v1/admin/dashboard', { headers: H });
  assert(resUserAsAdmin.status === 401 || resUserAsAdmin.status === 403,
    `[RES-08] Trader accessing admin => 401/403 (got ${resUserAsAdmin.status})`);

  // User token trying dealer endpoints
  const resUserAsDealer = await api('/api/v1/dealer/positions', { headers: H });
  assert(resUserAsDealer.status === 401 || resUserAsDealer.status === 403,
    `[RES-09] Trader accessing dealer => 401/403 (got ${resUserAsDealer.status})`);

  // Admin token without X-Tenant-ID on tenant-scoped endpoint
  const resAdminNoTenant = await api('/api/v1/admin/dashboard', {
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  assert(resAdminNoTenant.status === 400 || resAdminNoTenant.status === 401,
    `[RES-10] Admin without X-Tenant-ID => 400/401 (got ${resAdminNoTenant.status})`);

  // Double Bearer prefix
  const resDoubleBearer = await api('/api/v1/positions', {
    headers: { 'Authorization': `Bearer Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(resDoubleBearer.status === 401, `[RES-11] Double Bearer prefix => 401 (got ${resDoubleBearer.status})`);

  // ═══════════════════════════════════════════════════════
  // 10. SECURITY HEADERS (5+ tests)
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ 10. SECURITY HEADERS ══════');

  // Health check (no auth needed)
  const health = await api('/api/v1/health');
  assert(health.status === 200, `[SEC-01] Health check => 200 (got ${health.status})`);

  // Content-Type header present on login response
  const loginHeaders = login.headers;
  const contentType = loginHeaders.get('content-type') || '';
  assert(contentType.includes('application/json') || contentType.includes('json'),
    `[SEC-02] Login response Content-Type contains json (got ${contentType})`);

  // Instruments response returns JSON
  const instContentType = instruments.headers.get('content-type') || '';
  assert(instContentType.includes('json'), `[SEC-03] Instruments Content-Type contains json (got ${instContentType})`);

  // Error responses also return JSON
  const errorContentType = loginBadPwd.headers.get('content-type') || '';
  assert(errorContentType.includes('json'), `[SEC-04] Error response Content-Type contains json (got ${errorContentType})`);

  // Dashboard JSON
  const dashContentType = dashboard.headers.get('content-type') || '';
  assert(dashContentType.includes('json'), `[SEC-05] Dashboard Content-Type contains json (got ${dashContentType})`);

  // Verify no sensitive data leaked in error messages
  assert(!JSON.stringify(loginBadPwd.data).includes('password_hash'), '[SEC-06] Error does not leak password_hash');
  assert(!JSON.stringify(loginBadEmail.data).includes('password_hash'), '[SEC-07] Wrong email error does not leak password_hash');

  // Account endpoint returns JSON
  const acctContentType = account.headers.get('content-type') || '';
  assert(acctContentType.includes('json'), `[SEC-08] Account Content-Type contains json (got ${acctContentType})`);

  // ═══════════════════════════════════════════════════════
  // CLEANUP — close any positions left open
  // ═══════════════════════════════════════════════════════
  console.log('\n══════ CLEANUP ══════');

  // Close any remaining tracked positions
  for (const tradeId of openTradeIds) {
    const closeRes = await api(`/api/v1/positions/${tradeId}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    console.log(`  Cleanup: close ${tradeId.substring(0, 8)}... => ${closeRes.status}`);
  }

  // Also scan for any open positions and close them
  const finalPositions = await api('/api/v1/positions', { headers: H });
  const remainingOpen = finalPositions.data?.data || [];
  if (remainingOpen.length > 0) {
    console.log(`  Found ${remainingOpen.length} remaining open positions, closing...`);
    for (const pos of remainingOpen) {
      const cr = await api(`/api/v1/positions/${pos.id}/close`, {
        method: 'POST', headers: H, body: '{}',
      });
      console.log(`  Cleanup: close ${pos.id.substring(0, 8)}... => ${cr.status}`);
    }
  } else {
    console.log('  No remaining open positions.');
  }

  // ═══════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════
  const total = passCount + failCount;
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  RESULTS: ${String(passCount).padStart(3)} PASS / ${String(failCount).padStart(3)} FAIL / ${String(total).padStart(3)} TOTAL  ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  if (total < 150) {
    console.log(`  ⚠ WARNING: Only ${total} assertions — target was 150+`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
