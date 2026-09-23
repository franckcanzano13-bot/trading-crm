# Retention schedule — DRAFT v2026-09 (not reviewed by counsel)

| Data | Where | Keep for | Why | Then |
|------|-------|----------|-----|------|
| Accounts, trades, orders, transactions, withdrawal requests, client-funds ledger | PostgreSQL | 7 years after account closure [[LAWYER: per regulator]] | Regulatory record keeping, disputes | Anonymise user rows, keep financial rows |
| Audit logs | PostgreSQL (append-only) | 7 years | Regulatory, security | Archive to cold storage, then delete |
| KYC documents | KYC provider | Provider's policy; platform stores only status and reference | AML | Delete reference on erasure request after the retention period |
| CRM leads that never registered | PostgreSQL | 12 months after last contact [[LAWYER]] | Legitimate interest, marketing | Delete |
| CRM notes, calls, tasks about a client | PostgreSQL | Life of the account + 7 years | Complaints, disputes | Delete with the account |
| Email logs (sent emails, bodies) | PostgreSQL | 24 months | Support, disputes | Delete |
| Password reset / email verification tokens | PostgreSQL | 30 days after expiry | Security forensics | Delete (cron, roadmap) |
| Application logs | Log store | 12 months | Security, incidents | Delete |
| Metrics | Prometheus | 30 days | Operations | Roll off |
| Backups | Object storage | 30 daily, 12 monthly | Recovery | Roll off |

Automated deletion jobs are not implemented yet (roadmap item after Phase 1);
until then, deletions are performed by the operator following a written
request, with the action recorded in the audit log.
