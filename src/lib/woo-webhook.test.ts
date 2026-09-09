import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWooWebhookSignature, isWooOrderWebhookTopic } from './woo-webhook';

describe('verifyWooWebhookSignature', () => {
  it('accepts valid Woo webhook HMAC', () => {
    const body = '{"id":123,"status":"processing"}';
    const secret = 'whsec_test';
    const sig = createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    expect(verifyWooWebhookSignature(body, sig, [secret])).toBe(true);
    expect(verifyWooWebhookSignature(body, sig, ['wrong', secret])).toBe(true);
    expect(verifyWooWebhookSignature(body, sig, ['wrong'])).toBe(false);
  });
});

describe('isWooOrderWebhookTopic', () => {
  it('matches order.created and order.updated', () => {
    expect(isWooOrderWebhookTopic('order.created')).toBe(true);
    expect(isWooOrderWebhookTopic('order.updated')).toBe(true);
    expect(isWooOrderWebhookTopic('product.updated')).toBe(false);
  });
});
