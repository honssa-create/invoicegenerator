import { BIRD_NEST_FLAVORS, isBadgeOrderType, isBirdNestOrderType, orderTitle, type Order } from './orders';

export interface QuotationLineDraft {
  description: string;
  quantity: number;
  unit_price: number;
}

/** Extract the first numeric value from free-form text (e.g. "rmb 4.2", "4款各53個"). */
export function parseNumericFromText(text: string | undefined | null): number {
  if (!text?.trim()) return 0;
  const match = text.replace(/,/g, '').match(/[\d.]+/);
  if (!match) return 0;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : 0;
}

/** Parse dd/mm/yy, dd/mm/yyyy, or ISO yyyy-mm-dd into yyyy-mm-dd. */
export function parseOrderDate(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

function fieldStr(fields: Record<string, string | boolean>, key: string): string {
  const v = fields[key];
  if (typeof v === 'boolean') return v ? 'yes' : '';
  return String(v ?? '').trim();
}

function fieldNum(fields: Record<string, string | boolean>, key: string): number {
  const v = fields[key];
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  return parseNumericFromText(String(v ?? ''));
}

export function buildQuotationItemsFromOrder(
  order: Pick<Order, 'description' | 'name' | 'po_number' | 'fields'>
): QuotationLineDraft[] {
  const f = order.fields;
  const orderType = fieldStr(f, 'order_type');
  const unitPrice = parseNumericFromText(fieldStr(f, 'supplier_price'));

  if (isBirdNestOrderType(orderType)) {
    const items: QuotationLineDraft[] = [];
    for (const flavor of BIRD_NEST_FLAVORS) {
      const qty = fieldNum(f, flavor.key);
      if (qty > 0) {
        items.push({ description: flavor.label, quantity: qty, unit_price: unitPrice });
      }
    }
    if (items.length) return items;
  }

  if (isBadgeOrderType(orderType)) {
    const style = fieldStr(f, 'badge_style');
    const qty =
      fieldNum(f, 'badge_quantity') ||
      parseNumericFromText(fieldStr(f, 'qty_ordered')) ||
      1;
    const desc = [order.description?.trim(), style].filter(Boolean).join(' — ') || orderType;
    return [{ description: desc, quantity: qty, unit_price: unitPrice }];
  }

  const qty =
    parseNumericFromText(fieldStr(f, 'qty_ordered')) ||
    fieldNum(f, 'badge_quantity') ||
    parseNumericFromText(fieldStr(f, 'supplier_qty')) ||
    1;
  const desc =
    order.description?.trim() ||
    fieldStr(f, 'name') ||
    order.name?.trim() ||
    orderTitle(order) ||
    'Order items';

  return [{ description: desc, quantity: qty || 1, unit_price: unitPrice }];
}

export function buildQuotationNotesFromOrder(
  order: Pick<Order, 'notes' | 'po_number' | 'description' | 'fields'>
): string | null {
  const parts: string[] = [];
  if (order.notes?.trim()) parts.push(order.notes.trim());
  if (order.po_number?.trim()) parts.push(`PO#: ${order.po_number}`);
  if (order.description?.trim()) parts.push(`Description: ${order.description.trim()}`);

  const pack = fieldStr(order.fields, 'pack_required');
  if (pack) parts.push(`Packaging: ${pack}`);

  const craft = fieldStr(order.fields, 'craft');
  if (craft) parts.push(`Craft: ${craft}`);

  return parts.length ? parts.join('\n') : null;
}

export function buildQuotationTermsFromOrder(order: Pick<Order, 'fields'>): string | null {
  const terms = fieldStr(order.fields, 'payment_terms') || fieldStr(order.fields, 'payment_option');
  return terms || null;
}

/** Valid until is always issue date + days (default 30). */
export function quotationValidUntilFromIssueDate(issueDate: string, days = 30): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(issueDate.trim())
    ? issueDate.trim()
    : new Date().toISOString().slice(0, 10);
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
