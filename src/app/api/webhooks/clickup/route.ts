import { NextResponse } from 'next/server';
import { ingestClickUpPaymentWebhook } from '@/lib/clickup-payment-webhook';
import { clickUpWebhookSecrets, verifyClickUpWebhookSignature } from '@/lib/clickup-webhook';

export const runtime = 'nodejs';

/**
 * ClickUp → payment ledger. Signature is HMAC-SHA256 of this raw body using `CLICKUP_WEBHOOK_SECRET`
 * (`webhook.secret` from Create Webhook). Middleware leaves `/api/webhooks/*` unauthenticated.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const secrets = clickUpWebhookSecrets();
  if (secrets.length === 0) {
    return NextResponse.json(
      {
        error:
          'CLICKUP_WEBHOOK_SECRET is not set. Create the ClickUp webhook, copy webhook.secret, and set that env var on the app.',
      },
      { status: 503 },
    );
  }
  if (!verifyClickUpWebhookSignature(rawBody, request.headers.get('x-signature'), secrets)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }
  if (!rawBody.trim()) {
    return NextResponse.json({ ok: true, ignored: 'empty' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const result = await ingestClickUpPaymentWebhook(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook ingest failed' },
      { status: 500 },
    );
  }
}
