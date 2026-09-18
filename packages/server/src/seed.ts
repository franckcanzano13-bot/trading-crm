import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from './shared/database/prisma';
import { TenantQuery } from './shared/database/tenant-queries';
import { recordDeposit } from './shared/segregation';
import { ALL_INSTRUMENTS, BCRYPT_SALT_ROUNDS } from '@tradexlabel/shared';

async function seed() {
  console.log('Seeding database...');

  // ─── SuperAdmin ───
  const saPassword = await bcrypt.hash('superadmin123', BCRYPT_SALT_ROUNDS);
  const superadmin = await prisma.superAdmin.upsert({
    where: { email: 'admin@tradexlabel.com' },
    update: {},
    create: {
      email: 'admin@tradexlabel.com',
      password_hash: saPassword,
      name: 'TradeXLabel Admin',
    },
  });
  console.log(`SuperAdmin: ${superadmin.email}`);

  // ─── Demo Broker (B-Book) ───
  let demoBroker = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
  if (!demoBroker) {
    demoBroker = await prisma.tenant.create({
      data: {
        name: 'Demo Broker',
        domain: 'demo.tradexlabel.com',
        slug: 'demo',
        execution_mode: 'B_BOOK',
        config: JSON.stringify({
          branding: { logo_url: '', primary_color: '#2563eb', company_name: 'Demo Broker' },
          trading: {
            default_leverage: 100, max_leverage: 500,
            margin_call_level: 100, stop_out_level: 50,
            max_positions: 100, max_volume_per_trade: 50,
          },
        }),
      },
    });
    console.log(`Tenant: ${demoBroker.name} (${demoBroker.slug})`);
  }

  // ─── Demo Broker Admin ───
  const adminPassword = await bcrypt.hash('admin123', BCRYPT_SALT_ROUNDS);
  await prisma.tenantAdmin.upsert({
    where: { tenant_id_email: { tenant_id: demoBroker.id, email: 'admin@demo.com' } },
    update: {},
    create: {
      tenant_id: demoBroker.id,
      email: 'admin@demo.com',
      password_hash: adminPassword,
      name: 'Demo Admin',
    },
  });
  console.log(`Broker Admin: admin@demo.com`);

  // ─── Dealer Broker ───
  let dealerBroker = await prisma.tenant.findUnique({ where: { slug: 'dealer_demo' } });
  if (!dealerBroker) {
    dealerBroker = await prisma.tenant.create({
      data: {
        name: 'Dealer Demo Broker',
        domain: 'dealer.tradexlabel.com',
        slug: 'dealer_demo',
        execution_mode: 'B_BOOK_DEALER',
        config: JSON.stringify({
          branding: { logo_url: '', primary_color: '#dc2626', company_name: 'Dealer Demo' },
          trading: {
            default_leverage: 200, max_leverage: 500,
            margin_call_level: 100, stop_out_level: 50,
            max_positions: 50, max_volume_per_trade: 20,
          },
        }),
      },
    });
    console.log(`Tenant: ${dealerBroker.name} (${dealerBroker.slug})`);
  }

  const dealerAdminPw = await bcrypt.hash('dealer123', BCRYPT_SALT_ROUNDS);
  await prisma.tenantAdmin.upsert({
    where: { tenant_id_email: { tenant_id: dealerBroker.id, email: 'admin@dealer.com' } },
    update: {},
    create: {
      tenant_id: dealerBroker.id,
      email: 'admin@dealer.com',
      password_hash: dealerAdminPw,
      name: 'Dealer Admin',
    },
  });

  // ─── Seed Instruments + Demo Traders ───
  for (const tenant of [demoBroker, dealerBroker]) {
    const tq = new TenantQuery(tenant.id);
    for (const inst of ALL_INSTRUMENTS) {
      await tq.upsertInstrument({
        symbol: inst.symbol,
        display_name: inst.display,
        type: inst.type,
        pip_size: inst.pip_size,
        lot_size: inst.lot_size,
        base_spread: inst.base_spread,
      });
    }
    console.log(`${ALL_INSTRUMENTS.length} instruments seeded for ${tenant.slug}`);

    const traderPw = await bcrypt.hash('trader123', BCRYPT_SALT_ROUNDS);
    const existingTrader = await tq.findUserByEmail('trader@demo.com');
    if (!existingTrader) {
      const trader = await tq.createUser({
        email: 'trader@demo.com',
        password_hash: traderPw,
        name: 'Demo Trader',
      });
      const depositAmount = BigInt(1000000); // $10,000 in cents
      // Sprint 8.4: seed the demo balance through the segregation ledger so a
      // fresh dev database reports drift_cents = 0 instead of DRIFT_DETECTED.
      await prisma.$transaction(async (tx) => {
        const txq = tq.withTx(tx);
        const account = await txq.createAccount(trader.id, { leverage: 100, balance: depositAmount });
        const transaction = await txq.createTransaction({
          account_id: account.id,
          type: 'DEPOSIT',
          amount: depositAmount,
          description: 'Initial demo deposit',
        });
        await recordDeposit(tx, {
          tenantId: tenant.id, accountId: account.id,
          amountCents: depositAmount, reference: `transaction:${transaction.id}`,
          description: 'Initial demo deposit',
        });
      });
      console.log(`Demo trader: trader@demo.com ($10,000)`);
    }
  }

  console.log('\nSeed complete!\n');
  // ─── Default Plans ───
  const plans = [
    { name: 'Starter', description: 'For small brokers starting out', price_cents: 9900, max_users: 50, max_instruments: 30, features: { support: 'email', api: false, whitelabel: false } },
    { name: 'Professional', description: 'For growing brokers', price_cents: 29900, max_users: 500, max_instruments: 80, features: { support: 'priority', api: true, whitelabel: false } },
    { name: 'Enterprise', description: 'Full white-label solution', price_cents: 99900, max_users: 10000, max_instruments: 200, features: { support: '24/7', api: true, whitelabel: true, custom_domain: true } },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { name: p.name },
      update: { price_cents: p.price_cents, max_users: p.max_users, max_instruments: p.max_instruments, features: JSON.stringify(p.features) },
      create: { ...p, features: JSON.stringify(p.features) },
    });
  }
  console.log('Plans seeded: Starter, Professional, Enterprise');

  // Assign Professional plan to demo brokers
  const proPlan = await prisma.plan.findUnique({ where: { name: 'Professional' } });
  if (proPlan) {
    for (const broker of [demoBroker, dealerBroker]) {
      const existing = await prisma.subscription.findFirst({ where: { tenant_id: broker.id, status: 'ACTIVE' } });
      if (!existing) {
        await prisma.subscription.create({
          data: { tenant_id: broker.id, plan_id: proPlan.id, status: 'ACTIVE' },
        });
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        await prisma.invoice.create({
          data: {
            subscription_id: (await prisma.subscription.findFirst({ where: { tenant_id: broker.id } }))!.id,
            tenant_id: broker.id,
            amount_cents: proPlan.price_cents,
            status: 'PAID',
            period_start: now,
            period_end: nextMonth,
            paid_at: now,
          },
        });
      }
    }
  }

  console.log('Credentials:');
  console.log('  SuperAdmin:     admin@tradexlabel.com / superadmin123');
  console.log('  Broker Admin:   admin@demo.com / admin123');
  console.log('  Dealer Admin:   admin@dealer.com / dealer123');
  console.log('  Trader:         trader@demo.com / trader123');
  console.log(`\n  Demo Tenant ID:   ${demoBroker.id}`);
  console.log(`  Dealer Tenant ID: ${dealerBroker.id}`);
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
