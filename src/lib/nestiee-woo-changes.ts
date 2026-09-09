/** Nestiee Woo sync: track processing-order field changes (delivery / address / notes). */

import { existingOrderReceiptDate, normalizeOrderDueDate } from './orders';

export type NestieeWooPendingChangeKey = 'delivery_date' | 'address' | 'notes';

export interface NestieeWooPendingChange {
  key: NestieeWooPendingChangeKey;
  before: string;
  after: string;
}

export const NESTIEE_WOO_PENDING_CHANGE_LABELS: Record<
  NestieeWooPendingChangeKey,
  { en: string; zh: string }
> = {
  delivery_date: { en: 'Delivery date', zh: '送貨日' },
  address: { en: 'Address', zh: '地址' },
  notes: { en: 'Notes', zh: '備註' },
};

function normText(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\s+/g, ' ');
}

function normDate(value: string): string {
  return normalizeOrderDueDate(String(value || '').trim()) || '';
}

export function parseNestieeWooPendingChanges(
  fields: Record<string, unknown> | null | undefined,
): NestieeWooPendingChange[] {
  const raw = fields?.woo_pending_changes;
  if (!Array.isArray(raw)) return [];
  const out: NestieeWooPendingChange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { key?: unknown; before?: unknown; after?: unknown };
    const key = String(row.key || '').trim() as NestieeWooPendingChangeKey;
    if (key !== 'delivery_date' && key !== 'address' && key !== 'notes') continue;
    out.push({
      key,
      before: String(row.before ?? ''),
      after: String(row.after ?? ''),
    });
  }
  return out;
}

export function hasNestieeWooPendingChanges(
  fields: Record<string, unknown> | null | undefined,
): boolean {
  return parseNestieeWooPendingChanges(fields).length > 0;
}

export function mergeNestieeWooPendingChanges(
  existing: NestieeWooPendingChange[] | null | undefined,
  incoming: NestieeWooPendingChange[],
): NestieeWooPendingChange[] {
  const map = new Map<NestieeWooPendingChangeKey, NestieeWooPendingChange>();
  for (const row of existing || []) map.set(row.key, row);
  for (const row of incoming) map.set(row.key, row);
  return Array.from(map.values());
}

export function applyNestieeWooPendingChangesToFields(
  fields: Record<string, unknown>,
  incoming: NestieeWooPendingChange[],
): void {
  if (incoming.length === 0) return;
  const merged = mergeNestieeWooPendingChanges(parseNestieeWooPendingChanges(fields), incoming);
  fields.woo_pending_changes = merged;
  fields.woo_pending_at = new Date().toISOString();
}

export function clearNestieeWooPendingChanges(fields: Record<string, unknown>): void {
  delete fields.woo_pending_changes;
  delete fields.woo_pending_at;
}

export function formatNestieeWooPendingChangeSummary(
  changes: NestieeWooPendingChange[],
): string {
  return changes
    .map((c) => {
      const label = NESTIEE_WOO_PENDING_CHANGE_LABELS[c.key].zh;
      return `${label}已改`;
    })
    .join(' · ');
}

export function detectNestieeWooPendingChangesFromSync(opts: {
  previousFields: Record<string, unknown>;
  previousShippingAddress: string;
  previousNotes: string;
  nextFields: Record<string, unknown>;
  nextShippingAddress: string;
  incomingCustomerNote: string;
}): NestieeWooPendingChange[] {
  const changes: NestieeWooPendingChange[] = [];

  const prevDelivery = existingOrderReceiptDate(opts.previousFields);
  const nextDelivery = existingOrderReceiptDate(opts.nextFields);
  if (normDate(nextDelivery) && normDate(nextDelivery) !== normDate(prevDelivery)) {
    changes.push({
      key: 'delivery_date',
      before: prevDelivery,
      after: nextDelivery,
    });
  }

  const prevAddress = normText(opts.previousShippingAddress);
  const nextAddress = normText(opts.nextShippingAddress);
  if (nextAddress && nextAddress !== prevAddress) {
    changes.push({
      key: 'address',
      before: opts.previousShippingAddress.trim(),
      after: opts.nextShippingAddress.trim(),
    });
  }

  const prevNotes = normText(opts.previousNotes);
  const incomingNote = normText(opts.incomingCustomerNote);
  if (incomingNote && incomingNote !== prevNotes) {
    changes.push({
      key: 'notes',
      before: opts.previousNotes.trim(),
      after: opts.incomingCustomerNote.trim(),
    });
  }

  return changes;
}

export function orderMatchesNestieeModifiedScope(order: {
  status?: string | null;
  fields?: Record<string, unknown>;
}): boolean {
  const status = String(order.status || '').trim();
  if (status !== 'processing') return false;
  return hasNestieeWooPendingChanges(order.fields);
}
