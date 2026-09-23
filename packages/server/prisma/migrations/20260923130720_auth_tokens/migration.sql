-- Phase 1.1 / 1.2 — Single-use, hashed, expiring tokens handed out by email.
-- purpose: PASSWORD_RESET (1.1) | EMAIL_VERIFY (1.2). Only the SHA-256 of the
-- token is stored; the raw value travels once in the email link.

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "request_ip" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_tenant_id_purpose_subject_type_subject_id_idx" ON "auth_tokens"("tenant_id", "purpose", "subject_type", "subject_id");
