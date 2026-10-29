import { createHmac } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/webhooks/clickup/route';
import { decideClickUpPaymentWebhook, verifyClickUpWebhookSignature } from './clickup-webhook';

const SECRET = 'webhook-secret-test';

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifyClickUpWebhookSignature', () => {
  it('accepts the hex HMAC of the raw body', () => {
    const body = '{"event":"taskCreated","task_id":"c0j"}';
    const signature = sign(body);
    expect(verifyClickUpWebhookSignature(body, signature, [SECRET])).toBe(true);
    expect(verifyClickUpWebhookSignature(body, signature.toUpperCase(), [SECRET])).toBe(true);
    expect(verifyClickUpWebhookSignature(body, `sha256=${signature}`, [SECRET])).toBe(true);
    expect(verifyClickUpWebhookSignature(body, signature, ['other', SECRET])).toBe(true);
  });

  it('rejects a re-serialized body, a wrong secret, and a short signature', () => {
    const raw = '{"event":"taskCreated","task_id":"c0j"}';
    const pretty = JSON.stringify(JSON.parse(raw), null, 2);
    expect(verifyClickUpWebhookSignature(pretty, sign(raw), [SECRET])).toBe(false);
    expect(verifyClickUpWebhookSignature(raw, sign(raw, 'nope'), [SECRET])).toBe(false);
    expect(verifyClickUpWebhookSignature(raw, 'abcd', [SECRET])).toBe(false);
    expect(verifyClickUpWebhookSignature(raw, sign(raw), [])).toBe(false);
  });
});

describe('decideClickUpPaymentWebhook', () => {
  it('syncs comment events and payment custom fields', () => {
    expect(
      decideClickUpPaymentWebhook({ event: 'taskCommentPosted', task_id: 'abc' }),
    ).toEqual({ action: 'sync', taskId: 'abc', reason: 'taskCommentPosted' });
    expect(
      decideClickUpPaymentWebhook({
        event: 'taskCommentUpdated',
        task_id: 'abc',
      }),
    ).toMatchObject({ action: 'sync', taskId: 'abc' });
    expect(
      decideClickUpPaymentWebhook({
        event: 'taskUpdated',
        task_id: 'abc',
        history_items: [{ field: 'comment' }],
      }),
    ).toEqual({ action: 'sync', taskId: 'abc', reason: 'taskUpdated comment' });
    expect(
      decideClickUpPaymentWebhook({
        event: 'taskUpdated',
        task_id: 'abc',
        history_items: [{ field: 'custom_field', custom_field: { name: '第一次Payment ($)' } }],
      }),
    ).toEqual({ action: 'sync', taskId: 'abc', reason: 'taskUpdated payment field' });
    expect(
      decideClickUpPaymentWebhook({
        event: 'taskUpdated',
        task_id: 'abc',
        history_items: [{ field: 'custom_field', custom_field: { name: 'Payment' } }],
      }),
    ).toMatchObject({ action: 'sync' });
  });

  it('ignores status updates and unrelated custom fields', () => {
    expect(decideClickUpPaymentWebhook({ event: 'taskStatusUpdated', task_id: 'abc' })).toEqual({
      action: 'ignore',
      reason: 'event taskStatusUpdated',
    });
    expect(
      decideClickUpPaymentWebhook({
        event: 'taskUpdated',
        task_id: 'abc',
        history_items: [{ field: 'status' }],
      }),
    ).toEqual({ action: 'ignore', reason: 'taskUpdated without a payment change' });
    expect(
      decideClickUpPaymentWebhook({
        event: 'taskUpdated',
        task_id: 'abc',
        history_items: [{ field: 'custom_field', custom_field: { name: 'Guest phone' } }],
      }),
    ).toEqual({ action: 'ignore', reason: 'custom field is not a payment field' });
    expect(decideClickUpPaymentWebhook({ event: 'taskCommentPosted' })).toEqual({
      action: 'ignore',
      reason: 'missing task_id',
    });
    expect(decideClickUpPaymentWebhook(null)).toEqual({ action: 'ignore', reason: 'invalid payload' });
  });
});

describe('POST /api/webhooks/clickup', () => {
  const previous = process.env.CLICKUP_WEBHOOK_SECRET;

  afterEach(() => {
    if (previous === undefined) delete process.env.CLICKUP_WEBHOOK_SECRET;
    else process.env.CLICKUP_WEBHOOK_SECRET = previous;
  });

  it('returns 503 until CLICKUP_WEBHOOK_SECRET is set', async () => {
    delete process.env.CLICKUP_WEBHOOK_SECRET;
    const res = await POST(
      new Request('http://localhost/api/webhooks/clickup', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(String(body.error)).toContain('CLICKUP_WEBHOOK_SECRET');
  });

  it('returns 401 for a bad signature and 200 for an ignored event', async () => {
    process.env.CLICKUP_WEBHOOK_SECRET = SECRET;
    const ignored = JSON.stringify({ event: 'taskStatusUpdated', task_id: 'abc' });
    const rejected = await POST(
      new Request('http://localhost/api/webhooks/clickup', {
        method: 'POST',
        headers: { 'x-signature': 'deadbeef' },
        body: ignored,
      }),
    );
    expect(rejected.status).toBe(401);

    const accepted = await POST(
      new Request('http://localhost/api/webhooks/clickup', {
        method: 'POST',
        headers: { 'x-signature': sign(ignored) },
        body: ignored,
      }),
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ ok: true, ignored: 'event taskStatusUpdated' });
  });
});
