import { chromium } from 'playwright';

const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({ viewport: null }); // full window
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[ERR] ${msg.text()}`);
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

  console.log('Logged in! Waiting for terminal...');

  // Wait for position to appear
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const text = await page.evaluate(() => document.body?.innerText || '');
    if (text.includes('Positions:')) {
      console.log('Position visible!');
      break;
    }
  }

  // Monitor P&L for 10 seconds
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const pnl = await page.evaluate(() => {
      const el = document.querySelector('.absolute.top-3.left-4');
      return el ? el.innerText.replace(/\n/g, ' | ') : 'no overlay';
    });
    console.log(`P&L t+${i+1}s: ${pnl}`);
  }

  console.log('\nBrowser stays open 5 minutes. Interact freely!');
  await page.waitForTimeout(300000);
  await browser.close();
})();
