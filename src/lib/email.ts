import { getDataOwnerId } from './org-server';
import {
  getResendCredentials,
  resolveResendBrandForOrderType,
} from './integration-settings-server';
import type { ResendBrandKey } from './integration-settings';

export interface SendResult {
  sent: boolean;
  provider: 'resend' | 'log' | 'skipped';
  brand?: ResendBrandKey;
  error?: string;
}

export interface SendEmailOptions {
  /** Owner / actor user id — used to load integration_settings (via data owner). */
  userId: number;
  /** Explicit brand (rentals / debit notes → honour). */
  brand?: ResendBrandKey;
  /** Resolve brand from Settings → Resend order-type assignment. */
  orderType?: string | null;
}

/**
 * Send via Resend using per-brand credentials from Settings → Integrations.
 * Skips when no brand covers the order type or the brand has no API key.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts: SendEmailOptions,
): Promise<SendResult> {
  const ownerId = await getDataOwnerId(opts.userId);

  let brand: ResendBrandKey | null = opts.brand ?? null;
  if (!brand) {
    brand = await resolveResendBrandForOrderType(ownerId, opts.orderType);
  }

  if (!brand) {
    const msg = opts.orderType?.trim()
      ? `No Resend account assigned for order type "${opts.orderType.trim()}"`
      : 'No Resend account for this email (order type unassigned or missing)';
    console.log(`[email:skipped] to=${to} subject="${subject}" reason=${msg}`);
    return { sent: false, provider: 'skipped', error: msg };
  }

  const creds = await getResendCredentials(ownerId, brand);
  const apiKey = creds.api_key.trim();
  const from = creds.from_email.trim() || 'InvoiceFlow <onboarding@resend.dev>';

  if (!apiKey) {
    const msg = `Resend API key not configured for ${brand}`;
    console.log(`[email:skipped] to=${to} subject="${subject}" brand=${brand} reason=${msg}`);
    return { sent: false, provider: 'skipped', brand, error: msg };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const error = await res.text();
      return { sent: false, provider: 'resend', brand, error };
    }
    return { sent: true, provider: 'resend', brand };
  } catch (e) {
    return { sent: false, provider: 'resend', brand, error: String(e) };
  }
}
