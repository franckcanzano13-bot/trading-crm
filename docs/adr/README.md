# Architecture Decision Records

Each ADR captures a significant decision, the alternatives considered, and the
rationale at the time. ADRs are immutable once **Accepted** — superseded
decisions get a new ADR that references the old one.

## Index

| #   | Title                                    | Status     |
|-----|------------------------------------------|------------|
| 001 | SQLite for development, PostgreSQL prod  | Accepted   |
| 002 | Multi-tenant via tenant_id column        | Accepted   |
| 003 | Dealer module isolation by execution_mode| Accepted   |
| 004 | Atomic financial flows via $transaction  | Accepted   |
| 005 | TOTP-only 2FA (no SMS)                   | Accepted   |
| 006 | No useCallback in CRM page (MetaMask SES)| Accepted   |
| 007 | MiFIR/EMIR trade-export format           | Accepted   |
| 008 | Versioned migrations + DB audit guards   | Accepted   |

## Template

Use [template.md](./template.md) for new ADRs. Filename pattern:
`NNN-kebab-case-title.md` where NNN is the next number.
