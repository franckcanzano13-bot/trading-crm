import { chromium } from 'playwright';

const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  // Capture ALL console messages
  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  // Capture network requests for close endpoint
  page.on('response', async (response) => {
    if (response.url().includes('/close')) {
      console.log(`[NETWORK] ${response.url()} => ${response.status()}`);
      try {
        const body = await response.text();
        console.log(`[RESPONSE] ${body.substring(0, 300)}`);
      } catch {}
    }
  });

  // Login
  await page.goto('http://localhost:5501', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
  await page.waitForTimeout(1000);

  await page.locator('input[placeholder="Enter your broker UUID"]').click();
  await page.locator('input[placeholder="Enter your broker UUID"]').fill('');
  await page.locator('input[placeholder="Enter your broker UUID"]').type(TENANT_ID, { delay: 5 });
  await page.locator('input[type="email"]').click();
  await page.locator('input[type="email"]').fill('');
  await page.locator('input[type="email"]').type('emma.thompson@hotmail.com', { delay: 5 });
  await page.locator('button[type="submit"]').click();

  console.log('Logged in, waiting for position...');

  // Wait for position to appear
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const text = await page.evaluate(() => document.body?.innerText || '');
    if (text.includes('Close')) {
      console.log('Position visible with Close button!');
      break;
    }
  }
  await page.waitForTimeout(2000);

  // Count positions before close
  const beforeCount = await page.evaluate(() => {
    return document.querySelectorAll('button').length;
  });
  console.log(`Buttons on page before: ${beforeCount}`);

  // Screenshot before
  const cdp = await page.context().newCDPSession(page);
  let { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('fs');
  fs.writeFileSync('screenshots/before-close.png', Buffer.from(data, 'base64'));
  console.log('Screenshot: before-close.png');

  // Find and click the Close button
  console.log('--- CLICKING CLOSE ---');
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const closeBtn = buttons.find(b => b.textContent.trim() === 'Close' && !b.textContent.includes('Close All'));
    if (closeBtn) {
      closeBtn.click();
      return 'clicked';
    }
    return 'not found';
  });
  console.log(`Close button: ${clicked}`);

  // Wait for the close to process and polling to refresh
  console.log('Waiting for position to disappear...');
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const hasPosition = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return text.includes('BUY') && text.includes('Close');
    });
    if (!hasPosition) {
      console.log(`Position disappeared after ${i+1}s`);
      break;
    }
    console.log(`  still visible at ${i+1}s...`);
  }

  // Screenshot after
  ({ data } = await cdp.send('Page.captureScreenshot', { format: 'png' }));
  fs.writeFileSync('screenshots/after-close.png', Buffer.from(data, 'base64'));
  console.log('Screenshot: after-close.png');

  // Check if position is still visible
  const afterText = await page.evaluate(() => {
    const bottomBar = document.querySelector('[class*="bottom"]') || document.querySelector('.fixed.bottom-0');
    return document.body?.innerText?.includes('BTCUSD') ? 'BTCUSD still visible' : 'BTCUSD gone';
  });
  console.log(`After close: ${afterText}`);

  await page.waitForTimeout(5000);
  await browser.close();
})();
