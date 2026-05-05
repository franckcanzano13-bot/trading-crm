import { prisma } from '../../shared/database/prisma';
import crypto from 'crypto';

const TENANT_ID = '944dc16d-ede5-4dff-81f5-839285b3229a';
const ADMIN_ID = '49dc1cd1-1a37-41cd-922f-0cbdff115c91'; // Dealer Admin

function generateCode(prefix: string, len = 8): string {
  return prefix + '_' + crypto.randomBytes(len).toString('hex').substring(0, len);
}

const FIRST_NAMES = ['James', 'Olivia', 'Mohammed', 'Sofia', 'Chen', 'Emma', 'Raj', 'Isabella', 'Yuki', 'Aisha', 'Lucas', 'Fatima', 'Diego', 'Mei', 'Alexandre', 'Nadia', 'Viktor', 'Priya', 'Marco', 'Lena', 'Omar', 'Chloe', 'Andrei', 'Zara', 'Kenji', 'Marie', 'Hassan', 'Elena', 'Carlos', 'Julia', 'Wei', 'Anna', 'Pavel', 'Sara', 'Takeshi', 'Nina', 'Ali', 'Sophia', 'Dmitri', 'Laura', 'Ahmed', 'Charlotte', 'Boris', 'Amy', 'Ivan', 'Lisa', 'Sergei', 'Kate', 'Pierre', 'Mia'];
const LAST_NAMES = ['Smith', 'Al-Rashid', 'Zhang', 'Rodriguez', 'Müller', 'Tanaka', 'Patel', 'Rossi', 'Kim', 'Santos', 'Petrov', 'Nakamura', 'O\'Brien', 'Fischer', 'Li', 'Moreau', 'Singh', 'Colombo', 'Watanabe', 'Johansson', 'Novak', 'Chen', 'Dubois', 'Fernandez', 'Schneider', 'Popov', 'Yamamoto', 'Ivanov', 'Costa', 'Larsson', 'Hoffman', 'Sato', 'Kozlov', 'Park', 'Weber', 'Suzuki', 'Romanov', 'Liu', 'Berger', 'Thompson'];
const COUNTRIES = ['US', 'UK', 'DE', 'FR', 'SA', 'AE', 'JP', 'CN', 'IN', 'BR', 'KR', 'IT', 'ES', 'CA', 'AU', 'NL', 'CH', 'SE', 'SG', 'MY'];
const LANGUAGES = ['en', 'ar', 'de', 'fr', 'ja', 'zh', 'pt', 'es', 'it', 'ko'];
const SOURCES = ['GOOGLE', 'FACEBOOK', 'AFFILIATE', 'REFERRAL', 'DIRECT', 'EMAIL', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE', 'TWITTER'];
const STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'DEMO', 'FTD', 'CONVERTED', 'LOST'];
const STATUS_WEIGHTS = [15, 12, 10, 8, 6, 5, 4]; // weighted distribution
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'VIP'];
const NOTE_TEMPLATES = [
  'Client very interested in forex trading. Wants to start with EUR/USD.',
  'Called and discussed account types. Will follow up on Friday.',
  'Requested demo account. Sent login credentials via email.',
  'High net worth individual. Previous experience with IG Markets.',
  'First time trader, needs educational materials.',
  'Interested in crypto pairs. Specifically BTC and ETH.',
  'Client called back asking about leverage options.',
  'Sent welcome email with platform overview.',
  'Discussed risk management strategies.',
  'Client wants to deposit $10,000 — needs bank wire details.',
  'Follow-up: client has not logged into demo for 3 days.',
  'Re-engaged after 2 weeks. Now interested in commodities.',
  'VIP client referred by existing trader. Priority onboarding.',
  'Technical issue resolved. Client happy with support.',
  'Completed KYC verification. Ready for live account.',
  'Client comparing us with competitors. Needs competitive spreads info.',
  'Discussed Islamic account options for the client.',
  'Client interested in copy trading feature.',
  'Scheduled Zoom demo for Wednesday 3pm.',
  'Retention call — client considering withdrawal. Offered bonus.',
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pastDate(maxDaysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - rand(0, maxDaysAgo));
  d.setHours(rand(8, 20), rand(0, 59), rand(0, 59));
  return d;
}
function futureDate(maxDaysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + rand(1, maxDaysAhead));
  d.setHours(rand(8, 20), rand(0, 59));
  return d;
}
function weightedPick(items: string[], weights: number[]): string {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export async function seedCRM() {
  console.log('[CRM Seed] Starting...');

  // Clean existing CRM data
  await prisma.note.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.call.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.crmTask.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.commission.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.lead.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.affiliate.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.campaign.deleteMany({ where: { tenant_id: TENANT_ID } });

  // ─── Create additional admin agents ───
  const agentEmails = ['sarah.sales@dealer.com', 'mike.retention@dealer.com', 'lisa.senior@dealer.com'];
  const agentIds: string[] = [ADMIN_ID];

  for (const email of agentEmails) {
    const existing = await prisma.tenantAdmin.findFirst({ where: { tenant_id: TENANT_ID, email } });
    if (!existing) {
      const bcrypt = await import('bcrypt');
      const hash = await bcrypt.hash('agent123', 10);
      const admin = await prisma.tenantAdmin.create({
        data: { tenant_id: TENANT_ID, email, password_hash: hash, name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()), role: 'agent' },
      });
      agentIds.push(admin.id);
    } else {
      agentIds.push(existing.id);
    }
  }

  // ─── Create Affiliates ───
  const affiliateData = [
    { name: 'TradeMedia Group', email: 'partners@trademedia.io', company: 'TradeMedia Ltd', commission_type: 'CPA', cpa_amount: 25000, total_leads: 45, total_ftds: 12, total_commission: 300000 },
    { name: 'FinanceAds Global', email: 'aff@financeads.com', company: 'FinanceAds GmbH', commission_type: 'HYBRID', cpa_amount: 20000, cpl_amount: 500, revenue_share: 15, total_leads: 120, total_ftds: 28, total_commission: 620000 },
    { name: 'CryptoInfluencer Pro', email: 'collab@cryptoinfluencer.pro', company: '', commission_type: 'CPL', cpl_amount: 300, total_leads: 230, total_ftds: 8, total_commission: 69000 },
    { name: 'FX Partners Asia', email: 'biz@fxpartners.asia', company: 'FX Partners Pte Ltd', commission_type: 'REVENUE_SHARE', revenue_share: 25, total_leads: 67, total_ftds: 22, total_commission: 450000 },
    { name: 'Digital Leads Pro', email: 'api@digitalleadspro.com', company: 'DLP Marketing', commission_type: 'CPA', cpa_amount: 30000, total_leads: 89, total_ftds: 15, total_commission: 450000 },
  ];

  const affiliateIds: string[] = [];
  for (const a of affiliateData) {
    const aff = await prisma.affiliate.create({
      data: {
        tenant_id: TENANT_ID,
        name: a.name, email: a.email, company: a.company,
        commission_type: a.commission_type,
        cpa_amount: BigInt(a.cpa_amount || 0),
        cpl_amount: BigInt(a.cpl_amount || 0),
        revenue_share: a.revenue_share || 0,
        tracking_code: generateCode('AFF'),
        api_key: generateCode('ak', 24),
        total_leads: a.total_leads,
        total_ftds: a.total_ftds,
        total_commission: BigInt(a.total_commission),
        total_paid: BigInt(Math.floor(a.total_commission * 0.7)),
        status: 'ACTIVE',
      },
    });
    affiliateIds.push(aff.id);
  }

  // ─── Create Campaigns ───
  const campaignData = [
    { name: 'Q1 2026 Google Forex', source: 'GOOGLE', budget_cents: 500000 },
    { name: 'Facebook Crypto Campaign', source: 'FACEBOOK', budget_cents: 300000 },
    { name: 'LinkedIn B2B Traders', source: 'LINKEDIN', budget_cents: 200000 },
    { name: 'Email Re-engagement Mar 2026', source: 'EMAIL', budget_cents: 50000 },
    { name: 'YouTube Trading Tutorials', source: 'YOUTUBE', budget_cents: 150000 },
    { name: 'Instagram Influencer Collab', source: 'INSTAGRAM', budget_cents: 250000 },
  ];

  const campaignIds: string[] = [];
  for (const c of campaignData) {
    const camp = await prisma.campaign.create({
      data: {
        tenant_id: TENANT_ID, name: c.name, source: c.source,
        budget_cents: BigInt(c.budget_cents),
        spent_cents: BigInt(Math.floor(c.budget_cents * Math.random() * 0.8)),
        total_leads: rand(10, 80),
        total_ftds: rand(2, 15),
        starts_at: pastDate(60),
      },
    });
    campaignIds.push(camp.id);
  }

  // ─── Create 80 Leads ───
  const usedEmails = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    let email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/'/g, '')}${rand(1, 99)}@${pick(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'protonmail.com'])}`;
    while (usedEmails.has(email)) email = email.replace('@', `${rand(100, 999)}@`);
    usedEmails.add(email);

    const status = weightedPick(STATUSES, STATUS_WEIGHTS);
    const isAffiliate = Math.random() < 0.35;
    const hasCampaign = Math.random() < 0.4;
    const department = Math.random() < 0.6 ? 'SELLER' : 'RETENTION';
    const createdAt = pastDate(90);
    const isFTD = status === 'FTD' || status === 'CONVERTED';
    const ftdAmount = isFTD ? BigInt(rand(10000, 500000)) : BigInt(0); // $100 to $5000

    const lead = await prisma.lead.create({
      data: {
        tenant_id: TENANT_ID,
        email,
        phone: `+${rand(1, 9)}${String(rand(100000000, 999999999))}`,
        first_name: firstName,
        last_name: lastName,
        country: pick(COUNTRIES),
        language: pick(LANGUAGES),
        source: isAffiliate ? 'AFFILIATE' : pick(SOURCES),
        affiliate_id: isAffiliate ? pick(affiliateIds) : null,
        campaign_id: hasCampaign ? pick(campaignIds) : null,
        status,
        assigned_to: Math.random() < 0.85 ? pick(agentIds) : null,
        department,
        priority: pick(PRIORITIES),
        ftd_amount: ftdAmount,
        ftd_date: isFTD ? pastDate(30) : null,
        last_contact: ['CONTACTED', 'INTERESTED', 'DEMO', 'FTD', 'CONVERTED'].includes(status) ? pastDate(7) : null,
        next_follow_up: ['NEW', 'CONTACTED', 'INTERESTED', 'DEMO'].includes(status) && Math.random() < 0.6 ? futureDate(7) : null,
        notes_count: 0,
        calls_count: 0,
        ip_address: `${rand(1, 255)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 255)}`,
        utm_source: hasCampaign ? pick(['google', 'facebook', 'linkedin', 'youtube', 'instagram']) : '',
        utm_medium: hasCampaign ? pick(['cpc', 'cpm', 'social', 'email', 'organic']) : '',
        utm_campaign: hasCampaign ? pick(['forex_q1', 'crypto_march', 'retarget_2026', 'brand_awareness']) : '',
        created_at: createdAt,
      },
    });

    // Add 1-5 notes per lead
    const numNotes = rand(1, 5);
    for (let n = 0; n < numNotes; n++) {
      await prisma.note.create({
        data: {
          tenant_id: TENANT_ID,
          lead_id: lead.id,
          author_id: pick(agentIds),
          content: pick(NOTE_TEMPLATES),
          type: pick(['NOTE', 'NOTE', 'NOTE', 'EMAIL', 'SMS']),
          created_at: pastDate(30),
        },
      });
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { notes_count: numNotes } });

    // Add 0-3 calls per lead
    const numCalls = rand(0, 3);
    for (let c = 0; c < numCalls; c++) {
      await prisma.call.create({
        data: {
          tenant_id: TENANT_ID,
          lead_id: lead.id,
          agent_id: pick(agentIds),
          direction: pick(['OUTBOUND', 'OUTBOUND', 'INBOUND']),
          status: pick(['COMPLETED', 'COMPLETED', 'COMPLETED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY']),
          duration: rand(15, 600),
          notes: Math.random() < 0.6 ? pick(NOTE_TEMPLATES) : '',
          created_at: pastDate(20),
        },
      });
    }
    if (numCalls > 0) await prisma.lead.update({ where: { id: lead.id }, data: { calls_count: numCalls } });
  }

  // ─── Create Tasks ───
  const taskTitles = [
    'Follow up on demo account', 'Send platform tutorial video', 'Call back after lunch',
    'Schedule deposit assistance', 'Review KYC documents', 'Send competitive analysis',
    'Onboarding call — premium client', 'Re-engagement email campaign', 'Monthly review call',
    'Introduce to premium account manager', 'Send Islamic account details', 'Demo walkthrough session',
    'Birthday greeting + special offer', 'Post-deposit check-in call', 'Discuss portfolio strategy',
  ];

  const leads = await prisma.lead.findMany({ where: { tenant_id: TENANT_ID }, take: 30 });
  for (let i = 0; i < 25; i++) {
    const lead = i < leads.length ? leads[i] : null;
    await prisma.crmTask.create({
      data: {
        tenant_id: TENANT_ID,
        lead_id: lead?.id || null,
        assigned_to: pick(agentIds),
        title: pick(taskTitles),
        type: pick(['FOLLOW_UP', 'CALL_BACK', 'EMAIL', 'DEMO', 'MEETING']),
        priority: pick(PRIORITIES),
        status: pick(['PENDING', 'PENDING', 'PENDING', 'IN_PROGRESS', 'COMPLETED']),
        due_at: Math.random() < 0.6 ? futureDate(7) : pastDate(3),
      },
    });
  }

  // ─── Create Commissions ───
  for (const affId of affiliateIds) {
    const numComm = rand(3, 10);
    for (let i = 0; i < numComm; i++) {
      await prisma.commission.create({
        data: {
          tenant_id: TENANT_ID,
          affiliate_id: affId,
          type: pick(['CPA', 'CPL', 'REVENUE_SHARE']),
          amount: BigInt(rand(300, 30000)),
          status: pick(['PENDING', 'APPROVED', 'PAID', 'PAID', 'PAID']),
          description: `Commission for ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
          created_at: pastDate(60),
        },
      });
    }
  }

  const totalLeads = await prisma.lead.count({ where: { tenant_id: TENANT_ID } });
  const totalCalls = await prisma.call.count({ where: { tenant_id: TENANT_ID } });
  const totalNotes = await prisma.note.count({ where: { tenant_id: TENANT_ID } });
  const totalTasks = await prisma.crmTask.count({ where: { tenant_id: TENANT_ID } });
  const totalAffs = await prisma.affiliate.count({ where: { tenant_id: TENANT_ID } });

  console.log(`[CRM Seed] Done! ${totalLeads} leads, ${totalCalls} calls, ${totalNotes} notes, ${totalTasks} tasks, ${totalAffs} affiliates`);
}
