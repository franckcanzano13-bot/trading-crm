/**
 * QA Round 2 — Comprehensive Financial Calculations Test (60+ assertions)
 *
 * Tests: BUY/SELL lifecycle, multiple positions, dealer trades,
 *        deposit/withdraw, 20-cycle drift, edge cases, balance invariants
 *
 * Server: http://localhost:5500
 * Tenant: 944dc16d-ede5-4dff-81f5-839285b3229a
 */

const BASE = 'http://localhost:5500';
const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';
const EMMA_ACCOUNT_ID = '8fe3655e-4bdc-4d04-8c8f-54d180093db4';

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) { passCount++; console.log(`  \u2705 ${label}`); }
  else { failCount++; console.log(`  \u274c FAIL: ${label}`); }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function getBalance(H) {
  const r = await api('/api/v1/account', { headers: H });
  return Number(r.data?.data?.balance || 0);
}

async function getAccount(H) {
  const r = await api('/api/v1/account', { headers: H });
  return r.data?.data || {};
}

/** Clean up any open positions to leave account in a clean state */
async function cleanupPositions(H) {
  const pos = await api('/api/v1/positions', { headers: H });
  const open = (pos.data?.data || []).filter(p => p.status === 'OPEN');
  for (const p of open) {
    await api(`/api/v1/positions/${p.id}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
  }
}

async function run() {
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551  QA R2: FINANCIAL CALCULATIONS (60+ tests)     \u2551');
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n');

  // ─── Authenticate ───
  console.log('\u2500\u2500\u2500 Authentication \u2500\u2500\u2500');
  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'trader123' }),
  });
  const token = login.data?.data?.token;
  const H = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID };
  assert(login.status === 200 && !!token, 'Trader login successful');

  const userId = login.data?.data?.user?.id;

  const adminLogin = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'dealer123', tenant_id: TENANT_ID }),
  });
  const adminToken = adminLogin.data?.data?.token;
  const AH = { 'Authorization': `Bearer ${adminToken}`, 'X-Tenant-ID': TENANT_ID };
  assert(adminLogin.status === 200 && !!adminToken, 'Admin login successful');

  // Clean any leftover positions from prior test runs
  await cleanupPositions(H);

  // ═══════════════════════════════════════════════════════
  // 1. BUY EURUSD LIFECYCLE (10+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 1. BUY EURUSD Lifecycle \u2550\u2550\u2550\u2550\u2550\u2550');

  const balBefore1 = await getBalance(H);
  const acctBefore1 = await getAccount(H);
  const marginBefore1 = Number(acctBefore1.margin_used || 0);
  console.log(`  Balance before: $${(balBefore1 / 100).toFixed(2)}, Margin: $${(marginBefore1 / 100).toFixed(2)}`);

  // Open BUY 0.01 EURUSD
  const buy1 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(buy1.status === 201, `[BUY-01] BUY 0.01 EURUSD order accepted (status: ${buy1.status})`);
  const tradeId1 = buy1.data?.data?.trade?.id;
  assert(!!tradeId1, '[BUY-02] Trade ID returned');

  // Verify position in list
  const pos1 = await api('/api/v1/positions', { headers: H });
  const openPos1 = (pos1.data?.data || []).find(p => p.id === tradeId1);
  assert(!!openPos1, '[BUY-03] Position appears in open positions list');
  assert(openPos1?.status === 'OPEN', '[BUY-04] Position status is OPEN');
  assert(openPos1?.side === 'BUY', '[BUY-05] Position side is BUY');
  assert(openPos1?.volume === 0.01, `[BUY-06] Volume is 0.01 (got ${openPos1?.volume})`);

  // Verify margin deducted
  const acctDuring1 = await getAccount(H);
  const marginDuring1 = Number(acctDuring1.margin_used || 0);
  assert(marginDuring1 > marginBefore1, `[BUY-07] Margin increased (${marginBefore1} -> ${marginDuring1})`);

  // Close position
  const close1 = await api(`/api/v1/positions/${tradeId1}/close`, {
    method: 'POST', headers: H, body: '{}',
  });
  assert(close1.status === 200, `[BUY-08] Position closed (status: ${close1.status})`);
  assert(close1.data?.data?.status === 'CLOSED', '[BUY-09] Status is CLOSED after close');

  const pnl1 = Number(close1.data?.data?.pnl || 0);
  assert(typeof pnl1 === 'number' && !isNaN(pnl1), `[BUY-10] P&L is a valid number (${pnl1})`);
  console.log(`  P&L: ${pnl1} cents ($${(pnl1 / 100).toFixed(2)})`);

  // Verify balance = before + P&L
  const balAfter1 = await getBalance(H);
  const expectedBal1 = balBefore1 + pnl1;
  const diff1 = Math.abs(balAfter1 - expectedBal1);
  assert(diff1 <= 1, `[BUY-11] Balance = before + P&L (diff: ${diff1} cents)`);
  console.log(`  Balance after: $${(balAfter1 / 100).toFixed(2)} (expected: $${(expectedBal1 / 100).toFixed(2)})`);

  // Verify margin released
  const acctAfter1 = await getAccount(H);
  const marginAfter1 = Number(acctAfter1.margin_used || 0);
  assert(marginAfter1 < marginDuring1, `[BUY-12] Margin released (${marginDuring1} -> ${marginAfter1})`);

  // ═══════════════════════════════════════════════════════
  // 2. SELL BTCUSD LIFECYCLE (8+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 2. SELL BTCUSD Lifecycle \u2550\u2550\u2550\u2550\u2550\u2550');

  const balBefore2 = await getBalance(H);
  const acctBefore2 = await getAccount(H);
  const marginBefore2 = Number(acctBefore2.margin_used || 0);
  console.log(`  Balance before: $${(balBefore2 / 100).toFixed(2)}`);

  const sell2 = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'BTCUSD', side: 'SELL', volume: 0.01, type: 'MARKET' }),
  });
  assert(sell2.status === 201, `[SELL-01] SELL 0.01 BTCUSD order accepted (status: ${sell2.status})`);
  const tradeId2 = sell2.data?.data?.trade?.id;
  assert(!!tradeId2, '[SELL-02] Trade ID returned');

  // Verify position
  const pos2 = await api('/api/v1/positions', { headers: H });
  const openPos2 = (pos2.data?.data || []).find(p => p.id === tradeId2);
  assert(openPos2?.side === 'SELL', '[SELL-03] Position side is SELL');
  assert(openPos2?.status === 'OPEN', '[SELL-04] Position status is OPEN');

  // Check margin
  const acctDuring2 = await getAccount(H);
  const marginDuring2 = Number(acctDuring2.margin_used || 0);
  assert(marginDuring2 > marginBefore2, `[SELL-05] Margin increased for BTCUSD`);

  // Close
  const close2 = await api(`/api/v1/positions/${tradeId2}/close`, {
    method: 'POST', headers: H, body: '{}',
  });
  assert(close2.status === 200, `[SELL-06] BTCUSD position closed`);
  const pnl2 = Number(close2.data?.data?.pnl || 0);
  assert(typeof pnl2 === 'number' && !isNaN(pnl2), `[SELL-07] P&L is valid number (${pnl2})`);

  const balAfter2 = await getBalance(H);
  const diff2 = Math.abs(balAfter2 - (balBefore2 + pnl2));
  assert(diff2 <= 1, `[SELL-08] Balance = before + P&L (diff: ${diff2} cents)`);
  console.log(`  P&L: ${pnl2} cents, Balance after: $${(balAfter2 / 100).toFixed(2)}`);

  // ═══════════════════════════════════════════════════════
  // 3. MULTIPLE POSITIONS (10+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 3. Multiple Positions \u2550\u2550\u2550\u2550\u2550\u2550');

  const balBefore3 = await getBalance(H);
  const acctBefore3 = await getAccount(H);
  const marginBefore3 = Number(acctBefore3.margin_used || 0);
  console.log(`  Balance before: $${(balBefore3 / 100).toFixed(2)}`);

  // Open 3 positions simultaneously
  const tradeSpecs = [
    { symbol: 'EURUSD', side: 'BUY' },
    { symbol: 'BTCUSD', side: 'SELL' },
    { symbol: 'XAUUSD', side: 'BUY' },
  ];
  const openedTrades = [];

  for (const spec of tradeSpecs) {
    const r = await api('/api/v1/orders', {
      method: 'POST', headers: H,
      body: JSON.stringify({ symbol: spec.symbol, side: spec.side, volume: 0.01, type: 'MARKET' }),
    });
    if (r.status === 201 && r.data?.data?.trade?.id) {
      openedTrades.push({ id: r.data.data.trade.id, ...spec });
    }
  }
  assert(openedTrades.length === 3, `[MULTI-01] Opened 3 positions (got ${openedTrades.length})`);

  // Verify all 3 in position list
  const posMulti = await api('/api/v1/positions', { headers: H });
  const openIds = new Set((posMulti.data?.data || []).map(p => p.id));
  assert(openedTrades.every(t => openIds.has(t.id)), '[MULTI-02] All 3 positions visible in list');

  // Verify individual symbols
  const posMap = {};
  (posMulti.data?.data || []).forEach(p => { posMap[p.id] = p; });
  for (const t of openedTrades) {
    const p = posMap[t.id];
    assert(p?.side === t.side, `[MULTI-03] ${t.symbol} side is ${t.side}`);
  }

  // Verify total margin = sum of individual margins (margin > before)
  const acctMulti = await getAccount(H);
  const marginMulti = Number(acctMulti.margin_used || 0);
  assert(marginMulti > marginBefore3, `[MULTI-06] Total margin increased (${marginBefore3} -> ${marginMulti})`);
  assert(marginMulti > marginBefore3 + 100, `[MULTI-07] Margin is substantially higher with 3 open positions`);

  // Close all 3 and track total P&L
  let totalPnl3 = 0;
  for (const t of openedTrades) {
    const r = await api(`/api/v1/positions/${t.id}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(r.status === 200, `[MULTI-08] Closed ${t.symbol} position`);
    totalPnl3 += Number(r.data?.data?.pnl || 0);
  }
  console.log(`  Total P&L from 3 trades: ${totalPnl3} cents ($${(totalPnl3 / 100).toFixed(2)})`);

  // Verify total P&L matches balance change
  const balAfter3 = await getBalance(H);
  const diff3 = Math.abs(balAfter3 - (balBefore3 + totalPnl3));
  assert(diff3 <= 3, `[MULTI-09] Total P&L matches balance change (diff: ${diff3} cents)`);

  // Verify margin released back
  const acctAfter3 = await getAccount(H);
  const marginAfter3 = Number(acctAfter3.margin_used || 0);
  assert(marginAfter3 <= marginBefore3, `[MULTI-10] Margin released back to baseline (${marginAfter3} <= ${marginBefore3})`);

  // Zero drift check
  const drift3 = Math.abs(balAfter3 - (balBefore3 + totalPnl3));
  assert(drift3 <= 3, `[MULTI-11] Zero drift on multi-position close (drift: ${drift3})`);

  // ═══════════════════════════════════════════════════════
  // 4. DEALER TRADE (8+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 4. Dealer Trade \u2550\u2550\u2550\u2550\u2550\u2550');

  const balBefore4 = await getBalance(H);
  console.log(`  Balance before dealer trade: $${(balBefore4 / 100).toFixed(2)}`);

  // Create dealer trade (open, no immediate close)
  const dealerCreate = await api('/api/v1/dealer/create-trade', {
    method: 'POST', headers: AH,
    body: JSON.stringify({
      user_id: userId,
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 0.01,
      invest_amount: 500,
      reason: 'QA R2 financial test - dealer open trade',
    }),
  });
  assert([200, 201].includes(dealerCreate.status), `[DEALER-01] Dealer trade created (status: ${dealerCreate.status})`);
  const dealerTradeId = dealerCreate.data?.data?.id;
  assert(!!dealerTradeId, `[DEALER-02] Dealer trade ID returned`);

  // Verify trade appears in positions
  if (dealerTradeId) {
    const posDealer = await api('/api/v1/positions', { headers: H });
    const dealerPos = (posDealer.data?.data || []).find(p => p.id === dealerTradeId);
    assert(!!dealerPos, '[DEALER-03] Dealer trade visible in trader positions');
    assert(dealerPos?.status === 'OPEN', '[DEALER-04] Dealer trade is OPEN');

    // Verify invest_amount stored in swap field
    const swapVal = Number(dealerPos?.swap || 0);
    assert(swapVal === 500, `[DEALER-05] Invest amount stored in swap (got ${swapVal})`);

    // Close with specific P&L: $75 = 7500 cents
    const dealerClose = await api(`/api/v1/dealer/close-trade/${dealerTradeId}`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ pnl: 7500, reason: 'QA R2 financial test - dealer close' }),
    });
    assert(dealerClose.status === 200, `[DEALER-06] Dealer closed trade with P&L (status: ${dealerClose.status})`);

    // Verify client balance reflects dealer-set P&L
    const balAfter4 = await getBalance(H);
    const balChange4 = balAfter4 - balBefore4;
    console.log(`  Balance change: ${balChange4} cents ($${(balChange4 / 100).toFixed(2)})`);
    assert(Math.abs(balChange4 - 7500) <= 10, `[DEALER-07] Dealer P&L of $75 applied (change: ${balChange4}, expected: 7500)`);

    // Verify trade is now closed
    const histDealer = await api('/api/v1/trades/history?limit=5', { headers: H });
    const closedDealer = (histDealer.data?.data || []).find(t => t.id === dealerTradeId);
    assert(closedDealer?.status === 'CLOSED', `[DEALER-08] Dealer trade status is CLOSED in history`);
  }

  // ═══════════════════════════════════════════════════════
  // 5. DEPOSIT / WITHDRAW (8+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 5. Deposit / Withdraw \u2550\u2550\u2550\u2550\u2550\u2550');

  const balBefore5 = await getBalance(H);
  console.log(`  Balance before: $${(balBefore5 / 100).toFixed(2)}`);

  // Deposit $100
  const deposit5 = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/deposit`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }),
  });
  assert([200, 201].includes(deposit5.status), `[DEP-01] Deposit $100 accepted (status: ${deposit5.status})`);

  const balAfterDeposit = await getBalance(H);
  assert(balAfterDeposit === balBefore5 + 10000, `[DEP-02] Balance increased by $100 (10000 cents): ${balAfterDeposit} vs ${balBefore5 + 10000}`);
  console.log(`  Balance after deposit: $${(balAfterDeposit / 100).toFixed(2)}`);

  // Withdraw $100
  const withdraw5 = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/withdraw`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 100 }),
  });
  assert([200, 201].includes(withdraw5.status), `[DEP-03] Withdraw $100 accepted (status: ${withdraw5.status})`);

  const balAfterWithdraw = await getBalance(H);
  assert(balAfterWithdraw === balBefore5, `[DEP-04] Balance back to original after withdraw ($${(balAfterWithdraw / 100).toFixed(2)} vs $${(balBefore5 / 100).toFixed(2)})`);

  // Zero drift on deposit+withdraw
  const driftDW = Math.abs(balAfterWithdraw - balBefore5);
  assert(driftDW === 0, `[DEP-05] Zero drift on deposit+withdraw cycle (drift: ${driftDW})`);

  // Additional deposit check: deposit smaller amount
  const deposit5b = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/deposit`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 50 }),
  });
  const balAfterDep50 = await getBalance(H);
  assert(balAfterDep50 === balBefore5 + 5000, `[DEP-06] Deposit $50 correct (${balAfterDep50} vs ${balBefore5 + 5000})`);

  // Withdraw the $50 back
  await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/withdraw`, {
    method: 'POST', headers: AH,
    body: JSON.stringify({ amount: 50 }),
  });
  const balAfterDep50Wd = await getBalance(H);
  assert(balAfterDep50Wd === balBefore5, `[DEP-07] Balance restored after $50 deposit+withdraw`);

  // Verify equity updated
  const acctDep = await getAccount(H);
  const equity5 = Number(acctDep.equity || 0);
  assert(equity5 > 0, `[DEP-08] Equity is positive after operations (${equity5})`);

  // ═══════════════════════════════════════════════════════
  // 6. 20 DEPOSIT/WITHDRAW CYCLES (4+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 6. 20 Deposit/Withdraw Cycles \u2550\u2550\u2550\u2550\u2550\u2550');

  const balBefore6 = await getBalance(H);
  console.log(`  Balance before 20 cycles: $${(balBefore6 / 100).toFixed(2)}`);

  let cycleErrors = 0;
  for (let i = 0; i < 20; i++) {
    const dep = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/deposit`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ amount: 10 }),
    });
    if (![200, 201].includes(dep.status)) cycleErrors++;

    const wd = await api(`/api/v1/admin/accounts/${EMMA_ACCOUNT_ID}/withdraw`, {
      method: 'POST', headers: AH,
      body: JSON.stringify({ amount: 10 }),
    });
    if (![200, 201].includes(wd.status)) cycleErrors++;
  }

  assert(cycleErrors === 0, `[CYCLE-01] All 20 deposit+withdraw cycles succeeded (errors: ${cycleErrors})`);

  const balAfter6 = await getBalance(H);
  const drift6 = Math.abs(balAfter6 - balBefore6);
  console.log(`  Balance after 20 cycles: $${(balAfter6 / 100).toFixed(2)}, Drift: ${drift6} cents`);
  assert(drift6 === 0, `[CYCLE-02] Zero drift after 20 cycles (drift: ${drift6})`);
  assert(balAfter6 === balBefore6, `[CYCLE-03] Balance unchanged: $${(balAfter6 / 100).toFixed(2)}`);
  assert(balAfter6 >= 0, `[CYCLE-04] Balance non-negative after cycles`);

  // ═══════════════════════════════════════════════════════
  // 7. EDGE CASES (8+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 7. Edge Cases \u2550\u2550\u2550\u2550\u2550\u2550');

  // Zero volume trade rejected
  const zeroVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0, type: 'MARKET' }),
  });
  assert(zeroVol.status >= 400, `[EDGE-01] Zero volume rejected (status: ${zeroVol.status})`);

  // Negative volume trade rejected
  const negVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: -0.5, type: 'MARKET' }),
  });
  assert(negVol.status >= 400, `[EDGE-02] Negative volume rejected (status: ${negVol.status})`);

  // Invalid symbol rejected
  const badSym = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'FAKEXYZ', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  assert(badSym.status >= 400, `[EDGE-03] Invalid symbol rejected (status: ${badSym.status})`);

  // Insufficient margin (huge volume)
  const hugeVol = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 9999, type: 'MARKET' }),
  });
  assert(hugeVol.status >= 400, `[EDGE-04] Huge volume (insufficient margin) rejected (status: ${hugeVol.status})`);

  // Close already-closed position (use tradeId1 from scenario 1)
  if (tradeId1) {
    const doubleClose1 = await api(`/api/v1/positions/${tradeId1}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(doubleClose1.status >= 400, `[EDGE-05] Close already-closed position rejected (status: ${doubleClose1.status})`);
  }

  // Double close - open a position, close it, then try to close again
  const edgeTrade = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', volume: 0.01, type: 'MARKET' }),
  });
  const edgeTradeId = edgeTrade.data?.data?.trade?.id;
  if (edgeTradeId) {
    await api(`/api/v1/positions/${edgeTradeId}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    const doubleClose2 = await api(`/api/v1/positions/${edgeTradeId}/close`, {
      method: 'POST', headers: H, body: '{}',
    });
    assert(doubleClose2.status >= 400, `[EDGE-06] Double close rejected (status: ${doubleClose2.status})`);
  }

  // Close non-existent position
  const fakePosClose = await api('/api/v1/positions/00000000-0000-0000-0000-000000000000/close', {
    method: 'POST', headers: H, body: '{}',
  });
  assert(fakePosClose.status >= 400, `[EDGE-07] Close non-existent position rejected (status: ${fakePosClose.status})`);

  // Missing required fields in order
  const noSide = await api('/api/v1/orders', {
    method: 'POST', headers: H,
    body: JSON.stringify({ symbol: 'EURUSD', volume: 0.01, type: 'MARKET' }),
  });
  assert(noSide.status >= 400, `[EDGE-08] Order missing side rejected (status: ${noSide.status})`);

  // ═══════════════════════════════════════════════════════
  // 8. BALANCE NEVER GOES NEGATIVE (4+ assertions)
  // ═══════════════════════════════════════════════════════
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550 8. Balance Invariants \u2550\u2550\u2550\u2550\u2550\u2550');

  // Clean up any remaining open positions
  await cleanupPositions(H);

  const finalAcct = await getAccount(H);
  const finalBalance = Number(finalAcct.balance || 0);
  const finalMarginUsed = Number(finalAcct.margin_used || 0);
  const finalEquity = Number(finalAcct.equity || 0);

  console.log(`  Final balance: $${(finalBalance / 100).toFixed(2)}`);
  console.log(`  Final margin used: $${(finalMarginUsed / 100).toFixed(2)}`);
  console.log(`  Final equity: $${(finalEquity / 100).toFixed(2)}`);

  assert(finalBalance >= 0, `[INV-01] Balance >= 0 ($${(finalBalance / 100).toFixed(2)})`);
  assert(finalMarginUsed >= 0, `[INV-02] Margin used >= 0 ($${(finalMarginUsed / 100).toFixed(2)})`);
  assert(finalEquity >= 0, `[INV-03] Equity >= 0 ($${(finalEquity / 100).toFixed(2)})`);

  // After cleanup, check no open positions remain for this user
  const finalPositions = (await api('/api/v1/positions', { headers: H })).data?.data || [];
  const openPositions = finalPositions.filter(p => p.status === 'OPEN');
  assert(openPositions.length === 0, `[INV-04] No open positions remain (${openPositions.length} open)`);

  // ═══════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════
  console.log(`\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557`);
  console.log(`\u2551  RESULTS: ${passCount} PASS, ${failCount} FAIL${' '.repeat(Math.max(0, 30 - String(passCount).length - String(failCount).length))}\u2551`);
  console.log(`\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d`);
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
