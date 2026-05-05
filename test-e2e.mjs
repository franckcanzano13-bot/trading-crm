import { chromium } from 'playwright';

const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';
const URL = 'http://localhost:5501';

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
    // STEP 1: Login
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

    // Password already has default 'trader123'
    await page.locator('button[type="submit"]').click();
    console.log('Login submitted');

    // STEP 2: Wait for TradingTerminal to fully load
    // Look for text that only appears in TradingBottomBar
    console.log('=== Waiting for positions to load ===');

    // The bottom bar shows either "Positions:" or "No open positions"
    // Wait up to 20 seconds checking every 500ms
    let foundPositions = false;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      const text = await page.evaluate(() => document.body?.innerText || '');
      if (text.includes('Positions:') || text.includes('No open positions')) {
        foundPositions = true;
        const hasPositionRows = text.includes('Positions:');
        console.log(`Found bottom bar after ${(i+1)*0.5}s — hasPositions: ${hasPositionRows}`);
        break;
      }
    }

    if (!foundPositions) {
      console.log('Bottom bar never appeared. Dumping page text...');
      const fullText = await page.evaluate(() => document.body?.innerText || '');
      console.log(fullText.substring(0, 500));

      // Check if we're stuck on dashboard
      console.log('\nChecking auth/navigation state...');
      const state = await page.evaluate(() => {
        const auth = JSON.parse(localStorage.getItem('tradexlabel-auth') || '{}');
        return {
          isAuthenticated: auth?.state?.isAuthenticated,
          isDealerManaged: auth?.state?.isDealerManaged,
        };
      });
      console.log('Auth:', JSON.stringify(state));

      console.log('=== FAIL: TradingTerminal did not load ===');
      await page.waitForTimeout(5000);
      await browser.close();
      return;
    }

    // STEP 3: Check for clickable position rows
    console.log('=== Looking for position rows ===');
    await page.waitForTimeout(2000); // Extra time for polling to complete

    const posInfo = await page.evaluate(() => {
      const rows = document.querySelectorAll('.cursor-pointer');
      const details = [];
      rows.forEach(row => {
        details.push(row.textContent?.trim()?.substring(0, 80));
      });
      return { count: rows.length, details };
    });
    console.log('Position rows:', posInfo.count);
    posInfo.details.forEach(d => console.log('  Row:', d));

    if (posInfo.count === 0) {
      console.log('=== FAIL: No position rows found ===');

      // Debug: direct API check
      const apiResp = await page.evaluate(async () => {
        const auth = JSON.parse(localStorage.getItem('tradexlabel-auth') || '{}');
        const token = auth?.state?.token;
        const tenantId = auth?.state?.tenantId;
        const resp = await fetch('/api/v1/positions', {
          headers: { 'Authorization': `Bearer ${token}`, 'x-tenant-id': tenantId }
        });
        return resp.text();
      });
      console.log('Direct API:', apiResp.substring(0, 300));

      await page.waitForTimeout(5000);
      await browser.close();
      return;
    }

    // STEP 4: Check if position is already auto-selected (dealer trades are auto-selected)
    const isAutoSelected = await page.evaluate(() => {
      const row = document.querySelector('.cursor-pointer');
      return row?.classList?.contains('bg-primary/10') || row?.className?.includes('bg-primary');
    });
    console.log('Position auto-selected?', isAutoSelected);

    // STEP 5: Check P&L overlay (should be visible if auto-selected)
    let overlay = await page.evaluate(() => {
      const el = document.querySelector('.absolute.top-3.left-4');
      return el ? el.innerText : null;
    });
    console.log('P&L overlay (before click):', overlay || 'NOT FOUND');

    // If not visible, click to select
    if (!overlay) {
      console.log('Clicking position to select it...');
      await page.evaluate(() => {
        const el = document.querySelector('.cursor-pointer');
        if (el) el.click();
      });
      await page.waitForTimeout(2000);
      overlay = await page.evaluate(() => {
        const el = document.querySelector('.absolute.top-3.left-4');
        return el ? el.innerText : null;
      });
      console.log('P&L overlay (after click):', overlay || 'NOT FOUND');
    }

    if (overlay) {
      // Wait 5 seconds and check if P&L changes
      console.log('Waiting 5s to check P&L animation...');
      await page.waitForTimeout(5000);
      const overlay2 = await page.evaluate(() => {
        const el = document.querySelector('.absolute.top-3.left-4');
        return el ? el.innerText : null;
      });
      console.log('P&L initial:', overlay);
      console.log('P&L after 5s:', overlay2);
      console.log('P&L changed?', overlay !== overlay2);

      console.log('\n=== SUCCESS: Position visible, P&L overlay working! ===');
    } else {
      console.log('=== FAIL: P&L overlay not visible ===');

      // Debug: check what selectedTradeId is
      const debug = await page.evaluate(() => {
        const body = document.body?.innerText || '';
        return body.substring(0, 500);
      });
      console.log('Page text:', debug);
    }

  } catch (err) {
    console.log('TEST ERROR:', err.message);
  }

  console.log('\nBrowser closing in 5s...');
  await page.waitForTimeout(5000);
  await browser.close();
  console.log('Done!');
})();
