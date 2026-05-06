-- Sprint 6.6 — Add Tenant.lei (ISO 17442 Legal Entity Identifier).
-- Required for MiFIR/EMIR transaction reporting in regulated jurisdictions.
-- Default empty string preserves backward compatibility for existing tenants.
ALTER TABLE "tenants" ADD COLUMN "lei" TEXT NOT NULL DEFAULT '';
