import { chromium } from 'playwright';
import { execSync } from 'child_process';

const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';
const URL = 'http://localhost:5501';

function curl(cmd) {
  try { return JSON.parse(execSync(cmd, { encoding: 'utf8' })); }
  catch { return null; }
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (['error', 'warn'].includes(msg.type())) {
      console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  try {
    // Login
    console.log('=== Login ===');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    await page.locator('input[placeholder="Enter your broker UUID"]').click();
    await page.locator('input[placeholder="Enter your broker UUID"]').fill('');
    await page.locator('input[placeholder="Enter your broker UUID"]').type(TENANT_ID, { delay: 5 });
    await page.locator('input[type="email"]').click();
    await page.locator('input[type="email"]').fill('');
    await page.locator('input[type="email"]').type('emma.thompson@hotmail.com', { delay: 5 });
    await page.locator('button[type="submit"]').click();

    // Wait for trading terminal
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => document.body?.innerText || '');
      if (text.includes('Positions:') || text.includes('No open positions')) {
        console.log(`Terminal ready in ${(i+1)*0.5}s`);
        break;
      }
    }

    // Record initial state
    const state1 = await page.evaluate(() => {
      const rows = document.querySelectorAll('.cursor-pointer');
      return { positions: rows.length };
    });
    console.log('Initial positions:', state1.positions);

    // Create a NEW trade via dealer API
    console.log('\n=== Dealer creates new trade ===');
    const adminResp = curl('curl -s -X POST http://localhost:5500/api/v1/admin/login -H "Content-Type: application/json" -d "{\\"email\\":\\"admin@dealer.com\\",\\"password\\":\\"dealer123\\",\\"tenant_id\\":\\"944dc16d-ede5-4dff-81f5-839285b3229a\\"}"');
    const adminToken = adminResp?.data?.token;

    if (!adminToken) {
      console.log('ERROR: Could not get admin token');
      await browser.close();
      return;
    }

    const tradeResp = curl(`curl -s -X POST http://localhost:5500/api/v1/dealer/create-trade -H "Content-Type: application/json" -H "Authorization: Bearer ${adminToken}" -H "x-tenant-id: 944dc16d-ede5-4dff-81f5-839285b3229a" -d "{\\"user_id\\":\\"ead77af7-16b1-434c-a6a7-3b607d1ef2e2\\",\\"symbol\\":\\"BTCUSD\\",\\"side\\":\\"BUY\\",\\"volume\\":0.01,\\"invest_amount\\":112000,\\"pnl_target\\":35000,\\"close_after_seconds\\":1800,\\"reason\\":\\"live test\\"}"`);
    console.log('Trade created:', tradeResp?.data?.id || 'FAILED');

    // TEST: Does the position appear WITHOUT reload?
    console.log('\n=== Waiting for position to appear via polling ===');
    let appeared = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const rows = await page.evaluate(() => document.querySelectorAll('.cursor-pointer').length);
      if (rows > state1.positions) {
        console.log(`NEW POSITION APPEARED after ${i+1}s! (${rows} rows)`);
        appeared = true;
        break;
      }
    }
    if (!appeared) {
      console.log('FAIL: Position did not appear after 15s');

      // Check API directly from browser
      const apiCheck = await page.evaluate(async () => {
        const auth = JSON.parse(localStorage.getItem('tradexlabel-auth') || '{}');
        try {
          const resp = await fetch('/api/v1/positions', {
            headers: { 'Authorization': `Bearer ${auth?.state?.token}`, 'x-tenant-id': auth?.state?.tenantId }
          });
          const data = await resp.json();
          return { status: resp.status, count: data?.data?.length, ids: data?.data?.map(p => p.id) };
        } catch (e) {
          return { error: e.message };
        }
      });
      console.log('API check from browser:', JSON.stringify(apiCheck));
    }

    // TEST: P&L animation over 10 seconds
    console.log('\n=== P&L animation test (10 seconds) ===');
    const pnlValues = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const data = await page.evaluate(() => {
        const overlay = document.querySelector('.absolute.top-3.left-4');
        const rows = document.querySelectorAll('.cursor-pointer');
        const rowTexts = Array.from(rows).map(r => {
          const pnlEl = r.querySelector('[class*="font-mono"][class*="font-semibold"]');
          return pnlEl?.textContent?.trim() || '';
        });
        return {
          overlay: overlay?.innerText?.replace(/\n/g, ' | ') || 'NONE',
          rowPnls: rowTexts,
        };
      });
      pnlValues.push(data.overlay);
      console.log(`  t+${i+1}s: overlay=${data.overlay}  rows=${JSON.stringify(data.rowPnls)}`);
    }

    // Check if values changed
    const uniqueValues = new Set(pnlValues);
    if (uniqueValues.size > 1) {
      console.log('\nP&L IS ANIMATING! (%d unique values in 10s)', uniqueValues.size);
    } else {
      console.log('\nFAIL: P&L NOT ANIMATING (stuck at: %s)', pnlValues[0]);
    }

    // Final chart check
    console.log('\n=== Chart rendering check ===');
    const chartCheck = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const visible = canvases.filter(c => c.width > 100 && c.height > 100);
      return {
        total: canvases.length,
        largeVisible: visible.length,
        firstDimensions: visible[0] ? { w: visible[0].width, h: visible[0].height } : null,
      };
    });
    console.log('Canvases:', chartCheck.total, 'Large visible:', chartCheck.largeVisible, 'Dimensions:', JSON.stringify(chartCheck.firstDimensions));

    console.log('\n=== TEST COMPLETE ===');

  } catch (err) {
    console.log('TEST ERROR:', err.message);
  }

  console.log('\nClosing in 5s...');
  await page.waitForTimeout(5000);
  await browser.close();
  console.log('Done!');
})();
