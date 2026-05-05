import { chromium } from 'playwright';

(async () => {
  // Connect to the existing browser via CDP
  // Take screenshot of the page at localhost:5501
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Set auth in localStorage before loading
  await page.goto('http://localhost:5501', { waitUntil: 'domcontentloaded' });

  // Copy auth from existing session
  await page.evaluate(() => {
    // Check if already authenticated
    const existing = localStorage.getItem('tradexlabel-auth');
    if (existing) {
      const parsed = JSON.parse(existing);
      if (parsed?.state?.isAuthenticated) return 'already authed';
    }
    return 'need login';
  });

  // Login
  await page.waitForSelector('button[type="submit"]', { timeout: 5000 }).catch(() => null);
  const needsLogin = await page.evaluate(() => !JSON.parse(localStorage.getItem('tradexlabel-auth') || '{}')?.state?.isAuthenticated);

  if (needsLogin) {
    await page.locator('input[placeholder="Enter your broker UUID"]').fill('944dc16d-ede5-4dff-81f5-839285b3229a');
    await page.locator('input[type="email"]').fill('');
    await page.locator('input[type="email"]').type('emma.thompson@hotmail.com', { delay: 3 });
    await page.locator('button[type="submit"]').click();
  }

  // Wait for terminal
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const text = await page.evaluate(() => document.body?.innerText || '');
    if (text.includes('Positions:') || text.includes('No open positions')) break;
  }
  await page.waitForTimeout(3000);

  // Screenshot via CDP
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('fs');
  fs.writeFileSync('screenshots/current.png', Buffer.from(data, 'base64'));
  console.log('Saved screenshots/current.png');

  await browser.close();
})();
