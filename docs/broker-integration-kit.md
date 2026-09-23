# Broker integration kit

Everything a new broker's team needs to go from "tenant created" to "clients
trading on our domain". Roadmap Phase 2.4. Written for the broker's IT
contact; TradeXLabel support does the platform side.

## 0. What you receive from TradeXLabel

- Your **tenant id** (UUID) and **slug**, the login page for your staff
  (`/crm`, `/admin`, and `/dealer` if your execution mode includes the dealing desk).
- Your first administrator account. Enable 2FA on it the first day
  (Settings → Security); every other staff member does the same.
- The plan you are on and its ceilings (clients, active instruments). The
  admin dashboard shows usage against them.

## 1. Domain (white-label)

Clients should never see a TradeXLabel address.

1. Choose the domain, e.g. `trade.yourbrand.com`. Tell support: it goes into
   your tenant's `domain` field.
2. Create two DNS records at your registrar:
   ```
   trade.yourbrand.com       CNAME  <web host given by support>
   api.trade.yourbrand.com   CNAME  <api host given by support>
   ```
3. Support adds both hosts to the TLS router; certificates are issued
   automatically on first visit.
4. Check: open `https://trade.yourbrand.com` — the login page shows
   "Signing in to <your company name>" and no Broker ID field.

## 2. Branding

Admin → Settings → Branding: company name, logo (PNG/SVG, 400×100 max), primary
colour, support email and phone, postal address, website. These appear in the
web app header, in every email sent to your clients, and on the legal pages.

## 3. Email (SMTP)

Transactional email (password reset, email confirmation, withdrawal decisions,
CRM campaigns) is sent **from your own mail domain** so it lands in inboxes.

- Admin → Settings → Email: SMTP host, port (587 STARTTLS or 465 TLS), user,
  password, from-name and from-address. The password is stored encrypted.
- Publish SPF and DKIM for the from-domain with your email provider; add a
  DMARC record. Without them, resets and confirmations go to spam.
- Send a test from the same screen. Sent mail is logged (Admin → Emails).

Until SMTP is configured, no client email goes out (the platform logs the
attempt). Configure it before opening registrations.

## 4. Identity verification (KYC)

The platform sends clients to your KYC provider and stores only the status and
a reference. Support needs the provider's API URL and key
(`KYC_API_URL`, `KYC_API_KEY`). Staff can send, resend and decide KYC from the
CRM lead view; withdrawals require an APPROVED status.

## 5. Instruments and spreads

Admin → Instruments: activate the instruments you offer (your plan caps the
number of active ones), set the spread markup per instrument in points, min
and max volume. Leverage caps per jurisdiction are enforced by the platform;
tell support which jurisdiction(s) your licence covers.

## 6. Client onboarding flow (what your clients experience)

1. Register on your domain: email, password, name, acceptance of your terms.
2. Confirmation email (24 h link). They can log in and watch prices before
   confirming; trading unlocks on confirmation.
3. KYC via your provider; staff approve in the CRM.
4. Deposit: until a payment provider is connected, your support desk sends the
   payment instructions and credits the account from Admin → Clients (every
   deposit is audited and written to the client-funds ledger).
5. Trading, withdrawals: the client requests, your staff approve or reject
   (Admin → Withdrawals).

## 7. Affiliates and campaigns

CRM → Affiliates: create partners with CPA, CPL, revenue-share or hybrid
terms and an API key. Partners push leads to
`POST /api/v1/affiliate/lead` with their key, or use tracking links with UTM
tags. Commissions are computed automatically on first deposit.

## 8. Staff roles and security

- **Admin**: everything in the back-office. **Seller**: leads and conversion.
  **Retention**: existing clients. Dealer functions exist only for
  `B_BOOK_DEALER` tenants.
- Restrict back-office access to your office IPs: Admin → Settings → Security
  → IP whitelist (comma-separated).
- Lost 2FA device: backup codes first; otherwise support resets it after
  verifying identity by phone or video.

## 9. Data you can pull out

- CSV export of leads (CRM → Leads → Export) and of trades (Admin → Reports).
- Regulatory export (MiFIR/EMIR format) with your LEI: Admin → Reports.
- Segregation report (client-funds ledger vs balances): Admin → Reports.
- Full API with OpenAPI documentation at `https://api.<your domain>/api/docs`
  (staging) for integrations; every call carries your tenant id.

## 10. Go-live checklist

- [ ] 2FA enabled on every staff account
- [ ] Domain resolves, certificate valid, login page shows your name
- [ ] Branding and legal texts reviewed by your counsel
- [ ] SMTP live, SPF/DKIM/DMARC published, test email received
- [ ] KYC provider connected, one end-to-end test client verified
- [ ] Instruments activated, spreads set, jurisdiction confirmed
- [ ] Withdrawal approval process assigned to named staff
- [ ] Support contact and escalation path agreed with TradeXLabel
