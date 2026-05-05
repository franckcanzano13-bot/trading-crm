import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from './shared/database/prisma';
import { BCRYPT_SALT_ROUNDS } from '@tradexlabel/shared';

const CLIENTS = [
  { name: 'Sophia Martinez', email: 'sophia.martinez@gmail.com', balance: 2450000, kyc: 'VERIFIED', status: 'ACTIVE' },
  { name: 'James Chen', email: 'james.chen@outlook.com', balance: 8750000, kyc: 'VERIFIED', status: 'ACTIVE' },
  { name: 'Aisha Patel', email: 'aisha.patel@yahoo.com', balance: 1200000, kyc: 'VERIFIED', status: 'ACTIVE' },
  { name: 'Luca Rossi', email: 'luca.rossi@gmail.com', balance: 5300000, kyc: 'VERIFIED', status: 'ACTIVE' },
  { name: 'Emma Thompson', email: 'emma.thompson@hotmail.com', balance: 350000, kyc: 'PENDING', status: 'ACTIVE' },
  { name: 'Yuki Tanaka', email: 'yuki.tanaka@gmail.com', balance: 15000000, kyc: 'VERIFIED', status: 'ACTIVE' },
  { name: 'Omar Benali', email: 'omar.benali@proton.me', balance: 780000, kyc: 'NONE', status: 'ACTIVE' },
  { name: 'Isabella Schmidt', email: 'isabella.schmidt@gmail.com', balance: 4100000, kyc: 'VERIFIED', status: 'BLOCKED' },
  { name: 'David Kowalski', email: 'david.kowalski@outlook.com', balance: 960000, kyc: 'REJECTED', status: 'ACTIVE' },
  { name: 'Fatima Al-Rashid', email: 'fatima.alrashid@gmail.com', balance: 32000000, kyc: 'VERIFIED', status: 'ACTIVE' },
];

