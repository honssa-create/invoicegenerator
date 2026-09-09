import { createHmac, timingSafeEqual } from 'crypto';
import type { WooStoreConfig } from './woocommerce';

const WOO_WEBHOOK_PLATFORMS = ['nestiee', 'honour', 'honour_en', 'cupmoka'] as const;
export type WooWebhookPlatform = (typeof WOO_WEBHOOK_PLATFORMS)[number];

export function isWooWebhookPlatform(value: string): value is WooWebhookPlatform {
  return (WOO_WEBHOOK_PLATFORMS as readonly string[]).includes(value);
}

/** Env override: WOO_WEBHOOK_SECRET_NESTIEE, then WOO_WEBHOOK_SECRET. */
export function wooWebhookSecretFromEnv(platform: WooWebhookPlatform): string[] {
  const out: string[] = [];
  const perPlatform = process.env[`WOO_WEBHOOK_SECRET_${platform.toUpperCase()}`]?.trim();
  if (perPlatform) out.push(perPlatform);
  const global = process.env.WOO_WEBHOOK_SECRET?.trim();
  if (global) out.push(global);
  return out;
}

export function wooWebhookVerificationSecrets(
  platform: WooWebhookPlatform,
  store?: Pick<WooStoreConfig, 'consumerSecret'> | null,
): string[] {
  const secrets = wooWebhookSecretFromEnv(platform);
  const consumer = store?.consumerSecret?.trim();
  if (consumer && !secrets.includes(consumer)) secrets.push(consumer);
  return secrets;
}

/** WooCommerce `X-WC-Webhook-Signature` = base64(HMAC-SHA256(body, webhook secret)). */
export function verifyWooWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secrets: string[],
): boolean {
  const sig = String(signatureHeader || '').trim();
  if (!sig || secrets.length === 0) return false;
  const sigBuf = Buffer.from(sig);
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    const expectedBuf = Buffer.from(expected);
    if (expectedBuf.length === sigBuf.length && timingSafeEqual(expectedBuf, sigBuf)) {
      return true;
    }
  }
  return false;
}

export function wooWebhookTopic(request: Request): string {
  return String(request.headers.get('x-wc-webhook-topic') || '').trim().toLowerCase();
}

export function isWooOrderWebhookTopic(topic: string): boolean {
  return topic === 'order.created' || topic === 'order.updated' || topic.startsWith('order.');
}

export function wooWebhookDeliveryUrl(origin: string, platform: WooWebhookPlatform): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/api/webhooks/woocommerce/${platform}`;
}
