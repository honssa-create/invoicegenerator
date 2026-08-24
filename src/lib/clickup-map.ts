import type { HubOrderUpsertInput } from './hub-server';
import {
  clickUpMsToCreatedAt,
  clickUpMsToDateYmd,
  type ClickUpCustomField,
  type ClickUpTask,
} from './clickup';
import {
  WEDDING_GIFT_ORDER_STATUSES,
  WEDDING_GIFT_ORDER_TYPE,
  computeWeddingGiftMaterials,
  computeWeddingGiftPacking,
  computeWeddingGiftTotal,
  normalizeWeddingGiftBottleCapacity,
} from './orders';
import { addCalendarDays, parseWeddingGiftConfirmation } from './wedding-gift-confirmation';

export type ClickUpMappedPayload = ClickUpTask & {
  _mapped_fields: Record<string, string>;
  _mapped_core: {
    name?: string;
    phone?: string;
    shipping_address?: string;
    po_number?: string;
    notes?: string;
  };
  _mapped_total_amount?: number;
};

type MergeBag = {
  fields: Record<string, string>;
  core: {
    name?: string;
    phone?: string;
    shipping_address?: string;
    po_number?: string;
    notes?: string;
  };
};

function setIfEmpty(target: Record<string, string>, key: string, value: string | null | undefined) {
  const v = (value ?? '').trim();
  if (!v) return;
  if (!(target[key] ?? '').trim()) target[key] = v;
}

function setCoreIfEmpty(core: MergeBag['core'], key: keyof MergeBag['core'], value: string | null | undefined) {
  const v = (value ?? '').trim();
  if (!v) return;
  if (!(core[key] ?? '').trim()) core[key] = v;
}

export function mapClickUpStatus(status: string | null | undefined): string {
  const raw = (status || '').trim();
  if (!raw) return 'OPEN';
  const lower = raw.toLowerCase();
  for (const s of WEDDING_GIFT_ORDER_STATUSES) {
    if (s.toLowerCase() === lower) return s;
  }
  return 'OPEN';
}

function resolveLabelValue(field: ClickUpCustomField): string {
  const opts = field.type_config?.options || [];
  const raw = field.value;
  if (raw == null) return '';
  if (Array.isArray(raw)) {
    return raw
      .map((id) => opts.find((o) => o.id === id)?.label || String(id))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof raw === 'object' && raw !== null && 'label' in raw) {
    return String((raw as { label?: string }).label || '');
  }
  return String(raw).trim();
}

function resolveFieldValue(field: ClickUpCustomField): string {
  if (field.value == null || field.value === '') return '';
  if (field.type === 'date') {
    return clickUpMsToDateYmd(String(field.value)) || '';
  }
  if (field.type === 'number') {
    const n = Number(field.value);
    return Number.isFinite(n) ? String(n) : '';
  }
  if (field.type === 'labels') {
    return resolveLabelValue(field);
  }
  if (field.type === 'formula') {
    const v = String(field.value ?? '').trim();
    if (!v || v === ' ') return '';
    const n = Number(v);
    if (Number.isFinite(n)) return String(n);
    return v;
  }
  return String(field.value).trim();
}

function mapCapacityLabel(label: string): string {
  const t = label.trim();
  if (/45\s*ml/i.test(t) || t.includes('(45ml)')) return '45g';
  if (/25\s*ml/i.test(t) || t.includes('25ml')) return '25g';
  if (/75\s*ml/i.test(t) || t.includes('75ml')) return normalizeWeddingGiftBottleCapacity('75g');
  return normalizeWeddingGiftBottleCapacity(t) || t;
}

function applyPaymentLabels(fields: Record<string, string>, labels: string) {
  if (!labels.trim()) return;
  fields.payment_status_label = labels;
  const parts = labels.split(',').map((s) => s.trim());
  for (const p of parts) {
    if (p === 'FPS') fields.payment_bank = 'FPS';
    if (p === '銀行轉賬') fields.payment_method_detail = '銀行轉賬';
  }
}

