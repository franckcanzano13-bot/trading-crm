/**
 * QA Step 6 — Financial Calculations
 * Tests P&L accuracy, margin, balance after trades
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
  console.log('\n==========================================');
  console.log('  QA STEP 6: FINANCIAL CALCULATIONS');
  console.log('==========================================\n');

  // Get tokens
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

  // ─── Scenario 1: BUY EUR/USD ───
  console.log('─── Scenario 1: BUY EUR/USD ───');
  const balBefore1 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  console.log(`  Balance before: $${(balBefore1/100).toFixed(2)}`);

  const buy1 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(buy1.status === 201, `BUY 0.01 EUR/USD executed (${buy1.status})`);
  const tradeId1 = buy1.data?.data?.trade?.id;

  // Check position exists
  const pos1 = await api('/api/v1/positions', { headers: H });
  const openPos = pos1.data?.data?.find(p => p.id === tradeId1);
  assert(!!openPos, 'Position appears in open list');
  assert(openPos?.status === 'OPEN', 'Position status is OPEN');
  assert(openPos?.side === 'BUY', 'Position side is BUY');
  assert(openPos?.volume === 0.01, `Volume is 0.01 (${openPos?.volume})`);

  // Check margin was deducted
  const acctDuring = (await api('/api/v1/account', { headers: H })).data?.data;
  const marginUsed = Number(acctDuring?.margin_used);
  assert(marginUsed > 0, `Margin used > 0 ($${(marginUsed/100).toFixed(2)})`);

  // Close position
  if (tradeId1) {
    const close1 = await api(`/api/v1/positions/${tradeId1}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(close1.status === 200, 'Position closed');
    assert(close1.data?.data?.status === 'CLOSED', 'Status is CLOSED');

    // Check P&L exists
    const pnl = Number(close1.data?.data?.pnl);
    console.log(`  P&L: ${pnl} cents ($${(pnl/100).toFixed(2)})`);
    assert(typeof pnl === 'number', 'P&L is a number');

    // Check balance updated
    const balAfter1 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
    const expectedBal = balBefore1 + pnl;
    const diff = Math.abs(balAfter1 - expectedBal);
    console.log(`  Balance after: $${(balAfter1/100).toFixed(2)} (expected: $${(expectedBal/100).toFixed(2)}, diff: ${diff}c)`);
    assert(diff <= 1, `Balance = before + P&L (diff: ${diff} cents)`);

    // Check margin released
    const acctAfter = (await api('/api/v1/account', { headers: H })).data?.data;
    const marginAfter = Number(acctAfter?.margin_used);
    assert(marginAfter < marginUsed, `Margin released (${marginUsed} -> ${marginAfter})`);
  }

  // ─── Scenario 2: SELL BTC/USD ───
  console.log('\n─── Scenario 2: SELL BTC/USD ───');
  const balBefore2 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  const sell2 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'BTCUSD', side: 'SELL', volume: 0.01, type: 'MARKET' }),
  });
  assert(sell2.status === 201, `SELL 0.01 BTC/USD executed (${sell2.status})`);
  const tradeId2 = sell2.data?.data?.trade?.id;

  if (tradeId2) {
    const close2 = await api(`/api/v1/positions/${tradeId2}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(close2.status === 200, 'BTC position closed');
    const pnl2 = Number(close2.data?.data?.pnl);
    console.log(`  P&L: ${pnl2} cents ($${(pnl2/100).toFixed(2)})`);

    const balAfter2 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
    const diff2 = Math.abs(balAfter2 - (balBefore2 + pnl2));
    assert(diff2 <= 1, `Balance correct (diff: ${diff2} cents)`);
  }

  // ─── Scenario 3: Multiple positions ───
  console.log('\n─── Scenario 3: Multiple Positions ───');
  const balBefore3 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  // Open 3 positions
  const trades = [];
  for (const [sym, side] of [['EURUSD', 'BUY'], ['BTCUSD', 'SELL'], ['XAUUSD', 'BUY']]) {
    const r = await api('/api/v1/orders', {
      method: 'POST', headers: H,
      body: JSON.stringify({ symbol: sym, side, volume: 0.01, type: 'MARKET' }),
    });
    if (r.status === 201) {
      trades.push({ id: r.data?.data?.trade?.id, symbol: sym, side });
    }
  }
  assert(trades.length === 3, `Opened 3 positions (${trades.length})`);

  // Check all positions exist
  const pos3 = await api('/api/v1/positions', { headers: H });
  const openIds = new Set((pos3.data?.data || []).map(p => p.id));
  assert(trades.every(t => openIds.has(t.id)), 'All 3 positions visible');

  // Check total margin
  const acct3 = (await api('/api/v1/account', { headers: H })).data?.data;
  assert(Number(acct3?.margin_used) > 0, 'Total margin > 0');

  // Close all and track P&L
  let totalPnl = 0;
  for (const t of trades) {
    const r = await api(`/api/v1/positions/${t.id}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    if (r.status === 200) {
      totalPnl += Number(r.data?.data?.pnl);
    }
  }
  console.log(`  Total P&L: ${totalPnl} cents ($${(totalPnl/100).toFixed(2)})`);

  const balAfter3 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  const diff3 = Math.abs(balAfter3 - (balBefore3 + totalPnl));
  assert(diff3 <= 3, `Multi-trade balance correct (diff: ${diff3} cents)`);

  // ─── Scenario 4: Dealer trade ───
  console.log('\n─── Scenario 4: Dealer Trade ───');
  const balBefore4 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);

  const dealerTrade = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({
      user_id: 'ead77af7-16b1-434c-a6a7-3b607d1ef2e2',
      symbol: 'BTCUSD', side: 'BUY', volume: 0.01,
      invest_amount: 50000, pnl_target: 10000,
      close_after_seconds: 3600, reason: 'QA financial test',
    }),
  });
  assert([200, 201].includes(dealerTrade.status), `Dealer trade created (${dealerTrade.status})`);
  const dtId = dealerTrade.data?.data?.id;

  if (dtId) {
    // Check swap (invest_amount) stored
    const dtPos = (await api('/api/v1/positions', { headers: H })).data?.data?.find(p => p.id === dtId);
    assert(dtPos?.swap === '50000' || dtPos?.swap === 50000, `Invest amount stored (${dtPos?.swap})`);

    // Dealer close with specific P&L
    const closeDT = await api(`/api/v1/dealer/close-trade/${dtId}`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ pnl: 7500, reason: 'QA close' }),
    });
    assert(closeDT.status === 200, `Dealer closed with P&L $75 (${closeDT.status})`);

    const balAfter4 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
    const pnl4 = balAfter4 - balBefore4;
    console.log(`  Balance change: ${pnl4} cents ($${(pnl4/100).toFixed(2)})`);
    assert(Math.abs(pnl4 - 7500) <= 10, `Dealer P&L applied correctly (${pnl4} vs 7500)`);
  }

  // ─── Scenario 5: Deposit/Withdraw ───
  console.log('\n─── Scenario 5: Deposit/Withdraw ───');
  const balBefore5 = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  const emmaAcct = '8fe3655e-4bdc-4d04-8c8f-54d180093db4';

  await api(`/api/v1/admin/accounts/${emmaAcct}/deposit`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }), // $100 (API takes dollars, converts to cents)
  });

  const balAfterDeposit = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  assert(balAfterDeposit === balBefore5 + 10000, `Deposit $100 correct (${balAfterDeposit} vs ${balBefore5 + 10000})`);

  await api(`/api/v1/admin/accounts/${emmaAcct}/withdraw`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }), // $100
  });

  const balAfterWithdraw = Number((await api('/api/v1/account', { headers: H })).data?.data?.balance);
  assert(balAfterWithdraw === balBefore5, `Withdraw $100 returns to original (${balAfterWithdraw} vs ${balBefore5})`);

  // ─── Trade history check ───
  console.log('\n─── Trade History ───');
  const history = await api('/api/v1/trades/history?limit=10', { headers: H });
  const trades5 = history.data?.data || [];
  assert(trades5.length > 0, `Trade history has entries (${trades5.length})`);
  const lastTrade = trades5[0];
  assert(lastTrade?.status === 'CLOSED', 'Latest trade is CLOSED');
  assert(lastTrade?.pnl !== undefined, 'Trade has P&L recorded');

  console.log(`\n==========================================`);
  console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`==========================================\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
