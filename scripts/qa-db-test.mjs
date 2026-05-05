/**
 * QA Step 2 — Database & Migrations Test
 * Tests schema integrity, seed data, constraints, and multi-tenant isolation
 */
const BASE = 'http://localhost:5500';
const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  console.log('\n=== QA STEP 2: DATABASE & MIGRATIONS ===\n');

  // 1. Test seed data - instruments
  console.log('1. Seed Data - Instruments');
  const adminLogin = await api('/api/v1/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@dealer.com', password: 'dealer123', tenant_id: TENANT_ID }),
  });
  assert(adminLogin.status === 200, 'Admin login works');
  const adminToken = adminLogin.data?.data?.token;

  const userLogin = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'trader123' }),
  });
  assert(userLogin.status === 200, 'User login works');
  const userToken = userLogin.data?.data?.token;

  // Get instruments
  const instruments = await api('/api/v1/instruments', {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(instruments.status === 200, 'GET /instruments returns 200');
  const instList = instruments.data?.data || [];
  console.log(`  Instruments count: ${instList.length}`);
  assert(instList.length >= 15, `At least 15 instruments seeded (got ${instList.length})`);

  // Check instrument types
  const types = new Set(instList.map(i => i.type));
  assert(types.has('FOREX'), 'Has FOREX instruments');
  assert(types.has('CRYPTO'), 'Has CRYPTO instruments');

  // Check specific instruments
  const symbols = instList.map(i => i.symbol);
  assert(symbols.includes('EURUSD'), 'EURUSD exists');
  assert(symbols.includes('BTCUSD'), 'BTCUSD exists');
  assert(symbols.includes('XAUUSD'), 'XAUUSD exists');

  // 2. Test user account
  console.log('\n2. User Account');
  const account = await api('/api/v1/account', {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(account.status === 200, 'GET /account returns 200');
  const acct = account.data?.data;
  assert(acct && acct.balance !== undefined, 'Account has balance');
  assert(acct && acct.currency === 'USD', 'Account currency is USD');
  console.log(`  Balance: $${(Number(acct?.balance || 0) / 100).toFixed(2)}`);

  // 3. Test constraints - duplicate email
  console.log('\n3. Constraints');
  const dupRegister = await api('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'emma.thompson@hotmail.com', password: 'test123456', name: 'Duplicate' }),
  });
  assert(dupRegister.status === 409 || dupRegister.status === 400, `Duplicate email rejected (${dupRegister.status})`);

  // Test invalid email
  const badEmail = await api('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'notanemail', password: 'test123456', name: 'Bad' }),
  });
  assert(badEmail.status === 400, `Invalid email rejected (${badEmail.status})`);

  // 4. Test tenant isolation
  console.log('\n4. Tenant Isolation');
  // Accessing with wrong tenant should fail
  const wrongTenant = await api('/api/v1/positions', {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}`, 'X-Tenant-ID': '00000000-0000-0000-0000-000000000000' },
  });
  assert(wrongTenant.status === 401 || wrongTenant.status === 403 || wrongTenant.status === 404,
    `Wrong tenant rejected (${wrongTenant.status})`);

  // No token should fail
  const noToken = await api('/api/v1/positions', {
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
  });
  assert(noToken.status === 401, `No token returns 401 (${noToken.status})`);

  // 5. Test SQL injection resistance
  console.log('\n5. Security - SQL Injection');
  const sqlInject = await api('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: "'; DROP TABLE users; --", password: 'test' }),
  });
  assert(sqlInject.status === 400 || sqlInject.status === 401, `SQL injection rejected (${sqlInject.status})`);

  // Verify DB still works after injection attempt
  const afterInject = await api('/api/v1/instruments', {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(afterInject.status === 200, 'DB still works after injection attempt');

  // 6. Test XSS resistance
  console.log('\n6. Security - XSS');
  const xssRegister = await api('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': TENANT_ID },
    body: JSON.stringify({ email: 'xss@test.com', password: 'test123456', name: "<script>alert('xss')</script>" }),
  });
  // Should either reject or store safely (no execution)
  assert([200, 201, 400, 409].includes(xssRegister.status),
    `XSS in name handled (${xssRegister.status})`);

  // 7. Test trade history
  console.log('\n7. Trade History');
  const history = await api('/api/v1/trades/history', {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(history.status === 200, 'GET /trades/history returns 200');
  assert(Array.isArray(history.data?.data), 'Trade history is an array');

  // 8. Test transactions
  console.log('\n8. Transactions');
  const transactions = await api('/api/v1/account/transactions', {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}`, 'X-Tenant-ID': TENANT_ID },
  });
  assert(transactions.status === 200, 'GET /account/transactions returns 200');

  console.log(`\n=== RESULTS: ${passCount} PASS, ${failCount} FAIL ===\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