export function parseClickUpCustomFields(customFields: ClickUpCustomField[] | undefined): MergeBag {
  const bag: MergeBag = { fields: {}, core: {} };
  const byName = new Map<string, ClickUpCustomField>();
  for (const f of customFields || []) {
    if (f.name) byName.set(f.name.trim(), f);
  }

  const get = (name: string) => {
    const field = byName.get(name);
    if (!field) return '';
    return resolveFieldValue(field);
  };

  setCoreIfEmpty(bag.core, 'po_number', get('Order #'));

  setIfEmpty(bag.fields, 'big_day', get('Big Day'));
  setIfEmpty(bag.fields, 'expiry_date', get('到期日 - (Big day後4星期)'));
  setIfEmpty(bag.fields, 'production_date', get('生產日期'));
  setIfEmpty(bag.fields, 'client_delivery_date', get('客人送貨日期'));
  setIfEmpty(bag.fields, 'due_date', get('客人送貨日期'));
  setIfEmpty(bag.fields, 'receiving_time', get('客人收件時間'));

  const contact = get('聯絡方式');
  if (contact) {
    setIfEmpty(bag.fields, 'contact_method', contact);
    if (/^\d[\d\s]{5,}$/.test(contact.replace(/\s/g, ''))) {
      setCoreIfEmpty(bag.core, 'phone', contact.replace(/\s+/g, ' ').trim());
    }
  }

  setCoreIfEmpty(bag.core, 'shipping_address', get('送貨地址'));

  const capField = byName.get('即食燕窩容量');
  if (capField) {
    const label = resolveLabelValue(capField);
    if (label) setIfEmpty(bag.fields, 'bottle_capacity', mapCapacityLabel(label.split(',')[0] || label));
  }

  setIfEmpty(bag.fields, 'qty_rock_sugar', get('客人訂冰糖味 (樽)'));
  setIfEmpty(bag.fields, 'qty_osmanthus', get('客人訂桂花味 (樽)'));
  setIfEmpty(bag.fields, 'qty_red_date', get('客人訂紅棗味 (樽)'));
  setIfEmpty(bag.fields, 'actual_qty_rock_sugar', get('實際生產樽數-冰糖味'));
  setIfEmpty(bag.fields, 'actual_qty_osmanthus', get('實際生產樽數-桂花味'));
  setIfEmpty(bag.fields, 'actual_qty_red_date', get('實際生產樽數-紅棗味'));

  const pay1Date = get('第一次Payment日期');
  if (pay1Date) {
    setIfEmpty(bag.fields, 'payment1_date', pay1Date);
    setIfEmpty(bag.fields, 'payment_date', pay1Date);
  }
  const pay1Amt = get('第一次Payment ($)');
  if (pay1Amt) {
    setIfEmpty(bag.fields, 'payment1_amount', pay1Amt);
    setIfEmpty(bag.fields, 'payment_amount', pay1Amt);
  }
  setIfEmpty(bag.fields, 'payment2_date', get('第二次Payment日期'));
  setIfEmpty(bag.fields, 'payment2_amount', get('第2次Payment($)'));

  const paymentLabels = byName.get('Payment');
  if (paymentLabels) applyPaymentLabels(bag.fields, resolveLabelValue(paymentLabels));

  const packField = byName.get('包裝');
  const giftField = byName.get('Gift');
  const noteBits = [
    packField ? resolveLabelValue(packField) : '',
    giftField ? resolveLabelValue(giftField) : '',
  ].filter(Boolean);
  if (noteBits.length) {
    setCoreIfEmpty(bag.core, 'notes', noteBits.join(' · '));
  }

  return bag;
}

export function stripClickUpTaskIdPrefix(name: string): string {
  const trimmed = (name || '').trim();
  const m = trimmed.match(/^\d+-(.+)$/);
  return m ? m[1].trim() : trimmed;
}

