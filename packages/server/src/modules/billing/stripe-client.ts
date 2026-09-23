/**
 * Phase 2.2 — Stripe client factory.
 *
 * Billing is optional: without STRIPE_SECRET_KEY the platform keeps working
 * (superadmin marks invoices paid by hand, as before) and the billing routes
 * answer 503 BILLING_NOT_CONFIGURED. Tests inject a fake client.
 */
import Stripe from 'stripe';
import { config } from '../../config/index';

let client: Stripe | null | undefined;
let override: Stripe | null = null;

export function isBillingConfigured(): boolean {
  return Boolean(override) || Boolean(config.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  if (override) return override;
  if (client !== undefined) return client;
  client = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2026-08-27.basil' as Stripe.LatestApiVersion }) : null;
  return client;
}

/** Tests only: replace the SDK instance (pass null to restore env-based behaviour). */
export function setStripeClientForTests(fake: Stripe | null): void {
  override = fake;
}

/** Verify and parse a webhook payload. Throws on a bad signature. */
export function parseWebhook(rawBody: Buffer | string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}
