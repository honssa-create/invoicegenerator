import { NextResponse } from 'next/server';
import {
  ingestWooWebhookOrder,
  resolveWooWebhookOwnerId,
} from '@/lib/hub-sync';
import type { WooOrder } from '@/lib/woocommerce';
import {
  isWooOrderWebhookTopic,
  isWooWebhookPlatform,
  verifyWooWebhookSignature,
  wooWebhookTopic,
  wooWebhookVerificationSecrets,
} from '@/lib/woo-webhook';

export const runtime = 'nodejs';

function parseWooOrderPayload(rawBody: string): WooOrder | null {
  try {
    const parsed = JSON.parse(rawBody) as WooOrder;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: { platform: string } },
) {
  const platform = params.platform;
  if (!isWooWebhookPlatform(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const rawBody = await request.text();
  const topic = wooWebhookTopic(request);

  // Woo sends an empty body on webhook ping / delete — acknowledge.
  if (!rawBody.trim()) {
    return NextResponse.json({ ok: true, topic, ping: true });
  }

  const resolved = await resolveWooWebhookOwnerId(platform);
  if (!resolved) {
    return NextResponse.json({ error: 'Store not configured for webhook owner' }, { status: 503 });
  }

  const secrets = wooWebhookVerificationSecrets(platform, resolved.store);
  const signature = request.headers.get('x-wc-webhook-signature');
  if (!verifyWooWebhookSignature(rawBody, signature, secrets)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  if (!isWooOrderWebhookTopic(topic)) {
    return NextResponse.json({ ok: true, topic, ignored: true });
  }

  const order = parseWooOrderPayload(rawBody);
  if (!order) {
    return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 });
  }

  try {
    const result = await ingestWooWebhookOrder(resolved.userId, platform, order);
    return NextResponse.json({
      ok: true,
      topic,
      woo_order_id: order.id,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook ingest failed' },
      { status: 500 },
    );
  }
}
