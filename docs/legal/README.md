# Legal documents — DRAFTS

Everything in this folder is a **working draft written by the engineering
team to give the lawyer a starting point**. Nothing here has been reviewed by
counsel and nothing here may be published to clients as-is.

| File | Purpose | Status |
|------|---------|--------|
| terms-of-service.md | Platform terms between TradeXLabel and the broker's clients, surfaced at registration | DRAFT |
| privacy-policy.md | GDPR/UK-GDPR privacy notice for traders and CRM leads | DRAFT |
| data-processing-agreement.md | DPA between TradeXLabel (processor) and each broker (controller) | DRAFT |
| retention-schedule.md | What we keep, for how long, and why | DRAFT |

What the product already does with these (Phase 1.13):

- Registration requires an explicit acceptance (`accept_terms: true`); the
  timestamp and the terms version are stored on the user
  (`terms_accepted_at`, `terms_version`). A new terms version can be forced
  on next login later by bumping `TERMS_VERSION`.
- The web app serves the current texts at `/legal/terms` and `/legal/privacy`
  from `packages/web/src/app/legal/*`; the broker's branding wraps them.

Open questions for counsel are marked `[[LAWYER: …]]` in each file.
