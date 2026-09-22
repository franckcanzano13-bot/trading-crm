## What

<!-- One paragraph. Link the roadmap item (docs/ROADMAP.md) or issue. -->

## Money / tenancy checklist

- [ ] Any write to `Account.balance` runs inside `prisma.$transaction` and calls a `shared/segregation` helper in the same block (ADR-010)
- [ ] Every Prisma query on a tenant table filters on `tenant_id` (ADR-002)
- [ ] New admin/superadmin actions write an audit row
- [ ] No new `any` (ESLint budget is zero)
- [ ] Migration added under `packages/server/prisma/migrations` if the schema changed (ADR-008)

## Verified

<!-- Paste the relevant lines: vitest totals, `npm run smoke` result, screenshots for UI. -->
