import { chromium } from 'playwright';
import { execSync } from 'child_process';

const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';

(async () => {
  const browser = await chromium.launch({ headless: true }); // headless to take clean screenshots
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  // Ensure there's an active trade
  try {
    const adminResp = JSON.parse(execSync('curl -s -X POST http://localhost:5500/api/v1/admin/login -H "Content-Type: application/json" -d "{\\"email\\":\\"admin@dealer.com\\",\\"password\\":\\"dealer123\\",\\"tenant_id\\":\\"944dc16d-ede5-4dff-81f5-839285b3229a\\"}"', { encoding: 'utf8' }));
    const adminToken = adminResp.data.token;
    execSync(`curl -s -X POST http://localhost:5500/api/v1/dealer/create-trade -H "Content-Type: application/json" -H "Authorization: Bearer ${adminToken}" -H "x-tenant-id: 944dc16d-ede5-4dff-81f5-839285b3229a" -d "{\\"user_id\\":\\"ead77af7-16b1-434c-a6a7-3b607d1ef2e2\\",\\"symbol\\":\\"BTCUSD\\",\\"side\\":\\"BUY\\",\\"volume\\":0.01,\\"invest_amount\\":112000,\\"pnl_target\\":35000,\\"close_after_seconds\\":1800,\\"reason\\":\\"screenshot test\\"}"`, { encoding: 'utf8' });
    console.log('Trade created');
  } catch (e) {
    console.log('Trade creation might have failed, continuing...');
  }

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

  // Wait for terminal + positions
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const text = await page.evaluate(() => document.body?.innerText || '');
    if (text.includes('Positions:')) break;
  }

  // Wait for P&L to start animating
  await page.waitForTimeout(5000);

  // Take full page screenshot
  await page.evaluate(() => {
    // Force all canvases to render
    document.querySelectorAll('canvas').forEach(c => c.style.display = 'block');
  });

  // Use CDP to bypass font-waiting timeout
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('fs');
  fs.writeFileSync('screenshots/full-terminal.png', Buffer.from(data, 'base64'));
  console.log('Screenshot saved: screenshots/full-terminal.png');

  await browser.close();
  console.log('Done!');
})();
