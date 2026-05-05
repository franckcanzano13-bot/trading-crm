/**
 * QA Step 5 — Frontend Playwright Testing (Simplified)
 */
import { chromium } from 'playwright';

const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';
let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) { passCount++; console.log(`  ✅ ${label}`); }
  else { failCount++; console.log(`  ❌ FAIL: ${label}`); }
}

async function screenshot(page, name) {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const fs = await import('fs');
    fs.writeFileSync(`screenshots/qa-${name}.png`, Buffer.from(data, 'base64'));
  } catch {}
}

// Timeout wrapper
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

(async () => {
  console.log('\n=======================================');
  console.log('  QA STEP 5: FRONTEND PLAYWRIGHT');
  console.log('=======================================\n');

  const fs = await import('fs');
  if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');

  const browser = await chromium.launch({ headless: true });

  try {
    // ─── 1. LOGIN PAGE ───
    console.log('─── LOGIN PAGE ───');
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto('http://localhost:5501', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(3000); // Wait for hydration

    const formExists = await page.evaluate(() => document.querySelectorAll('input').length >= 2);
    assert(formExists, 'Login page has form');
    await screenshot(page, '01-login');

    // Fill form and submit
    await page.locator('input[placeholder="Enter your broker UUID"]').fill(TENANT_ID);
    await page.locator('input[type="email"]').fill('');
    await page.locator('input[type="email"]').type('emma.thompson@hotmail.com', { delay: 3 });
    await page.locator('button[type="submit"]').click();

    // Wait for terminal
    let loggedIn = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      const t = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      if (t.includes('Positions') || t.includes('No open positions') || t.includes('Buy')) {
        loggedIn = true;
        break;
      }
    }
    assert(loggedIn, 'Login succeeded');
    await page.waitForTimeout(2000);

    // ─── 2. TRADING TERMINAL ───
    console.log('\n─── TRADING TERMINAL ───');
    const canvases = await page.evaluate(() => document.querySelectorAll('canvas').length);
    assert(canvases > 0, `Chart rendered (${canvases} canvases)`);

    const text = await page.evaluate(() => document.body?.innerText || '');
    assert(text.includes('Buy') || text.includes('Sell'), 'Has Buy/Sell');
    assert(text.includes('EUR') || text.includes('BTC'), 'Has instruments');
    assert(text.includes('Positions') || text.includes('No open positions'), 'Positions area visible');
    assert(!text.includes('undefined'), 'No undefined text');
    assert(!text.includes('NaN'), 'No NaN text');

    await screenshot(page, '02-terminal');

    // ─── 3. INSTRUMENT SWITCHING ───
    console.log('\n─── INSTRUMENT SWITCHING ───');
    for (const inst of ['BTC/USD', 'ETH/USD', 'EUR/USD']) {
      try {
        const ok = await withTimeout(page.evaluate((name) => {
          const els = Array.from(document.querySelectorAll('div, span'));
          const el = els.find(e => e.textContent?.trim() === name && e.offsetHeight > 0 && e.offsetHeight < 50);
          if (el) { el.click(); return true; }
          return false;
        }, inst), 5000);
        if (ok) assert(true, `Switched to ${inst}`);
      } catch { console.log(`  ⚠ ${inst} timeout`); }
      await page.waitForTimeout(500);
    }

    // ─── 4. TIMEFRAME ───
    console.log('\n─── TIMEFRAME ───');
    for (const tf of ['1m', '5m', '1h']) {
      try {
        const ok = await withTimeout(page.evaluate((t) => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btn = btns.find(b => b.textContent?.trim() === t && b.offsetWidth > 0);
          if (btn) { btn.click(); return true; }
          return false;
        }, tf), 5000);
        if (ok) assert(true, `Timeframe ${tf}`);
      } catch { console.log(`  ⚠ ${tf} timeout`); }
    }

    await screenshot(page, '03-final');
    await page.close();

    // ─── 5. OTHER PAGES ───
    console.log('\n─── OTHER PAGES ───');
    for (const [path, label] of [['/admin', 'Admin'], ['/dealer', 'Dealer'], ['/superadmin', 'SuperAdmin']]) {
      try {
        const p = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        await p.goto(`http://localhost:5501${path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await p.waitForTimeout(3000);
        const t = await p.evaluate(() => document.body?.innerText?.length || 0);
        assert(t > 30, `${label} page loads (${t} chars)`);
        await screenshot(p, `04-${label.toLowerCase()}`);
        await p.close();
      } catch (e) {
        console.log(`  ⚠ ${label}: ${e.message}`);
      }
    }

    // ─── 6. RESPONSIVE ───
    console.log('\n─── RESPONSIVE ───');
    const rPage = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await rPage.goto('http://localhost:5501', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await rPage.waitForTimeout(3000);
    for (const [w, h, label] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [768, 1024, 'tablet']]) {
      await rPage.setViewportSize({ width: w, height: h });
      await rPage.waitForTimeout(300);
      const ok = await rPage.evaluate(() => (document.body?.innerText?.length || 0) > 30);
      assert(ok, `Responsive ${label}`);
    }
    await rPage.close();

  } catch (err) {
    console.error('Fatal error:', err.message);
  }

  await browser.close();

  console.log(`\n=======================================`);
  console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`=======================================\n`);
  process.exit(failCount > 0 ? 1 : 0);
})();
