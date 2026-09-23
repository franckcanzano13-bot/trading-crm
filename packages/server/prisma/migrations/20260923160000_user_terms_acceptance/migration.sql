-- Phase 1.13 — Record the client's acceptance of the terms of service and
-- privacy policy. Existing accounts are left NULL: they accepted the
-- broker's previous terms out of band; a re-acceptance flow can target them.
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "terms_version" TEXT NOT NULL DEFAULT '';
