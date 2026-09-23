# Data Processing Agreement — DRAFT v2026-09 (not reviewed by counsel)

Between the **Broker** (controller) and **TradeXLabel** (processor), attached
to the platform subscription agreement.

## 1. Subject matter and duration
Processing of the personal data of the Broker's clients, leads and staff
necessary to operate the white-label trading platform and CRM, for the term of
the subscription plus the retention period in Annex 2.

## 2. Nature and purpose
Hosting, storage, execution of trading operations, CRM workflows, email
delivery, identity-verification orchestration, security monitoring, support.

## 3. Instructions
TradeXLabel processes only on the Broker's documented instructions: the
platform configuration set by the Broker's administrators, the subscription
agreement and this DPA. It informs the Broker if an instruction appears to
infringe the law.

## 4. Confidentiality and security
Staff with access are bound by confidentiality. Measures: TLS, encryption of
stored secrets (AES-256-GCM), tenant isolation enforced in code and by
automated tests, 2FA for privileged users, append-only audit logs, daily
backups with restore drills, monitoring and alerting. [[LAWYER: Annex 1 with
the full Article 32 measure list.]]

## 5. Sub-processors
Listed in Annex 3 (hosting provider, email delivery, KYC provider, price-data
vendors, monitoring). The Broker is notified 30 days before a change and may
object. [[LAWYER: objection mechanics.]]

## 6. Data subject rights and assistance
TradeXLabel forwards requests received directly to the Broker within 3
business days and provides the export/erase tooling of the platform to
fulfil them.

## 7. Breach notification
TradeXLabel notifies the Broker without undue delay and at the latest within
48 hours of becoming aware of a personal data breach affecting the Broker's
tenant, with the information needed for the Broker's own notification.

## 8. Audits
Once a year, or after a breach, the Broker may audit compliance through a
questionnaire, a third-party report, or an on-site review with 30 days'
notice.

## 9. End of processing
At termination TradeXLabel returns the tenant's data in a machine-readable
export and deletes it after the export is confirmed, except where retention is
legally required (Annex 2).

## 10. International transfers
[[LAWYER: hosting region(s), SCCs / UK IDTA if any transfer.]]

## Annexes
1. Technical and organisational measures
2. Retention schedule (see retention-schedule.md)
3. Sub-processors
