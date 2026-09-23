-- Phase 1.2 — Email verification for trader accounts.
-- NULL = not verified yet. Every account that exists before this migration is
-- grandfathered (set to the migration time) so nobody already trading is
-- locked out by the new gate on order placement.

ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);

UPDATE "users" SET "email_verified_at" = CURRENT_TIMESTAMP WHERE "email_verified_at" IS NULL;
