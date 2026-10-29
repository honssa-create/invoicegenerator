import { createHmac, timingSafeEqual } from 'crypto';
import { isPaymentLedgerClickUpField } from './payment-ledger';

/** `CLICKUP_WEBHOOK_SECRET` is the `webhook.secret` ClickUp returns when the webhook is created. */
export function clickUpWebhookSecrets(): string[] {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET?.trim();
  return secret ? [secret] : [];
}

/**
 * ClickUp `X-Signature` is hex HMAC-SHA256 of the raw request body, keyed with `webhook.secret`.
 * Compare against the untouched body. Re-serializing JSON changes the digest.
 */
export function verifyClickUpWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secrets: string[],
): boolean {
  const sig = String(signatureHeader || '')
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '');
  if (!sig || !/^[0-9a-f]+$/.test(sig) || sig.length % 2 !== 0 || secrets.length === 0) return false;
  const sigBuf = Buffer.from(sig, 'utf8');
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (expectedBuf.length === sigBuf.length && timingSafeEqual(expectedBuf, sigBuf)) return true;
  }
  return false;
}

export type ClickUpWebhookDecision =
  | { action: 'ignore'; reason: string }
  | { action: 'sync'; taskId: string; reason: string };

const COMMENT_EVENTS = new Set(['taskCommentPosted', 'taskCommentUpdated']);

type HistoryItem = {
  field?: unknown;
  custom_field?: { name?: unknown } | null;
};

function historyKind(items: unknown[]): 'comment' | 'payment' | 'other-custom' | 'none' {
  let comment = false;
  let payment = false;
  let otherCustom = false;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const history = item as HistoryItem;
    const field = typeof history.field === 'string' ? history.field : '';
    if (field === 'comment') comment = true;
    if (field !== 'custom_field') continue;
    const rawName =
      history.custom_field && typeof history.custom_field === 'object' ? history.custom_field.name : '';
    const name = typeof rawName === 'string' ? rawName : '';
    if (!name.trim() || isPaymentLedgerClickUpField(name)) payment = true;
    else otherCustom = true;
  }
  if (comment) return 'comment';
  if (payment) return 'payment';
  if (otherCustom) return 'other-custom';
  return 'none';
}

/**
 * Comment events and payment-field updates refresh the ledger.
 * ClickUp also sends `taskUpdated` alongside a comment. Status, assignee, and other custom fields do not.
 */
export function decideClickUpPaymentWebhook(payload: unknown): ClickUpWebhookDecision {
  if (!payload || typeof payload !== 'object') return { action: 'ignore', reason: 'invalid payload' };
  const body = payload as { event?: unknown; task_id?: unknown; history_items?: unknown };
  const event = typeof body.event === 'string' ? body.event : '';
  const taskId = body.task_id == null ? '' : String(body.task_id).trim();
  if (!taskId) return { action: 'ignore', reason: 'missing task_id' };

  if (COMMENT_EVENTS.has(event)) return { action: 'sync', taskId, reason: event };
  if (event !== 'taskUpdated') {
    return { action: 'ignore', reason: event ? `event ${event}` : 'missing event' };
  }

  const items = Array.isArray(body.history_items) ? body.history_items : [];
  const kind = historyKind(items);
  if (kind === 'comment') return { action: 'sync', taskId, reason: 'taskUpdated comment' };
  if (kind === 'payment') return { action: 'sync', taskId, reason: 'taskUpdated payment field' };
  if (kind === 'other-custom') return { action: 'ignore', reason: 'custom field is not a payment field' };
  return { action: 'ignore', reason: 'taskUpdated without a payment change' };
}