// Trades: some open, some closed with P&L
const TRADE_TEMPLATES = [
  // Sophia - 2 closed profitable, 1 open
  { clientIdx: 0, symbol: 'EURUSD', side: 'BUY', volume: 0.5, openPrice: 108500, closePrice: 109200, pnl: 35000, status: 'CLOSED' },
  { clientIdx: 0, symbol: 'GBPUSD', side: 'SELL', volume: 0.3, openPrice: 126800, closePrice: 126100, pnl: 21000, status: 'CLOSED' },
  { clientIdx: 0, symbol: 'XAUUSD', side: 'BUY', volume: 0.1, openPrice: 230500000, closePrice: null, pnl: 0, status: 'OPEN' },
  // James - big trader, 3 closed, 2 open
  { clientIdx: 1, symbol: 'BTCUSD', side: 'BUY', volume: 1.0, openPrice: 6785000000, closePrice: 6820000000, pnl: 350000, status: 'CLOSED' },
  { clientIdx: 1, symbol: 'EURUSD', side: 'BUY', volume: 2.0, openPrice: 107800, closePrice: 108600, pnl: 160000, status: 'CLOSED' },
  { clientIdx: 1, symbol: 'USDJPY', side: 'SELL', volume: 1.5, openPrice: 15250000, closePrice: 15180000, pnl: 69000, status: 'CLOSED' },
  { clientIdx: 1, symbol: 'XAUUSD', side: 'BUY', volume: 0.5, openPrice: 229800000, closePrice: null, pnl: 0, status: 'OPEN' },
  { clientIdx: 1, symbol: 'GBPUSD', side: 'SELL', volume: 1.0, openPrice: 127300, closePrice: null, pnl: 0, status: 'OPEN' },
  // Aisha - small trader, 1 closed loss, 1 open
  { clientIdx: 2, symbol: 'EURUSD', side: 'SELL', volume: 0.1, openPrice: 109100, closePrice: 109500, pnl: -4000, status: 'CLOSED' },
  { clientIdx: 2, symbol: 'ETHUSD', side: 'BUY', volume: 0.5, openPrice: 380000000, closePrice: null, pnl: 0, status: 'OPEN' },
  // Luca - 2 closed mixed
  { clientIdx: 3, symbol: 'US30', side: 'BUY', volume: 0.2, openPrice: 3980000, closePrice: 3995000, pnl: 30000, status: 'CLOSED' },
  { clientIdx: 3, symbol: 'XAUUSD', side: 'SELL', volume: 0.3, openPrice: 231000000, closePrice: 231800000, pnl: -24000, status: 'CLOSED' },
  { clientIdx: 3, symbol: 'EURUSD', side: 'BUY', volume: 1.0, openPrice: 108200, closePrice: null, pnl: 0, status: 'OPEN' },
  // Yuki - whale, many trades
  { clientIdx: 5, symbol: 'BTCUSD', side: 'BUY', volume: 2.0, openPrice: 6750000000, closePrice: 6830000000, pnl: 1600000, status: 'CLOSED' },
  { clientIdx: 5, symbol: 'XAUUSD', side: 'BUY', volume: 1.0, openPrice: 228500000, closePrice: 231200000, pnl: 270000, status: 'CLOSED' },
  { clientIdx: 5, symbol: 'EURUSD', side: 'BUY', volume: 5.0, openPrice: 107500, closePrice: 108900, pnl: 700000, status: 'CLOSED' },
  { clientIdx: 5, symbol: 'GBPUSD', side: 'BUY', volume: 3.0, openPrice: 126200, closePrice: null, pnl: 0, status: 'OPEN' },
  { clientIdx: 5, symbol: 'BTCUSD', side: 'SELL', volume: 0.5, openPrice: 6850000000, closePrice: null, pnl: 0, status: 'OPEN' },
  // Fatima - biggest whale
  { clientIdx: 9, symbol: 'BTCUSD', side: 'BUY', volume: 5.0, openPrice: 6700000000, closePrice: 6890000000, pnl: 9500000, status: 'CLOSED' },
  { clientIdx: 9, symbol: 'XAUUSD', side: 'BUY', volume: 2.0, openPrice: 225000000, closePrice: 231000000, pnl: 1200000, status: 'CLOSED' },
  { clientIdx: 9, symbol: 'EURUSD', side: 'SELL', volume: 10.0, openPrice: 109800, closePrice: 109200, pnl: 600000, status: 'CLOSED' },
  { clientIdx: 9, symbol: 'US30', side: 'BUY', volume: 1.0, openPrice: 3950000, closePrice: null, pnl: 0, status: 'OPEN' },
  { clientIdx: 9, symbol: 'BTCUSD', side: 'BUY', volume: 2.0, openPrice: 6810000000, closePrice: null, pnl: 0, status: 'OPEN' },
  // Isabella (blocked) had trades before being blocked
  { clientIdx: 7, symbol: 'EURUSD', side: 'BUY', volume: 5.0, openPrice: 108000, closePrice: 108100, pnl: 50000, status: 'CLOSED' },
  { clientIdx: 7, symbol: 'BTCUSD', side: 'BUY', volume: 3.0, openPrice: 6500000000, closePrice: 6510000000, pnl: 300000, status: 'CLOSED' },
  // David - losing trader
  { clientIdx: 8, symbol: 'EURUSD', side: 'BUY', volume: 0.5, openPrice: 109500, closePrice: 108800, pnl: -35000, status: 'CLOSED' },
  { clientIdx: 8, symbol: 'GBPUSD', side: 'BUY', volume: 0.3, openPrice: 127500, closePrice: 126900, pnl: -18000, status: 'CLOSED' },
  { clientIdx: 8, symbol: 'XAUUSD', side: 'SELL', volume: 0.2, openPrice: 229000000, closePrice: 231500000, pnl: -50000, status: 'CLOSED' },
];

