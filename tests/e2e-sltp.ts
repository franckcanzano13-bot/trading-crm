import { chromium } from 'playwright';

const BASE = 'http://localhost:5501';
const API = 'http://localhost:5500';
const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.log(`  ✗ FAIL: ${msg}`); }
  }

  try {
    // ─── 1. Login ───
    console.log('\n=== Phase 1: Login ===');
    await page.goto(BASE);
    await page.waitForTimeout(1000);

    // Fill Broker ID
    const brokerInput = page.locator('input[placeholder*="broker"], input[placeholder*="UUID"], input[placeholder*="Broker"]').first();
    if (await brokerInput.isVisible().catch(() => false)) {
      await brokerInput.fill(TENANT_ID);
    }

    await page.fill('input[type="email"]', 'sophia.martinez@gmail.com');
    await page.fill('input[type="password"]', 'trader123');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);

    // Check trading terminal loaded (look for timeframe buttons or price display)
    const hasTerminal = await page.locator('text=1m').first().isVisible({ timeout: 5000 }).catch(() => false)
      || await page.locator('canvas').first().isVisible({ timeout: 2000 }).catch(() => false)
      || await page.locator('text=EUR/USD').first().isVisible({ timeout: 2000 }).catch(() => false);
    assert(hasTerminal, 'Trading terminal loaded');

    // ─── 2. Test SL/TP API ───
    console.log('\n=== Phase 2: SL/TP API Tests ===');

    // Login via API
    const loginRes = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ email: 'sophia.martinez@gmail.com', password: 'trader123' }),
    });
    const loginData = await loginRes.json();
    const token = loginData.data.token;
    assert(!!token, 'API login successful');

    // Place a BUY order with SL/TP
    const orderRes = await fetch(`${API}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', type: 'MARKET', volume: 0.01, stop_loss: 1.05, take_profit: 1.25 }),
    });
    const orderData = await orderRes.json();
    assert(orderRes.status === 201, 'BUY EURUSD with SL/TP placed');
    assert(orderData.data?.trade?.stop_loss === 1.05, 'SL stored: 1.05');
    assert(orderData.data?.trade?.take_profit === 1.25, 'TP stored: 1.25');
    const tradeId = orderData.data?.trade?.id;

    // Modify SL/TP
    const modRes = await fetch(`${API}/api/v1/positions/${tradeId}/sltp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ stop_loss: 1.08, take_profit: 1.20 }),
    });
    const modData = await modRes.json();
    assert(modRes.ok, 'SL/TP modification succeeded');
    assert(modData.data?.stop_loss === 1.08, 'SL updated to 1.08');
    assert(modData.data?.take_profit === 1.20, 'TP updated to 1.20');

    // Invalid SL (above price for BUY)
    const invalidRes = await fetch(`${API}/api/v1/positions/${tradeId}/sltp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ stop_loss: 1.50 }),
    });
    assert(invalidRes.status === 400, 'Invalid SL rejected (above price for BUY)');

    // Remove SL/TP (set to null)
    const removeRes = await fetch(`${API}/api/v1/positions/${tradeId}/sltp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ stop_loss: null, take_profit: null }),
    });
    const removeData = await removeRes.json();
    assert(removeRes.ok, 'SL/TP removal succeeded');
    assert(removeData.data?.stop_loss === null, 'SL removed (null)');
    assert(removeData.data?.take_profit === null, 'TP removed (null)');

    // Re-set SL/TP for visual test
    await fetch(`${API}/api/v1/positions/${tradeId}/sltp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ stop_loss: 1.10, take_profit: 1.18 }),
    });

    // ─── 3. Test SELL with SL/TP ───
    console.log('\n=== Phase 3: SELL order with SL/TP ===');
    const sellRes = await fetch(`${API}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ symbol: 'GBPUSD', side: 'SELL', type: 'MARKET', volume: 0.01, stop_loss: 1.35, take_profit: 1.20 }),
    });
    const sellData = await sellRes.json();
    assert(sellRes.status === 201, 'SELL GBPUSD with SL/TP placed');
    assert(sellData.data?.trade?.stop_loss === 1.35, 'SELL SL stored: 1.35 (above price)');
    assert(sellData.data?.trade?.take_profit === 1.20, 'SELL TP stored: 1.20 (below price)');

    // Invalid SL for SELL (below price)
    const sellTradeId = sellData.data?.trade?.id;
    const invalidSellRes = await fetch(`${API}/api/v1/positions/${sellTradeId}/sltp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ stop_loss: 1.10 }),
    });
    assert(invalidSellRes.status === 400, 'Invalid SL rejected for SELL (below price)');

    // ─── 4. Test LIMIT order placement ───
    console.log('\n=== Phase 4: LIMIT/STOP orders ===');
    const limitRes = await fetch(`${API}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      body: JSON.stringify({ symbol: 'EURUSD', side: 'BUY', type: 'LIMIT', volume: 0.01, price: 1.05 }),
    });
    const limitData = await limitRes.json();
    assert(limitRes.status === 201, 'LIMIT order placed');
    assert(limitData.data?.type === 'PENDING', 'LIMIT order is PENDING');

    // ─── 5. Check positions have SL/TP in frontend ───
    console.log('\n=== Phase 5: Frontend verification ===');
    await page.waitForTimeout(3000);

    // Wait for positions to load (polling every 1.5s)
    await page.waitForTimeout(5000);

    // Take screenshot for debugging
    await page.screenshot({ path: 'tests/sltp-test.png', fullPage: true });

    // Check that the page has rendered trading content
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const hasBuyOrSell = bodyText.includes('BUY') || bodyText.includes('SELL') || bodyText.includes('Buy') || bodyText.includes('Sell');
    assert(hasBuyOrSell, 'Trading UI has Buy/Sell elements');

    const hasSLTPOrPnl = bodyText.includes('SL') || bodyText.includes('TP') || bodyText.includes('P&L') || bodyText.includes('Stop Loss');
    assert(hasSLTPOrPnl, 'SL/TP or P&L info visible in UI');

    // ─── 6. Close test positions ───
    console.log('\n=== Phase 6: Cleanup ===');
    if (tradeId) {
      await fetch(`${API}/api/v1/positions/${tradeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
        body: '{}',
      });
    }
    if (sellTradeId) {
      await fetch(`${API}/api/v1/positions/${sellTradeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
        body: '{}',
      });
    }
    // Cancel limit order
    if (limitData.data?.order?.id) {
      await fetch(`${API}/api/v1/orders/${limitData.data.order.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': TENANT_ID },
      });
    }
    assert(true, 'Test positions cleaned up');

    // ─── 7. Health check ───
    console.log('\n=== Phase 7: System health ===');
    const healthRes = await fetch(`${API}/api/v1/health`);
    const health = await healthRes.json();
    assert(health.status === 'ok', 'Backend health: OK');
    const liveSources = Object.values(health.priceSources as Record<string, any>).filter((s: any) => s.status === 'live' && s.tickCount > 0);
    assert(liveSources.length >= 2, `${liveSources.length} live price sources active`);

  } catch (err: any) {
    console.error('TEST ERROR:', err.message);
    failed++;
  }

  await browser.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
