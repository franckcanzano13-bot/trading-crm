import { test, expect, Page } from '@playwright/test';

// Phase 1.10: CI passes these from the seeded database; local runs can keep the defaults.
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3002';
const TENANT_ID = process.env.E2E_TENANT_ID || '944dc16d-ede5-4dff-81f5-839285b3229a';
const EMAIL = 'trader@demo.com';
const PASSWORD = 'trader123';

test.describe('Full Site E2E Test', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Set viewport to a reasonable desktop size
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('1. Login page renders correctly', async () => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Should see login form
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('text=Broker ID')).toBeVisible();
    await expect(page.locator('input[placeholder="Enter your broker UUID"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Check bicolor: left panel should exist on desktop
    await expect(page.locator('.surface-sidebar')).toBeVisible();
    await expect(page.locator('text=Trade smarter.')).toBeVisible();

    console.log('✓ Login page renders correctly with bicolor layout');
  });

  test('2. Login without Broker ID shows error', async () => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Clear broker ID and try to submit. Email/password are no longer pre-filled
    // (Sprint 8.1), and they are `required`, so fill them or the browser blocks submit.
    const brokerInput = page.locator('input[placeholder="Enter your broker UUID"]');
    await brokerInput.fill('');
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Should show error
    await expect(page.locator('text=Please enter your Broker ID')).toBeVisible();
    console.log('✓ Login validation works');
  });

  test('3. Login with valid credentials', async () => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Fill in credentials
    await page.locator('input[placeholder="Enter your broker UUID"]').fill(TENANT_ID);
    // Email and password should already be pre-filled, but let's make sure
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill(EMAIL);
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill(PASSWORD);

    // Submit
    await page.locator('button[type="submit"]').click();

    // Wait for navigation to dashboard
    await page.waitForTimeout(3000);

    // Should see dashboard content
    const dashboardVisible = await page.locator('text=Dashboard').first().isVisible().catch(() => false);
    const tradeVisible = await page.locator('text=Trade').first().isVisible().catch(() => false);

    expect(dashboardVisible || tradeVisible).toBeTruthy();
    console.log('✓ Login successful, navigated to app');
  });

  test('4. Dashboard page', async () => {
    // Navigate to dashboard
    const dashBtn = page.locator('button:has-text("Dashboard")').first();
    if (await dashBtn.isVisible()) {
      await dashBtn.click();
      await page.waitForTimeout(1000);
    }

    // Check for dashboard elements
    const balanceVisible = await page.locator('text=Balance').first().isVisible().catch(() => false);
    const equityVisible = await page.locator('text=Equity').first().isVisible().catch(() => false);

    console.log(`  Dashboard - Balance visible: ${balanceVisible}, Equity visible: ${equityVisible}`);
    expect(balanceVisible || equityVisible).toBeTruthy();

    // Check for hero banner
    const heroVisible = await page.locator('text=Start Trading').first().isVisible().catch(() => false);
    console.log(`  Dashboard - Hero banner: ${heroVisible}`);
    expect(heroVisible).toBeTruthy();

    // Check quick actions
    const copyVisible = await page.locator('text=Copy Traders').first().isVisible().catch(() => false);
    console.log(`  Dashboard - Quick actions: ${copyVisible}`);

    // Screenshot
    await page.screenshot({ path: 'e2e/screenshots/dashboard.png', fullPage: false });
    console.log('✓ Dashboard page checked');
  });

  test('5. Trade page - Trading Terminal', async () => {
    // Navigate to trade
    const tradeBtn = page.locator('button:has-text("Trade")').first();
    if (await tradeBtn.isVisible()) {
      await tradeBtn.click();
      await page.waitForTimeout(2000);
    }

    // Check trading terminal components
    const sidebarVisible = await page.locator('.surface-sidebar').first().isVisible().catch(() => false);
    console.log(`  Trading - Sidebar visible: ${sidebarVisible}`);

    // Check instruments loaded
    const instrumentCount = await page.locator('text=instruments').first().textContent({ timeout: 3000 }).catch(() => '');
    console.log(`  Trading - Instruments: ${instrumentCount}`);

    // Check chart toolbar
    const timeframeVisible = await page.locator('button:has-text("1h")').first().isVisible().catch(() => false);
    console.log(`  Trading - Timeframe buttons: ${timeframeVisible}`);

    // Check order panel
    const buyBtnVisible = await page.locator('button:has-text("Buy")').first().isVisible().catch(() => false);
    const sellBtnVisible = await page.locator('button:has-text("Sell")').first().isVisible().catch(() => false);
    console.log(`  Trading - Buy: ${buyBtnVisible}, Sell: ${sellBtnVisible}`);

    // Check for EUR/USD display
    const eurUsdVisible = await page.locator('text=EUR/USD').first().isVisible().catch(() => false);
    console.log(`  Trading - EUR/USD visible: ${eurUsdVisible}`);

    // Check positions bar (may have open positions or empty state)
    const noPositions = await page.locator('text=No open positions').first().isVisible().catch(() => false);
    const hasPositions = await page.locator('text=Close All').first().isVisible().catch(() => false);
    console.log(`  Trading - Empty state: ${noPositions}, Has positions: ${hasPositions}`);

    // Try clicking on an instrument
    const instruments = page.locator('button:has-text("GBP/USD")');
    if (await instruments.first().isVisible().catch(() => false)) {
      await instruments.first().click();
      await page.waitForTimeout(500);
      console.log('  Trading - Clicked GBP/USD instrument');
    }

    // Try changing timeframe
    const tf5m = page.locator('button:has-text("5m")').first();
    if (await tf5m.isVisible().catch(() => false)) {
      await tf5m.click();
      await page.waitForTimeout(500);
      console.log('  Trading - Changed timeframe to 5m');
    }

    await page.screenshot({ path: 'e2e/screenshots/trading.png', fullPage: false });
    console.log('✓ Trading terminal checked');
  });

  test('6. Place a test order', async () => {
    // Make sure we're on trading page
    const buyBtn = page.locator('button:has-text("Buy EUR/USD"), button:has-text("Buy GBP/USD")').first();

    if (await buyBtn.isVisible().catch(() => false)) {
      await buyBtn.click();
      await page.waitForTimeout(2000);

      // Check for success or error message
      const successVisible = await page.locator('text=BUY').first().isVisible().catch(() => false);
      const errorVisible = await page.locator('.text-sell').first().isVisible().catch(() => false);
      console.log(`  Order - Success indicator: ${successVisible}, Error: ${errorVisible}`);
    } else {
      console.log('  Order - Buy button not found, skipping');
    }

    console.log('✓ Order placement tested');
  });

  test('7. Navigate back to dashboard and test all pages', async () => {
    // Click the TX logo to go back to dashboard
    const logo = page.locator('text=TradeX').first();
    if (await logo.isVisible()) {
      await logo.click();
      await page.waitForTimeout(1000);
    }

    console.log('✓ Navigated back to client area');
  });

  test('8. Social Feed page', async () => {
    const feedBtn = page.locator('button:has-text("Social Feed")').first();
    if (await feedBtn.isVisible()) {
      await feedBtn.click();
      await page.waitForTimeout(1000);
    }

    // Check feed elements (placeholder text on textarea)
    const feedContentVisible = await page.locator('textarea[placeholder*="Share a trade idea"]').first().isVisible().catch(() => false);
    const postsVisible = await page.locator('[class*="card"]').first().isVisible().catch(() => false);
    console.log(`  Feed - Composer: ${feedContentVisible}, Posts: ${postsVisible}`);

    await page.screenshot({ path: 'e2e/screenshots/feed.png', fullPage: false });
    console.log('✓ Social Feed page checked');
  });

  test('9. Copy Trading page', async () => {
    const copyBtn = page.locator('button:has-text("Copy Trading")').first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await page.waitForTimeout(1000);
    }

    const tradersVisible = await page.locator('text=Copy Trader').first().isVisible().catch(() => false);
    console.log(`  Copy - Traders visible: ${tradersVisible}`);

    await page.screenshot({ path: 'e2e/screenshots/copy.png', fullPage: false });
    console.log('✓ Copy Trading page checked');
  });

  test('10. Funds / Deposit page', async () => {
    const fundsBtn = page.locator('button:has-text("Funds")').first();
    if (await fundsBtn.isVisible()) {
      await fundsBtn.click();
      await page.waitForTimeout(1000);
    }

    const depositVisible = await page.locator('text=Deposit').first().isVisible().catch(() => false);
    const withdrawVisible = await page.locator('text=Withdraw').first().isVisible().catch(() => false);
    console.log(`  Funds - Deposit: ${depositVisible}, Withdraw: ${withdrawVisible}`);

    // Check quick amounts
    const quickAmounts = await page.locator('text=$500').first().isVisible().catch(() => false);
    console.log(`  Funds - Quick amounts: ${quickAmounts}`);

    await page.screenshot({ path: 'e2e/screenshots/deposit.png', fullPage: false });
    console.log('✓ Funds page checked');
  });

  test('11. Price Alerts page', async () => {
    const alertsBtn = page.locator('button:has-text("Price Alerts")').first();
    if (await alertsBtn.isVisible()) {
      await alertsBtn.click();
      await page.waitForTimeout(1000);
    }

    const alertsTitle = await page.locator('text=Price Alerts').first().isVisible().catch(() => false);
    console.log(`  Alerts - Title: ${alertsTitle}`);

    await page.screenshot({ path: 'e2e/screenshots/alerts.png', fullPage: false });
    console.log('✓ Price Alerts page checked');
  });

  test('12. History page', async () => {
    const historyBtn = page.locator('button:has-text("History")').first();
    if (await historyBtn.isVisible()) {
      await historyBtn.click();
      await page.waitForTimeout(1000);
    }

    const tradesTabVisible = await page.locator('text=Trades').first().isVisible().catch(() => false);
    const transactionsTabVisible = await page.locator('text=Transactions').first().isVisible().catch(() => false);
    console.log(`  History - Trades tab: ${tradesTabVisible}, Transactions: ${transactionsTabVisible}`);

    await page.screenshot({ path: 'e2e/screenshots/history.png', fullPage: false });
    console.log('✓ History page checked');
  });

  test('13. Settings / Profile page', async () => {
    const settingsBtn = page.locator('button:has-text("Settings")').first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(1000);
    }

    const profileVisible = await page.locator('text=Account Settings').first().isVisible().catch(() => false);
    const themeToggle = await page.locator('text=Appearance').first().isVisible().catch(() => false);
    console.log(`  Settings - Profile: ${profileVisible}, Theme: ${themeToggle}`);

    await page.screenshot({ path: 'e2e/screenshots/settings.png', fullPage: false });
    console.log('✓ Settings page checked');
  });

  test('14. Theme toggle works', async () => {
    // Find and click theme toggle
    const lightModeBtn = page.locator('button:has-text("Light Mode")').first();
    const darkModeBtn = page.locator('button:has-text("Dark Mode")').first();

    if (await lightModeBtn.isVisible()) {
      await lightModeBtn.click();
      await page.waitForTimeout(500);
      // Verify theme changed
      const htmlClass = await page.locator('html').getAttribute('class');
      console.log(`  Theme - After toggle: ${htmlClass}`);

      // Toggle back
      const toggleBack = page.locator('button:has-text("Dark Mode"), button:has-text("Light Mode")').first();
      await toggleBack.click();
      await page.waitForTimeout(500);
    } else if (await darkModeBtn.isVisible()) {
      await darkModeBtn.click();
      await page.waitForTimeout(500);
    }

    console.log('✓ Theme toggle tested');
  });

  test('15. Check for console errors', async () => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate through a few pages to collect errors
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    if (errors.length > 0) {
      console.log('  Console errors found:');
      errors.forEach((e) => console.log(`    - ${e}`));
    } else {
      console.log('  No console errors');
    }

    console.log('✓ Console error check done');
  });

  test('16. Admin panel login', async () => {
    await page.goto(`${BASE}/admin`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check admin login form
    const adminTitle = await page.locator('text=Admin Login').first().isVisible().catch(() => false);
    const adminManage = await page.locator('text=Manage your').first().isVisible().catch(() => false);
    console.log(`  Admin - Login form: ${adminTitle}, Branding: ${adminManage}`);

    // Try logging in
    const tenantInput = page.locator('input[placeholder="Broker UUID"]');
    if (await tenantInput.isVisible()) {
      // The seeded dealer admin (admin@dealer.com) belongs to the dealer tenant.
      await tenantInput.fill(process.env.E2E_DEALER_TENANT_ID || TENANT_ID);

      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('admin@dealer.com');

      const passInput = page.locator('input[type="password"]');
      await passInput.fill('dealer123');

      await page.locator('button:has-text("Sign In")').click();
      await page.waitForTimeout(2000);

      const dashboardVisible = await page.locator('text=Dashboard').first().isVisible().catch(() => false);
      const clientsVisible = await page.locator('text=Clients').first().isVisible().catch(() => false);
      console.log(`  Admin - Dashboard: ${dashboardVisible}, Clients tab: ${clientsVisible}`);

      if (clientsVisible) {
        await page.locator('button:has-text("Clients")').first().click();
        await page.waitForTimeout(1000);
        console.log('  Admin - Clients page loaded');
      }

      const instrumentsTab = page.locator('button:has-text("Instruments")').first();
      if (await instrumentsTab.isVisible()) {
        await instrumentsTab.click();
        await page.waitForTimeout(1000);
        console.log('  Admin - Instruments page loaded');
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/admin.png', fullPage: false });
    console.log('✓ Admin panel checked');
  });

  test('17. SuperAdmin panel login', async () => {
    await page.goto(`${BASE}/superadmin`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const superTitle = await page.locator('text=SuperAdmin').first().isVisible().catch(() => false);
    console.log(`  SuperAdmin - Login form: ${superTitle}`);

    // Try logging in
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@tradexlabel.com');

      const passInput = page.locator('input[type="password"]');
      await passInput.fill('superadmin123');

      await page.locator('button:has-text("Sign In")').click();
      await page.waitForTimeout(2000);

      const tenantsVisible = await page.locator('text=Brokers').first().isVisible().catch(() => false);
      console.log(`  SuperAdmin - Tenants: ${tenantsVisible}`);

      // Check monitoring
      const monitoringTab = page.locator('button:has-text("Monitoring")').first();
      if (await monitoringTab.isVisible()) {
        await monitoringTab.click();
        await page.waitForTimeout(1000);
        const uptimeVisible = await page.locator('text=Server Uptime').first().isVisible().catch(() => false);
        console.log(`  SuperAdmin - Monitoring/Uptime: ${uptimeVisible}`);
      }

      // Check create broker form
      const createTab = page.locator('button:has-text("New Broker")').first();
      if (await createTab.isVisible()) {
        await createTab.click();
        await page.waitForTimeout(500);
        const formVisible = await page.locator('text=Broker Name').first().isVisible().catch(() => false);
        console.log(`  SuperAdmin - Create form: ${formVisible}`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/superadmin.png', fullPage: false });
    console.log('✓ SuperAdmin panel checked');
  });
});