/** Trim trailing punctuation artifacts from a task-title name fragment. */
export function cleanClickUpTaskCustomerName(name: string): string {
  return (name || '')
    .trim()
    .replace(/[,，]\s*$/, '')
    .replace(/[\s\-–—,(（]+$/, '')
    .trim();
}

export function parseClickUpTaskName(name: string): MergeBag {
  const bag: MergeBag = { fields: {}, core: {} };
  const raw = stripClickUpTaskIdPrefix(name);
  if (!raw) return bag;

  const phoneMatch = raw.match(/(\d{4}\s+\d{4})/);
  if (phoneMatch) setCoreIfEmpty(bag.core, 'phone', phoneMatch[1]);

  const dateMatch = raw.match(/\b(\d{2})(\d{2})(\d{4})\b/);
  if (dateMatch) {
    const iso = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    setIfEmpty(bag.fields, 'big_day', iso);
  }

  const capMatch = raw.match(/(\d+)\s*ml/i);
  if (capMatch) {
    const cap = mapCapacityLabel(`${capMatch[1]}ml`);
    setIfEmpty(bag.fields, 'bottle_capacity', cap);
  }

  const namePart = raw.split(/\d{4}\s+\d{4}|\b\d{8}\b|\d+ml/i)[0]?.trim();
  if (namePart) setCoreIfEmpty(bag.core, 'name', cleanClickUpTaskCustomerName(namePart));

  return bag;
}

function mergeBag(into: MergeBag, from: MergeBag) {
  for (const [k, v] of Object.entries(from.fields)) setIfEmpty(into.fields, k, v);
  setCoreIfEmpty(into.core, 'name', from.core.name);
  setCoreIfEmpty(into.core, 'phone', from.core.phone);
  setCoreIfEmpty(into.core, 'shipping_address', from.core.shipping_address);
  setCoreIfEmpty(into.core, 'po_number', from.core.po_number);
  setCoreIfEmpty(into.core, 'notes', from.core.notes);
}

function confirmationText(task: ClickUpTask): string {
  return (task.text_content || task.description || '').trim();
}

function looksLikeConfirmation(text: string): boolean {
  return /即食燕窩回禮|Confirmation/i.test(text);
}

function applyConfirmationLayer(task: ClickUpTask): MergeBag {
  const bag: MergeBag = { fields: {}, core: {} };
  const text = confirmationText(task);
  if (!text || !looksLikeConfirmation(text)) return bag;

  const parsed = parseWeddingGiftConfirmation(text);
  Object.assign(bag.fields, parsed.fields);
  if (parsed.core.name) bag.core.name = parsed.core.name;
  if (parsed.core.phone) bag.core.phone = parsed.core.phone;
  if (parsed.core.shipping_address) bag.core.shipping_address = parsed.core.shipping_address;
  if (parsed.core.notes) bag.core.notes = parsed.core.notes;
  return bag;
}

function deriveWeddingFields(fields: Record<string, string>): Record<string, string> {
  const out = { ...fields };
  if (out.big_day?.trim()) {
    if (!out.expiry_date?.trim()) out.expiry_date = addCalendarDays(out.big_day, 28);
    if (!out.production_date?.trim()) out.production_date = addCalendarDays(out.big_day, -10);
  }
  const asBool = out as Record<string, string | boolean>;
  Object.assign(out, computeWeddingGiftMaterials(asBool));
  Object.assign(out, computeWeddingGiftPacking(asBool));
  if (!out.total_amount?.trim()) {
    const total = computeWeddingGiftTotal(asBool);
    if (total > 0) out.total_amount = String(total);
  }
  return out;
}

export function mapClickUpTaskToUpsert(task: ClickUpTask): HubOrderUpsertInput {
  const merged: MergeBag = { fields: {}, core: {} };

  mergeBag(merged, applyConfirmationLayer(task));
  mergeBag(merged, parseClickUpCustomFields(task.custom_fields));
  mergeBag(merged, parseClickUpTaskName(task.name));

  merged.fields.order_type = WEDDING_GIFT_ORDER_TYPE;
  merged.fields.order_from = 'clickup';

  const derived = deriveWeddingFields(merged.fields);

  const customerName =
    merged.core.name?.trim() ||
    cleanClickUpTaskCustomerName(stripClickUpTaskIdPrefix(task.name)) ||
    'ClickUp Customer';

  const pay1 = Number(derived.payment1_amount || derived.payment_amount || 0);
  const totalAmount = pay1 > 0 ? pay1 : computeWeddingGiftTotal(derived as Record<string, string | boolean>);

  const payload: ClickUpMappedPayload = {
    ...task,
    _mapped_fields: derived,
    _mapped_core: merged.core,
    _mapped_total_amount: totalAmount,
  };

  return {
    source_platform: 'clickup',
    original_order_id: String(task.id),
    customer_name: customerName,
    total_amount: totalAmount,
    status: mapClickUpStatus(task.status?.status),
    created_at: clickUpMsToCreatedAt(task.date_created),
    phone: merged.core.phone || null,
    shipping_address: merged.core.shipping_address || null,
    notes: merged.core.notes || null,
    external_po_number: merged.core.po_number || null,
    raw_payload: payload as unknown as Record<string, unknown>,
  };
}