const TRANSACTION_TEMPLATES = [
  // Sophia
  { clientIdx: 0, type: 'DEPOSIT', amount: 2000000, desc: 'Wire transfer deposit', daysAgo: 30 },
  { clientIdx: 0, type: 'DEPOSIT', amount: 500000, desc: 'Credit card deposit', daysAgo: 15 },
  { clientIdx: 0, type: 'WITHDRAWAL', amount: -50000, desc: 'Bank withdrawal', daysAgo: 5 },
  // James
  { clientIdx: 1, type: 'DEPOSIT', amount: 5000000, desc: 'Wire transfer deposit', daysAgo: 45 },
  { clientIdx: 1, type: 'DEPOSIT', amount: 3000000, desc: 'Wire transfer deposit', daysAgo: 20 },
  { clientIdx: 1, type: 'DEPOSIT', amount: 1000000, desc: 'Crypto deposit (USDT)', daysAgo: 7 },
  { clientIdx: 1, type: 'WITHDRAWAL', amount: -250000, desc: 'Bank withdrawal', daysAgo: 3 },
  // Aisha
  { clientIdx: 2, type: 'DEPOSIT', amount: 1000000, desc: 'Credit card deposit', daysAgo: 25 },
  { clientIdx: 2, type: 'DEPOSIT', amount: 200000, desc: 'Credit card deposit', daysAgo: 10 },
  // Luca
  { clientIdx: 3, type: 'DEPOSIT', amount: 3000000, desc: 'Wire transfer deposit', daysAgo: 60 },
  { clientIdx: 3, type: 'DEPOSIT', amount: 2000000, desc: 'Wire transfer deposit', daysAgo: 30 },
  { clientIdx: 3, type: 'WITHDRAWAL', amount: -700000, desc: 'Bank withdrawal', daysAgo: 12 },
  // Emma
  { clientIdx: 4, type: 'DEPOSIT', amount: 350000, desc: 'Credit card deposit', daysAgo: 3 },
  // Yuki - whale deposits
  { clientIdx: 5, type: 'DEPOSIT', amount: 10000000, desc: 'Wire transfer deposit', daysAgo: 90 },
  { clientIdx: 5, type: 'DEPOSIT', amount: 5000000, desc: 'Wire transfer deposit', daysAgo: 45 },
  { clientIdx: 5, type: 'WITHDRAWAL', amount: -2000000, desc: 'Bank withdrawal', daysAgo: 20 },
  { clientIdx: 5, type: 'DEPOSIT', amount: 2000000, desc: 'Crypto deposit (BTC)', daysAgo: 5 },
  // Omar
  { clientIdx: 6, type: 'DEPOSIT', amount: 500000, desc: 'Credit card deposit', daysAgo: 7 },
  { clientIdx: 6, type: 'DEPOSIT', amount: 280000, desc: 'Credit card deposit', daysAgo: 2 },
  // Isabella
  { clientIdx: 7, type: 'DEPOSIT', amount: 5000000, desc: 'Wire transfer deposit', daysAgo: 40 },
  { clientIdx: 7, type: 'WITHDRAWAL', amount: -900000, desc: 'Bank withdrawal', daysAgo: 15 },
  // David
  { clientIdx: 8, type: 'DEPOSIT', amount: 1500000, desc: 'Wire transfer deposit', daysAgo: 35 },
  { clientIdx: 8, type: 'WITHDRAWAL', amount: -200000, desc: 'Bank withdrawal', daysAgo: 10 },
  { clientIdx: 8, type: 'DEPOSIT', amount: 300000, desc: 'Credit card top-up', daysAgo: 4 },
  // Fatima - biggest whale
  { clientIdx: 9, type: 'DEPOSIT', amount: 20000000, desc: 'Wire transfer deposit', daysAgo: 120 },
  { clientIdx: 9, type: 'DEPOSIT', amount: 10000000, desc: 'Wire transfer deposit', daysAgo: 60 },
  { clientIdx: 9, type: 'DEPOSIT', amount: 5000000, desc: 'Crypto deposit (USDT)', daysAgo: 20 },
  { clientIdx: 9, type: 'WITHDRAWAL', amount: -3000000, desc: 'Bank withdrawal', daysAgo: 8 },
];

async function seedClients() {
  console.log('Seeding 10 realistic clients...\n');

  // Get both tenants
  const demoBroker = await prisma.tenant.findFirst({ where: { slug: 'demo' } });
  const dealerBroker = await prisma.tenant.findFirst({ where: { slug: 'dealer_demo' } });

  if (!demoBroker || !dealerBroker) {
    console.error('Tenants not found! Run the main seed first: npm run seed');
    process.exit(1);
  }

  const password = await bcrypt.hash('trader123', BCRYPT_SALT_ROUNDS);

  for (const tenant of [demoBroker, dealerBroker]) {
    console.log(`\n─── ${tenant.name} (${tenant.slug}) ───`);

    // Get instruments map
    const instruments = await prisma.instrument.findMany({ where: { tenant_id: tenant.id } });
    const instrumentMap = new Map(instruments.map(i => [i.symbol, i]));

    const createdUsers: { id: string; accountId: string; idx: number }[] = [];

    // Create 10 clients
    for (let i = 0; i < CLIENTS.length; i++) {
      const c = CLIENTS[i];

      // Check if already exists
      const existing = await prisma.user.findFirst({
        where: { tenant_id: tenant.id, email: c.email },
      });

      if (existing) {
        const acc = await prisma.account.findFirst({ where: { tenant_id: tenant.id, user_id: existing.id } });
        if (acc) createdUsers.push({ id: existing.id, accountId: acc.id, idx: i });
        console.log(`  [skip] ${c.name} already exists`);
        continue;
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          tenant_id: tenant.id,
          email: c.email,
          password_hash: password,
          name: c.name,
          status: c.status,
          kyc_status: c.kyc,
          created_at: new Date(Date.now() - Math.random() * 90 * 86400000), // random date in last 90 days
        },
      });

      // Margin used from open positions (will compute after trades)
      const leverage = c.balance > 10000000 ? 200 : 100;
      const account = await prisma.account.create({
        data: {
          tenant_id: tenant.id,
          user_id: user.id,
          currency: 'USD',
          balance: BigInt(c.balance),
          margin_used: BigInt(0),
          equity: BigInt(c.balance),
          leverage,
        },
      });

      createdUsers.push({ id: user.id, accountId: account.id, idx: i });
      console.log(`  [+] ${c.name} — $${(c.balance / 100).toLocaleString()} — KYC: ${c.kyc} — ${c.status}`);
    }

    // Create trades
    let marginByAccount = new Map<string, bigint>();

    for (const t of TRADE_TEMPLATES) {
      const userInfo = createdUsers.find(u => u.idx === t.clientIdx);
      if (!userInfo) continue;

      const instrument = instrumentMap.get(t.symbol);
      if (!instrument) continue;

      // Check if trade already exists (simple dedup by checking count)
      const existingTradeCount = await prisma.trade.count({
        where: { tenant_id: tenant.id, user_id: userInfo.id, instrument_id: instrument.id, side: t.side, volume: t.volume },
      });
      if (existingTradeCount > 0) continue;

      const daysAgo = Math.floor(Math.random() * 30) + 1;
      const openTime = new Date(Date.now() - daysAgo * 86400000);

      await prisma.trade.create({
        data: {
          tenant_id: tenant.id,
          user_id: userInfo.id,
          account_id: userInfo.accountId,
          instrument_id: instrument.id,
          side: t.side,
          volume: t.volume,
          open_price: BigInt(t.openPrice),
          close_price: t.closePrice ? BigInt(t.closePrice) : null,
          open_time: openTime,
          close_time: t.status === 'CLOSED' ? new Date(openTime.getTime() + Math.random() * 5 * 86400000) : null,
          pnl: BigInt(t.pnl),
          status: t.status,
          commission: BigInt(Math.floor(t.volume * 700)), // $7 per lot
        },
      });

      // Track margin for open positions
      if (t.status === 'OPEN') {
        const currentMargin = marginByAccount.get(userInfo.accountId) ?? BigInt(0);
        const posMargin = BigInt(Math.floor(t.volume * 100000 / (CLIENTS[t.clientIdx].balance > 10000000 ? 200 : 100) * 100));
        marginByAccount.set(userInfo.accountId, currentMargin + posMargin);
      }
    }
    console.log(`  [+] ${TRADE_TEMPLATES.length} trades created`);

    // Update margin_used on accounts
    for (const [accountId, margin] of marginByAccount) {
      const acc = await prisma.account.findFirst({ where: { id: accountId } });
      if (acc) {
        await prisma.account.update({
          where: { id: accountId },
          data: { margin_used: margin, equity: acc.balance - margin },
        });
      }
    }

    // Create transactions
    for (const tx of TRANSACTION_TEMPLATES) {
      const userInfo = createdUsers.find(u => u.idx === tx.clientIdx);
      if (!userInfo) continue;

      // Dedup check
      const existingTx = await prisma.transaction.count({
        where: { tenant_id: tenant.id, account_id: userInfo.accountId, type: tx.type, amount: BigInt(Math.abs(tx.amount)), description: tx.desc },
      });
      if (existingTx > 0) continue;

      await prisma.transaction.create({
        data: {
          tenant_id: tenant.id,
          account_id: userInfo.accountId,
          type: tx.type,
          amount: BigInt(Math.abs(tx.amount)),
          description: tx.desc,
          created_at: new Date(Date.now() - tx.daysAgo * 86400000),
        },
      });
    }
    console.log(`  [+] ${TRANSACTION_TEMPLATES.length} transactions created`);

    // Create some pending orders too
    const pendingOrders = [
      { clientIdx: 1, symbol: 'EURUSD', type: 'LIMIT', side: 'BUY', volume: 1.0, price: BigInt(107000) },
      { clientIdx: 5, symbol: 'BTCUSD', type: 'LIMIT', side: 'SELL', volume: 1.0, price: BigInt(7000000000) },
      { clientIdx: 5, symbol: 'XAUUSD', type: 'STOP', side: 'BUY', volume: 0.5, price: BigInt(235000000) },
      { clientIdx: 9, symbol: 'EURUSD', type: 'LIMIT', side: 'SELL', volume: 5.0, price: BigInt(112000) },
      { clientIdx: 3, symbol: 'GBPUSD', type: 'LIMIT', side: 'BUY', volume: 0.5, price: BigInt(125000) },
    ];

    for (const o of pendingOrders) {
      const userInfo = createdUsers.find(u => u.idx === o.clientIdx);
      const instrument = instrumentMap.get(o.symbol);
      if (!userInfo || !instrument) continue;

      const existing = await prisma.order.count({
        where: { tenant_id: tenant.id, user_id: userInfo.id, instrument_id: instrument.id, status: 'PENDING' },
      });
      if (existing > 0) continue;

      await prisma.order.create({
        data: {
          tenant_id: tenant.id,
          user_id: userInfo.id,
          instrument_id: instrument.id,
          type: o.type,
          side: o.side,
          volume: o.volume,
          price: o.price,
          status: 'PENDING',
        },
      });
    }
    console.log(`  [+] ${pendingOrders.length} pending orders created`);
  }

  console.log('\n\nSeed complete! 10 clients with full data on both brokers.');
  console.log('\nAll clients password: trader123');
  console.log('\nClient summary:');
  CLIENTS.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name.padEnd(22)} $${(c.balance / 100).toLocaleString().padStart(10)} KYC:${c.kyc.padEnd(10)} ${c.status}`);
  });
}

seedClients()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
