import {
  getFlavorFormula,
  getFormulaLines,
  isBirdNestFormulaIngredient,
  isRedDateAllowed,
  type PrepCapacity,
  type PrepFlavor,
} from '@/lib/kitchen-prep';
import { addCalendarDays } from '@/lib/wedding-gift-confirmation';
import { displayOrderNumber } from '@/lib/record-numbering-core';
import { pickThumbnailFile } from '@/lib/attachment-files';

export interface CoreColumns {
  po_number: string;
  name: string;
  description: string;
  status: string;
  delivery_date: string;
  customer_email: string;
  phone: string;
  shipping_address: string;
  notes: string;
  carton_count: string;
  quotation_id: number | null;
}

export const ORDER_STATUSES = [
  'OPEN',
  '快遞到件',
  'IN PROGRESS 安排中',
  '需長時間處理',
  '起版中 SAMPLE',
  'PRODUCTION 生產中',
  '有問題',
  '已到公司 BACK TO OFFICE',
  '已到公司 - 請安排包裝/PACK箱',
  '已到公司 - 已完成包裝',
  '可以寄出 READY TO SEND',
  '已寄出 SENT',
  '客退貨/客原版',
  '已處理',
  'FAIL',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Ecommerce statuses for Nestiee 燕窩訂單. */
export const ECOM_ORDER_STATUSES = [
  'checkout-draft',
  'pending payment',
  'processing',
  'shipped',
  'completed',
] as const;

export type EcomOrderStatus = (typeof ECOM_ORDER_STATUSES)[number];

/** Cupmoka Woo / Hub order statuses (store admin labels). */
export const CUPMOKA_ORDER_STATUSES = [
  '等待付款中',
  '處理中',
  '保留',
  'Shipped',
  'Delivered',
  '取消',
  '已退費',
] as const;

export type CupmokaOrderStatus = (typeof CUPMOKA_ORDER_STATUSES)[number];

/** 燕窩回禮燉製 workflow statuses (board order). */
export const WEDDING_GIFT_ORDER_STATUSES = [
  'OPEN',
  '訂單已確認, 待客人提供資料',
  '已跟客人確認基本資料',
  '處理LOGO CARD / 開單中',
  '圓卡印刷完成',
  '已預備好材料 (WINNIE - 1個月前)',
  '同客人做最後資料確認 (送貨前 3 星期)',
  '已燉製 (HING - 2.5星期前)',
  '包裝完成 (WINNIE - 2星期前)',
  '一星期前再次跟客人聯絡及SEND產品',
  'CINDY FINAL CHECK (印送貨單)',
  '已封箱待寄出',
  '已交給司機/寄出',
  '司機送到',
  '已跟客人問好, 訂單完成',
  '特別情況',
] as const;

export type WeddingGiftOrderStatus = (typeof WEDDING_GIFT_ORDER_STATUSES)[number];

/** Post-shipment statuses for 燕窩回禮燉製 (dashboard + kitchen). */
export const WEDDING_GIFT_SHIPPED_STATUSES = [
  '已交給司機/寄出',
  '司機送到',
  '已跟客人問好, 訂單完成',
] as const;

export function usesEcomOrderStatuses(orderType: string): boolean {
  return isNestieeOrderType(orderType);
}

/** Status options for the given order type (manufacturing vs ecommerce vs Cupmoka vs wedding). */
export function statusesForOrderType(orderType: string): readonly string[] {
  if (isCupmokaOrderType(orderType)) return CUPMOKA_ORDER_STATUSES;
  if (isWeddingGiftOrderType(orderType)) return WEDDING_GIFT_ORDER_STATUSES;
  return usesEcomOrderStatuses(orderType) ? ECOM_ORDER_STATUSES : ORDER_STATUSES;
}

export type OrderStatusFamily = 'manufacturing' | 'ecom' | 'cupmoka' | 'wedding';

/** Which status list applies to an order type (for bulk-change compatibility checks). */
export function orderStatusFamily(orderType: string): OrderStatusFamily {
  if (isCupmokaOrderType(orderType)) return 'cupmoka';
  if (isWeddingGiftOrderType(orderType)) return 'wedding';
  if (usesEcomOrderStatuses(orderType)) return 'ecom';
  return 'manufacturing';
}

/** Local calendar YYYY-MM-DD (browser / Node local TZ). */
export function localDateYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Whether an order is considered shipped / completed delivery for its type.
 * Manufacturing: `已寄出 SENT`; Nestiee: shipped|completed; 回禮: post-handoff statuses; Cupmoka: Shipped|Delivered.
 */
export function isOrderShipped(o: { status?: string; fields?: Record<string, unknown> }): boolean {
  const s = (o.status || '').trim();
  const ot = typeof o.fields?.order_type === 'string' ? o.fields.order_type : '';
  if (isCupmokaOrderType(ot)) return s === 'Shipped' || s === 'Delivered';
  if (isWeddingGiftOrderType(ot)) {
    return (WEDDING_GIFT_SHIPPED_STATUSES as readonly string[]).includes(s);
  }
  if (isNestieeOrderType(ot)) return s === 'shipped' || s === 'completed';
  return s === '已寄出 SENT' || /\bSENT\b/i.test(s);
}

/** 未寄出 — inverse of {@link isOrderShipped}. */
export function isOrderUnshipped(o: { status?: string; fields?: Record<string, unknown> }): boolean {
  return !isOrderShipped(o);
}

/**
 * 緊急訂單 — unshipped with due date on or before today + `withinDays` (default 2).
 * Includes overdue (past due) orders.
 */
export function isOrderUrgent(
  o: { status?: string; fields?: Record<string, unknown> },
  opts?: { today?: string; withinDays?: number },
): boolean {
  if (isOrderShipped(o)) return false;
  const due = orderDueDate(o);
  if (!due) return false;
  const today = opts?.today || localDateYmd();
  const within = opts?.withinDays ?? 2;
  const limit = addCalendarDays(today, within);
  return due <= limit;
}

export type OrderDashboardCounts = {
  total: number;
  unshipped: number;
  urgent: number;
};

/** Hub-imported order that nobody has opened on the detail page yet. */
export function isUnattendedImportedOrder(order: {
  source_platform?: string | null;
  attended_at?: string | null;
}): boolean {
  const platform = (order.source_platform || 'manual').trim();
  return platform !== 'manual' && !order.attended_at;
}

/** Counts for the orders list dashboard cards. */
export function summarizeOrderDashboard(
  orders: Array<{ status?: string; fields?: Record<string, unknown> }>,
  opts?: { today?: string; withinDays?: number },
): OrderDashboardCounts {
  let unshipped = 0;
  let urgent = 0;
  for (const o of orders) {
    if (isOrderUnshipped(o)) unshipped += 1;
    if (isOrderUrgent(o, opts)) urgent += 1;
  }
  return { total: orders.length, unshipped, urgent };
}

export type OrderListProductLine = { name: string; quantity: string };

/** Product name × quantity rows for the orders list “more info” panel. */
export function summarizeOrderListProducts(
  o: Pick<Order, 'fields' | 'description'>,
): OrderListProductLine[] {
  const orderType = getOrderType(o);
  const lines: OrderListProductLine[] = [];

  if (isBadgeOrderType(orderType)) {
    for (const line of parseHonourLines(o.fields)) {
      const name = String(line.style ?? '').trim();
      const quantity = String(line.quantity ?? '').trim();
      if (!name && !quantity) continue;
      lines.push({ name: name || '—', quantity: quantity || '—' });
    }
    return lines;
  }

  if (isNestieeOrderType(orderType)) {
    for (const line of getNestieeLines(o.fields)) {
      lines.push({ name: line.name, quantity: String(line.quantity) });
    }
    return lines;
  }

  if (isCupmokaOrderType(orderType)) {
    for (const line of getCupmokaLines(o.fields)) {
      lines.push({ name: line.name, quantity: String(line.quantity) });
    }
    return lines;
  }

  if (isWeddingGiftOrderType(orderType)) {
    for (const { key, label } of WEDDING_GIFT_CLIENT_FLAVORS) {
      const raw = o.fields[key];
      const quantity = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw) : '';
      if (!quantity || quantity === '0') continue;
      lines.push({ name: label, quantity });
    }
    return lines;
  }

  const desc = o.description?.trim();
  if (desc) return [{ name: desc, quantity: '' }];
  return [];
}

/** Amount due for payment status: line/invoice totals, including an explicit $0. */
export function computeOrderDueTotal(
  o: Pick<Order, 'fields' | 'total_amount'> & { linked_invoice?: { total?: number | null } | null }
): number | null {
  const invoiceTotal = o.linked_invoice?.total;
  if (invoiceTotal != null && Number.isFinite(invoiceTotal) && invoiceTotal > 0) {
    return invoiceTotal;
  }

  const orderType = getOrderType(o);
  if (isBadgeOrderType(orderType)) {
    const lines = parseHonourLines(o.fields);
    if (honourProductLineCount(lines) > 0) {
      return computeHonourLineTotals(lines).totalAmount;
    }
  } else if (isWeddingGiftOrderType(orderType)) {
    const total = computeWeddingGiftTotal(o.fields);
    if (total > 0) return total;
  } else if (isNestieeOrderType(orderType)) {
    const lines = getNestieeLines(o.fields);
    if (lines.length) {
      return Math.round(lines.reduce((sum, line) => sum + (Number(line.line_total) || 0), 0) * 100) / 100;
    }
  } else if (isCupmokaOrderType(orderType)) {
    const lines = getCupmokaLines(o.fields);
    if (lines.length) {
      return Math.round(lines.reduce((sum, line) => sum + (Number(line.line_total) || 0), 0) * 100) / 100;
    }
  }

  if (o.total_amount != null && o.total_amount > 0) return o.total_amount;
  return null;
}

/** Payment status label for list/board views (matches Payment Detail derivation). */
export function orderListPaymentStatus(o: Pick<Order, 'fields' | 'total_amount'>): PaymentStatusLabel {
  return derivePaymentStatusLabel(computeOrderPaidTotal(o.fields), computeOrderDueTotal(o));
}

/**
 * Calendar / list date for an order: property-bar `due_date`, falling back to
 * shipment `client_delivery_date` (客人收貨日期) — the two stay linked in the UI.
 * Returns YYYY-MM-DD when parseable.
 */
export function orderDueDate(o: { fields?: Record<string, unknown> }): string | null {
  const due = typeof o.fields?.due_date === 'string' ? o.fields.due_date : '';
  const ship =
    typeof o.fields?.client_delivery_date === 'string' ? o.fields.client_delivery_date : '';
  return normalizeOrderDueDate(due) || normalizeOrderDueDate(ship);
}

/** Read linked due / 客人收貨日期 (YYYY-MM-DD or empty). */
export function parseOrderDueDateField(fields: Record<string, unknown>): string {
  const due = typeof fields.due_date === 'string' ? fields.due_date : '';
  const ship = typeof fields.client_delivery_date === 'string' ? fields.client_delivery_date : '';
  return normalizeOrderDueDate(due) || normalizeOrderDueDate(ship) || '';
}

/** Normalize common date strings to YYYY-MM-DD. */
export function normalizeOrderDueDate(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ymd = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymd) {
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${ymd[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return null;
}

function parseJsonArrayField(fields: Record<string, unknown>, key: string): unknown[] {
  const raw = fields[key];
  if (raw == null || raw === false || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** User ids assigned to an order (`fields.assignee_ids`). */
export function parseAssigneeIds(fields: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const v of parseJsonArrayField(fields, 'assignee_ids')) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out.push(Math.trunc(n));
  }
  return Array.from(new Set(out));
}

export function serializeAssigneeIds(ids: number[]): string {
  return JSON.stringify(Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0))));
}

/** Free-form tags on an order (`fields.tags`). */
export function parseOrderTags(fields: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of parseJsonArrayField(fields, 'tags')) {
    const s = String(v ?? '').trim();
    if (s) out.push(s);
  }
  return Array.from(new Set(out));
}

export function serializeOrderTags(tags: string[]): string {
  const cleaned = tags.map((t) => String(t ?? '').trim()).filter(Boolean);
  return JSON.stringify(Array.from(new Set(cleaned)));
}

export const STATUS_DOT_COLORS: Record<string, string> = {
  'OPEN': '#9CA3AF',
  '快遞到件': '#5BA4CF',
  'IN PROGRESS 安排中': '#8B6CC1',
  '需長時間處理': '#C23A8A',
  '起版中 SAMPLE': '#A02D2D',
  'PRODUCTION 生產中': '#5BC0DE',
  '有問題': '#E04B8A',
  '已到公司 BACK TO OFFICE': '#8FA03A',
  '已到公司 - 請安排包裝/PACK箱': '#7DBFAE',
  '已到公司 - 已完成包裝': '#7DBFAE',
  '可以寄出 READY TO SEND': '#6B8FD4',
  '已寄出 SENT': '#C9A227',
  '客退貨/客原版': '#8B7D72',
  '已處理': '#5C5C5C',
  'FAIL': '#E91E8C',
  'checkout-draft': '#9CA3AF',
  'pending payment': '#3B82F6',
  'processing': '#D97706',
  'shipped': '#6366F1',
  'completed': '#16A34A',
  '等待付款中': '#3B82F6',
  '處理中': '#D97706',
  '保留': '#9CA3AF',
  'Shipped': '#6366F1',
  'Delivered': '#16A34A',
  '取消': '#6B7280',
  '已退費': '#E04B8A',
  '訂單已確認, 待客人提供資料': '#EAB308',
  '已跟客人確認基本資料': '#5BA4CF',
  '處理LOGO CARD / 開單中': '#CA8A04',
  '圓卡印刷完成': '#E04B8A',
  '已預備好材料 (WINNIE - 1個月前)': '#D97706',
  '同客人做最後資料確認 (送貨前 3 星期)': '#8B6CC1',
  '已燉製 (HING - 2.5星期前)': '#C2410C',
  '包裝完成 (WINNIE - 2星期前)': '#EA580C',
  '一星期前再次跟客人聯絡及SEND產品': '#7C3AED',
  'CINDY FINAL CHECK (印送貨單)': '#B45309',
  '已封箱待寄出': '#C23A8A',
  '已交給司機/寄出': '#16A34A',
  '司機送到': '#22C55E',
  '已跟客人問好, 訂單完成': '#14B8A6',
  '特別情況': '#DC2626',
};

export const STATUS_COLORS: Record<string, string> = {
  'OPEN': 'bg-[#F3F4F6] text-[#6B7280]',
  '快遞到件': 'bg-[#E8F4FA] text-[#3D7FA8]',
  'IN PROGRESS 安排中': 'bg-[#F0EBF8] text-[#6B4FA0]',
  '需長時間處理': 'bg-[#F9E8F2] text-[#9A2D6C]',
  '起版中 SAMPLE': 'bg-[#F8EAEA] text-[#7A2222]',
  'PRODUCTION 生產中': 'bg-[#E8F7FB] text-[#2F8FA8]',
  '有問題': 'bg-[#FCE8F1] text-[#B8306A]',
  '已到公司 BACK TO OFFICE': 'bg-[#F2F5E6] text-[#6A7A2C]',
  '已到公司 - 請安排包裝/PACK箱': 'bg-[#EAF6F3] text-[#4A8F80]',
  '已到公司 - 已完成包裝': 'bg-[#EAF6F3] text-[#4A8F80]',
  '可以寄出 READY TO SEND': 'bg-[#EAF0FA] text-[#4A6BB0]',
  '已寄出 SENT': 'bg-[#F8F3E0] text-[#8A7018]',
  '客退貨/客原版': 'bg-[#F0EDEB] text-[#6B6058]',
  '已處理': 'bg-[#EBEBEB] text-[#3F3F3F]',
  'FAIL': 'bg-[#FCE4F2] text-[#C01070]',
  'checkout-draft': 'bg-[#F3F4F6] text-[#6B7280]',
  'pending payment': 'bg-[#DBEAFE] text-[#1D4ED8]',
  'processing': 'bg-[#FEF3C7] text-[#B45309]',
  'shipped': 'bg-[#E0E7FF] text-[#4338CA]',
  'completed': 'bg-[#DCFCE7] text-[#15803D]',
  '等待付款中': 'bg-[#DBEAFE] text-[#1D4ED8]',
  '處理中': 'bg-[#FEF3C7] text-[#B45309]',
  '保留': 'bg-[#F3F4F6] text-[#6B7280]',
  'Shipped': 'bg-[#E0E7FF] text-[#4338CA]',
  'Delivered': 'bg-[#DCFCE7] text-[#15803D]',
  '取消': 'bg-[#E5E7EB] text-[#4B5563]',
  '已退費': 'bg-[#FCE8F1] text-[#B8306A]',
  '訂單已確認, 待客人提供資料': 'bg-[#FEF9C3] text-[#A16207]',
  '已跟客人確認基本資料': 'bg-[#E8F4FA] text-[#3D7FA8]',
  '處理LOGO CARD / 開單中': 'bg-[#FEF3C7] text-[#B45309]',
  '圓卡印刷完成': 'bg-[#FCE8F1] text-[#B8306A]',
  '已預備好材料 (WINNIE - 1個月前)': 'bg-[#FEF3C7] text-[#B45309]',
  '同客人做最後資料確認 (送貨前 3 星期)': 'bg-[#F0EBF8] text-[#6B4FA0]',
  '已燉製 (HING - 2.5星期前)': 'bg-[#FFEDD5] text-[#9A3412]',
  '包裝完成 (WINNIE - 2星期前)': 'bg-[#FFEDD5] text-[#C2410C]',
  '一星期前再次跟客人聯絡及SEND產品': 'bg-[#EDE9FE] text-[#5B21B6]',
  'CINDY FINAL CHECK (印送貨單)': 'bg-[#FEF3C7] text-[#92400E]',
  '已封箱待寄出': 'bg-[#F9E8F2] text-[#9A2D6C]',
  '已交給司機/寄出': 'bg-[#DCFCE7] text-[#15803D]',
  '司機送到': 'bg-[#DCFCE7] text-[#16A34A]',
  '已跟客人問好, 訂單完成': 'bg-[#CCFBF1] text-[#0F766E]',
  '特別情況': 'bg-[#FEE2E2] text-[#B91C1C]',
};

export const STATUS_COLUMN_BG: Record<string, string> = {
  'OPEN': 'bg-[#E8EAED]',
  '快遞到件': 'bg-[#D4EAF6]',
  'IN PROGRESS 安排中': 'bg-[#E4D9F4]',
  '需長時間處理': 'bg-[#F5D6E8]',
  '起版中 SAMPLE': 'bg-[#F3D6D6]',
  'PRODUCTION 生產中': 'bg-[#D4EFF6]',
  '有問題': 'bg-[#F9D6E7]',
  '已到公司 BACK TO OFFICE': 'bg-[#E4EBC8]',
  '已到公司 - 請安排包裝/PACK箱': 'bg-[#D5EEE7]',
  '已到公司 - 已完成包裝': 'bg-[#D5EEE7]',
  '可以寄出 READY TO SEND': 'bg-[#D8E3F6]',
  '已寄出 SENT': 'bg-[#F3E9C4]',
  '客退貨/客原版': 'bg-[#E6E0DB]',
  '已處理': 'bg-[#DDDDDD]',
  'FAIL': 'bg-[#F9D0E8]',
  'checkout-draft': 'bg-[#E8EAED]',
  'pending payment': 'bg-[#DBEAFE]',
  'processing': 'bg-[#FDE68A]',
  'shipped': 'bg-[#C7D2FE]',
  'completed': 'bg-[#BBF7D0]',
  '等待付款中': 'bg-[#DBEAFE]',
  '處理中': 'bg-[#FDE68A]',
  '保留': 'bg-[#E8EAED]',
  'Shipped': 'bg-[#C7D2FE]',
  'Delivered': 'bg-[#BBF7D0]',
  '取消': 'bg-[#E5E7EB]',
  '已退費': 'bg-[#F9D6E7]',
  '訂單已確認, 待客人提供資料': 'bg-[#FDE68A]',
  '已跟客人確認基本資料': 'bg-[#D4EAF6]',
  '處理LOGO CARD / 開單中': 'bg-[#FDE68A]',
  '圓卡印刷完成': 'bg-[#F9D6E7]',
  '已預備好材料 (WINNIE - 1個月前)': 'bg-[#FDE68A]',
  '同客人做最後資料確認 (送貨前 3 星期)': 'bg-[#E4D9F4]',
  '已燉製 (HING - 2.5星期前)': 'bg-[#FED7AA]',
  '包裝完成 (WINNIE - 2星期前)': 'bg-[#FED7AA]',
  '一星期前再次跟客人聯絡及SEND產品': 'bg-[#DDD6FE]',
  'CINDY FINAL CHECK (印送貨單)': 'bg-[#FDE68A]',
  '已封箱待寄出': 'bg-[#F5D6E8]',
  '已交給司機/寄出': 'bg-[#BBF7D0]',
  '司機送到': 'bg-[#BBF7D0]',
  '已跟客人問好, 訂單完成': 'bg-[#99F6E4]',
  '特別情況': 'bg-[#FECACA]',
};

export const STATUS_COLUMN_ACCENT: Record<string, string> = {
  'OPEN': 'border-t-[#9CA3AF]',
  '快遞到件': 'border-t-[#5BA4CF]',
  'IN PROGRESS 安排中': 'border-t-[#8B6CC1]',
  '需長時間處理': 'border-t-[#C23A8A]',
  '起版中 SAMPLE': 'border-t-[#A02D2D]',
  'PRODUCTION 生產中': 'border-t-[#5BC0DE]',
  '有問題': 'border-t-[#E04B8A]',
  '已到公司 BACK TO OFFICE': 'border-t-[#8FA03A]',
  '已到公司 - 請安排包裝/PACK箱': 'border-t-[#7DBFAE]',
  '已到公司 - 已完成包裝': 'border-t-[#7DBFAE]',
  '可以寄出 READY TO SEND': 'border-t-[#6B8FD4]',
  '已寄出 SENT': 'border-t-[#C9A227]',
  '客退貨/客原版': 'border-t-[#8B7D72]',
  '已處理': 'border-t-[#5C5C5C]',
  'FAIL': 'border-t-[#E91E8C]',
  'checkout-draft': 'border-t-[#9CA3AF]',
  'pending payment': 'border-t-[#3B82F6]',
  'processing': 'border-t-[#D97706]',
  'shipped': 'border-t-[#6366F1]',
  'completed': 'border-t-[#16A34A]',
  '等待付款中': 'border-t-[#3B82F6]',
  '處理中': 'border-t-[#D97706]',
  '保留': 'border-t-[#9CA3AF]',
  'Shipped': 'border-t-[#6366F1]',
  'Delivered': 'border-t-[#16A34A]',
  '取消': 'border-t-[#6B7280]',
  '已退費': 'border-t-[#E04B8A]',
  '訂單已確認, 待客人提供資料': 'border-t-[#EAB308]',
  '已跟客人確認基本資料': 'border-t-[#5BA4CF]',
  '處理LOGO CARD / 開單中': 'border-t-[#CA8A04]',
  '圓卡印刷完成': 'border-t-[#E04B8A]',
  '已預備好材料 (WINNIE - 1個月前)': 'border-t-[#D97706]',
  '同客人做最後資料確認 (送貨前 3 星期)': 'border-t-[#8B6CC1]',
  '已燉製 (HING - 2.5星期前)': 'border-t-[#C2410C]',
  '包裝完成 (WINNIE - 2星期前)': 'border-t-[#EA580C]',
  '一星期前再次跟客人聯絡及SEND產品': 'border-t-[#7C3AED]',
  'CINDY FINAL CHECK (印送貨單)': 'border-t-[#B45309]',
  '已封箱待寄出': 'border-t-[#C23A8A]',
  '已交給司機/寄出': 'border-t-[#16A34A]',
  '司機送到': 'border-t-[#22C55E]',
  '已跟客人問好, 訂單完成': 'border-t-[#14B8A6]',
  '特別情況': 'border-t-[#DC2626]',
};

/** Shipment Detail / Woo normalize options for 寄出方式. */
export const ORDER_SHIPPING_METHODS = ['SF 順豐', '順豐', 'EMS', '香港郵政', '其他'] as const;

/** Synthetic Honour line style for Woo shipping fees. */
export const HONOUR_SHIPPING_LINE_STYLE = 'Shipping';

/** Honour / honour-en line items stored as JSON in fields.honour_lines. */
export interface HonourLineItem {
  style: string;
  quantity: string;
  unit_price: string;
  /** Free-text multi-line description (quotation-style). */
  description: string;
  /**
   * Legacy per-line craft/packaging — kept for read-migration / Woo ingest.
   * UI edits live on HonourSupplierItem production cards.
   */
  card_size: string;
  craft: string;
  plating_color: string;
  clasp: string;
  internal_pack: string;
  pack_required: string;
  /** Unmatched CPO options for this line (seeded into description when empty). */
  other_options: string;
}

export function emptyHonourLine(): HonourLineItem {
  return {
    style: '',
    quantity: '',
    unit_price: '',
    description: '',
    card_size: '',
    craft: '',
    plating_color: '',
    clasp: '',
    internal_pack: '',
    pack_required: '',
    other_options: '',
  };
}

/** Combined supplier + craft + packaging cards in fields.honour_suppliers. */
export interface HonourSupplierItem {
  supplier: string;
  supplier_price: string;
  mould_print_fee: string;
  supplier_qty: string;
  supplier_pack: string;
  supplier_ship_date: string;
  carton_count: string;
  /** Craft (moved from product lines). */
  card_size: string;
  craft: string;
  plating_color: string;
  clasp: string;
  /** Per-card extra actions / notes (was a single order-level field). */
  extra_actions: string;
  /** Packaging (moved from product lines). */
  internal_pack: string;
  pack_required: string;
}

export function emptyHonourSupplier(): HonourSupplierItem {
  return {
    supplier: '',
    supplier_price: '',
    mould_print_fee: '',
    supplier_qty: '',
    supplier_pack: '',
    supplier_ship_date: '',
    carton_count: '',
    card_size: '',
    craft: '',
    plating_color: '',
    clasp: '',
    extra_actions: '',
    internal_pack: '',
    pack_required: '',
  };
}

/** Craft-section fields → multi-line description seed (filled only). */
const HONOUR_CRAFT_SUMMARY_FIELDS: { key: keyof HonourLineItem; label: string }[] = [
  { key: 'card_size', label: '紙卡尺寸' },
  { key: 'craft', label: '加工工藝' },
  { key: 'plating_color', label: '電鍍色' },
  { key: 'clasp', label: '背扣' },
];

/** One line per filled craft field; empty when nothing is set (or Shipping row). */
export function summarizeHonourCraftDescription(line: HonourLineItem): string {
  if (isHonourShippingLine(line)) return '';
  const lines: string[] = [];
  for (const { key, label } of HONOUR_CRAFT_SUMMARY_FIELDS) {
    const value = String(line[key] ?? '').trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  return lines.join('\n');
}

/** Seed free-text description from craft summary + other_options when empty. */
export function seedHonourLineDescription(line: HonourLineItem): HonourLineItem {
  if (isHonourShippingLine(line)) return line;
  if (String(line.description ?? '').trim()) return line;
  const craftSummary = summarizeHonourCraftDescription(line);
  const other = String(line.other_options ?? '').trim();
  const parts = [craftSummary, other].filter(Boolean);
  if (!parts.length) return line;
  return { ...line, description: parts.join('\n\n') };
}

function supplierCraftPackEmpty(s: HonourSupplierItem): boolean {
  return !(
    s.card_size ||
    s.craft ||
    s.plating_color ||
    s.clasp ||
    s.internal_pack ||
    s.pack_required
  );
}

function craftPackFromLine(line: HonourLineItem): Pick<
  HonourSupplierItem,
  'card_size' | 'craft' | 'plating_color' | 'clasp' | 'internal_pack' | 'pack_required'
> {
  return {
    card_size: line.card_size,
    craft: line.craft,
    plating_color: line.plating_color,
    clasp: line.clasp,
    internal_pack: line.internal_pack,
    pack_required: line.pack_required,
  };
}

function craftPackFromLegacyFlats(fields: Record<string, string | boolean>): Pick<
  HonourSupplierItem,
  'card_size' | 'craft' | 'plating_color' | 'clasp' | 'internal_pack' | 'pack_required'
> {
  return {
    card_size: fieldAsString(fields, 'card_size'),
    craft: fieldAsString(fields, 'craft'),
    plating_color: fieldAsString(fields, 'plating_color'),
    clasp: fieldAsString(fields, 'clasp'),
    internal_pack: fieldAsString(fields, 'internal_pack'),
    pack_required: fieldAsString(fields, 'pack_required'),
  };
}

function fieldAsString(fields: Record<string, string | boolean>, key: string): string {
  const v = fields[key];
  if (typeof v === 'boolean') return v ? 'yes' : '';
  return String(v ?? '').trim();
}

export function isHonourShippingLine(line: Pick<HonourLineItem, 'style'>): boolean {
  return line.style.trim().toLowerCase() === HONOUR_SHIPPING_LINE_STYLE.toLowerCase();
}

/** Product lines only (excludes synthetic Shipping row). */
export function honourProductLines(lines: HonourLineItem[]): HonourLineItem[] {
  return lines.filter((l) => !isHonourShippingLine(l));
}

export function honourProductLineCount(lines: HonourLineItem[]): number {
  return honourProductLines(lines).length;
}

function normalizeHonourLineRow(row: Record<string, unknown>): HonourLineItem {
  return {
    style: String(row.style ?? ''),
    quantity: String(row.quantity ?? ''),
    unit_price: String(row.unit_price ?? ''),
    description: String(row.description ?? ''),
    card_size: String(row.card_size ?? ''),
    craft: String(row.craft ?? ''),
    plating_color: String(row.plating_color ?? ''),
    clasp: String(row.clasp ?? ''),
    internal_pack: String(row.internal_pack ?? ''),
    pack_required: String(row.pack_required ?? ''),
    other_options: String(row.other_options ?? ''),
  };
}

function seedLegacyCraftOntoFirstProduct(lines: HonourLineItem[], fields: Record<string, string | boolean>): HonourLineItem[] {
  const alreadyStructured = honourProductLines(lines).some(
    (l) =>
      l.card_size ||
      l.craft ||
      l.plating_color ||
      l.clasp ||
      l.internal_pack ||
      l.pack_required ||
      l.other_options
  );
  if (alreadyStructured) return lines;

  const legacy = {
    card_size: fieldAsString(fields, 'card_size'),
    craft: fieldAsString(fields, 'craft'),
    plating_color: fieldAsString(fields, 'plating_color'),
    clasp: fieldAsString(fields, 'clasp'),
    internal_pack: fieldAsString(fields, 'internal_pack'),
    pack_required: fieldAsString(fields, 'pack_required'),
    other_options: fieldAsString(fields, 'other_craft'),
  };
  if (!Object.values(legacy).some(Boolean)) return lines;

  let seeded = false;
  return lines.map((line) => {
    if (seeded || isHonourShippingLine(line)) return line;
    seeded = true;
    return { ...line, ...legacy };
  });
}

/** Parse honour_lines JSON; seed one row from legacy badge_style / badge_quantity when empty. */
export function parseHonourLines(fields: Record<string, string | boolean>): HonourLineItem[] {
  let lines: HonourLineItem[];
  const raw = fields.honour_lines;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        lines = parsed.map((row) => {
          const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
          return normalizeHonourLineRow(r);
        });
        lines = seedLegacyCraftOntoFirstProduct(lines, fields);
        return lines.map(seedHonourLineDescription);
      }
    } catch {
      /* fall through to legacy seed */
    }
  }
  const style = fieldAsString(fields, 'badge_style');
  const quantity = fieldAsString(fields, 'badge_quantity');
  if (style || quantity) {
    lines = seedLegacyCraftOntoFirstProduct([{ ...emptyHonourLine(), style, quantity }], fields);
    return lines.map(seedHonourLineDescription);
  }
  return [emptyHonourLine()];
}

export function serializeHonourLines(lines: HonourLineItem[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      style: String(l.style ?? ''),
      quantity: String(l.quantity ?? ''),
      unit_price: String(l.unit_price ?? ''),
      description: String(l.description ?? ''),
      card_size: String(l.card_size ?? ''),
      craft: String(l.craft ?? ''),
      plating_color: String(l.plating_color ?? ''),
      clasp: String(l.clasp ?? ''),
      internal_pack: String(l.internal_pack ?? ''),
      pack_required: String(l.pack_required ?? ''),
      other_options: String(l.other_options ?? ''),
    }))
  );
}

export function computeHonourLineTotals(lines: HonourLineItem[]): {
  totalQuantity: number;
  totalAmount: number;
} {
  let totalQuantity = 0;
  let totalAmount = 0;
  for (const line of lines) {
    const qty = Number(String(line.quantity).replace(/,/g, ''));
    const price = Number(String(line.unit_price).replace(/,/g, ''));
    const q = Number.isFinite(qty) ? qty : 0;
    const p = Number.isFinite(price) ? price : 0;
    totalQuantity += q;
    totalAmount += q * p;
  }
  return {
    totalQuantity: Math.round(totalQuantity * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

/** First non-Shipping product line (for legacy flat-field mirrors). */
export function firstHonourProductLine(lines: HonourLineItem[]): HonourLineItem | undefined {
  return honourProductLines(lines)[0];
}

/**
 * Derived fields kept in sync for delivery-note / legacy readers.
 * Craft/packaging flats are mirrored from production cards via honourSuppliersDerivedFields.
 */
export function honourLinesDerivedFields(lines: HonourLineItem[]): Record<string, string> {
  const { totalQuantity } = computeHonourLineTotals(lines);
  const first = firstHonourProductLine(lines) || lines[0];
  return {
    honour_lines: serializeHonourLines(lines),
    badge_style: first?.style ?? '',
    badge_quantity: first?.quantity ?? (totalQuantity ? String(totalQuantity) : ''),
    qty_ordered: totalQuantity ? String(totalQuantity) : '',
  };
}

function normalizeHonourSupplierRow(row: Record<string, unknown>): HonourSupplierItem {
  return {
    supplier: String(row.supplier ?? ''),
    supplier_price: String(row.supplier_price ?? ''),
    mould_print_fee: String(row.mould_print_fee ?? ''),
    supplier_qty: String(row.supplier_qty ?? ''),
    supplier_pack: String(row.supplier_pack ?? ''),
    supplier_ship_date: String(row.supplier_ship_date ?? ''),
    carton_count: String(row.carton_count ?? ''),
    card_size: String(row.card_size ?? ''),
    craft: String(row.craft ?? ''),
    plating_color: String(row.plating_color ?? ''),
    clasp: String(row.clasp ?? ''),
    extra_actions: String(row.extra_actions ?? ''),
    internal_pack: String(row.internal_pack ?? ''),
    pack_required: String(row.pack_required ?? ''),
  };
}

function seedLegacySupplier(fields: Record<string, string | boolean>, cartonCountCore?: string): HonourSupplierItem {
  const craft = craftPackFromLegacyFlats(fields);
  return {
    supplier: fieldAsString(fields, 'supplier'),
    supplier_price: fieldAsString(fields, 'supplier_price'),
    mould_print_fee: fieldAsString(fields, 'mould_print_fee'),
    supplier_qty: fieldAsString(fields, 'supplier_qty'),
    supplier_pack: fieldAsString(fields, 'supplier_pack'),
    supplier_ship_date: fieldAsString(fields, 'supplier_ship_date'),
    carton_count: fieldAsString(fields, 'carton_count') || String(cartonCountCore ?? '').trim(),
    ...craft,
    extra_actions: fieldAsString(fields, 'extra_actions'),
  };
}

/**
 * Copy craft/pack from product lines (by index) onto empty production cards.
 * Card 0 also falls back to legacy flat craft fields.
 */
function migrateCraftOntoSuppliers(
  suppliers: HonourSupplierItem[],
  fields: Record<string, string | boolean>,
  productLines?: HonourLineItem[]
): HonourSupplierItem[] {
  const products = productLines ?? honourProductLines(parseHonourLines(fields));
  const legacyCraft = craftPackFromLegacyFlats(fields);
  const hasLegacyCraft = Object.values(legacyCraft).some(Boolean);

  return suppliers.map((sup, index) => {
    if (!supplierCraftPackEmpty(sup)) return sup;
    const fromLine = products[index];
    if (fromLine) {
      const pack = craftPackFromLine(fromLine);
      if (Object.values(pack).some(Boolean)) return { ...sup, ...pack };
    }
    if (index === 0 && hasLegacyCraft) return { ...sup, ...legacyCraft };
    return sup;
  });
}

/**
 * Parse honour_suppliers JSON. Seeds Supplier-1 from legacy flat fields when empty.
 * Pads to at least `minCount` (default: product line count) without shrinking.
 * Migrates craft/packaging from product lines onto empty cards only when seeding
 * (no persisted JSON) or onto newly padded slots — never re-fills a card the user cleared.
 */
export function parseHonourSuppliers(
  fields: Record<string, string | boolean>,
  opts?: { minCount?: number; cartonCountCore?: string; productLines?: HonourLineItem[] }
): HonourSupplierItem[] {
  const minCount = Math.max(1, opts?.minCount ?? 1);
  let suppliers: HonourSupplierItem[] = [];
  let fromPersisted = false;
  const raw = fields.honour_suppliers;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        fromPersisted = true;
        suppliers = parsed.map((row) => {
          const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
          return normalizeHonourSupplierRow(r);
        });
      }
    } catch {
      /* fall through */
    }
  }
  if (!suppliers.length) {
    const legacy = seedLegacySupplier(fields, opts?.cartonCountCore);
    const hasAny = Object.values(legacy).some(Boolean);
    suppliers = [hasAny ? legacy : emptyHonourSupplier()];
  } else {
    // Fill empty first-card commercial fields from legacy flats.
    // Craft/pack/multi fields stay as stored (including '') so clears stick.
    const legacy = seedLegacySupplier(fields, opts?.cartonCountCore);
    if (Object.values(legacy).some(Boolean)) {
      const first = suppliers[0];
      suppliers[0] = {
        supplier: first.supplier || legacy.supplier,
        supplier_price: first.supplier_price || legacy.supplier_price,
        mould_print_fee: first.mould_print_fee || legacy.mould_print_fee,
        supplier_qty: first.supplier_qty || legacy.supplier_qty,
        supplier_pack: first.supplier_pack,
        supplier_ship_date: first.supplier_ship_date || legacy.supplier_ship_date,
        carton_count: first.carton_count || legacy.carton_count,
        card_size: first.card_size,
        craft: first.craft,
        plating_color: first.plating_color,
        clasp: first.clasp,
        extra_actions: first.extra_actions || legacy.extra_actions,
        internal_pack: first.internal_pack,
        pack_required: first.pack_required,
      };
    }
  }
  const persistedCount = suppliers.length;
  suppliers = ensureHonourSupplierCount(suppliers, minCount);
  if (!fromPersisted) {
    return migrateCraftOntoSuppliers(suppliers, fields, opts?.productLines);
  }
  if (suppliers.length > persistedCount) {
    const migrated = migrateCraftOntoSuppliers(suppliers, fields, opts?.productLines);
    return suppliers.map((sup, i) => (i < persistedCount ? sup : migrated[i]));
  }
  return suppliers;
}

/** Grow-only pad to minCount; never shrink. */
export function ensureHonourSupplierCount(
  suppliers: HonourSupplierItem[],
  minCount: number
): HonourSupplierItem[] {
  const target = Math.max(1, minCount);
  if (suppliers.length >= target) return suppliers;
  const next = [...suppliers];
  while (next.length < target) next.push(emptyHonourSupplier());
  return next;
}

export function serializeHonourSuppliers(suppliers: HonourSupplierItem[]): string {
  return JSON.stringify(
    suppliers.map((s) => ({
      supplier: String(s.supplier ?? ''),
      supplier_price: String(s.supplier_price ?? ''),
      mould_print_fee: String(s.mould_print_fee ?? ''),
      supplier_qty: String(s.supplier_qty ?? ''),
      supplier_pack: String(s.supplier_pack ?? ''),
      supplier_ship_date: String(s.supplier_ship_date ?? ''),
      carton_count: String(s.carton_count ?? ''),
      card_size: String(s.card_size ?? ''),
      craft: String(s.craft ?? ''),
      plating_color: String(s.plating_color ?? ''),
      clasp: String(s.clasp ?? ''),
      extra_actions: String(s.extra_actions ?? ''),
      internal_pack: String(s.internal_pack ?? ''),
      pack_required: String(s.pack_required ?? ''),
    }))
  );
}

/**
 * Persist honour_suppliers JSON and mirror flats still read by print/quotation/production-note.
 * Card-only fields (`supplier`, `mould_print_fee`, `supplier_pack`, `internal_pack`) stay in JSON.
 */
export function honourSuppliersDerivedFields(suppliers: HonourSupplierItem[]): Record<string, string> {
  const first = suppliers[0] || emptyHonourSupplier();
  return {
    honour_suppliers: serializeHonourSuppliers(suppliers),
    supplier_price: first.supplier_price,
    supplier_qty: first.supplier_qty,
    supplier_ship_date: first.supplier_ship_date,
    card_size: first.card_size,
    craft: first.craft,
    plating_color: first.plating_color,
    clasp: first.clasp,
    pack_required: first.pack_required,
    extra_actions: first.extra_actions,
  };
}

/** Dead fields_json keys — never shown and no longer written. */
export const STALE_ORDER_FIELD_KEYS = [
  'requested_delivery',
  'external_sync',
  'external_payload',
  'invoice_receipt',
  'supplier_received_qty',
  'product_type',
  'all_products_check',
  'invoice_before_ship',
] as const;

/** Drop unused legacy keys from an order fields blob (in place). */
export function pruneStaleOrderFields(fields: Record<string, unknown>): void {
  for (const key of STALE_ORDER_FIELD_KEYS) {
    delete fields[key];
  }
}

export interface OrderFile {
  id: number;
  path: string;
  original_name: string | null;
}

export { isAttachmentImage as isOrderImageFile } from './attachment-files';

/** Board/cover image: prefer fields.thumbnail_file_id when it points at an image, else first image. */
export function orderThumbnailFile(
  files: OrderFile[],
  fields?: Record<string, string | boolean> | null,
): OrderFile | null {
  return pickThumbnailFile(files, fields?.thumbnail_file_id);
}

export interface OrderActivity {
  id: number;
  kind: 'comment' | 'activity';
  author: string | null;
  body: string;
  created_at: string;
}

export interface LinkedInvoice {
  id: number;
  invoice_number: string;
  status: string;
  total?: number | null;
  billing_address?: string | null;
}

export interface LinkedQuotation {
  id: number;
  quote_number: string;
  status: string;
}

export interface Order extends CoreColumns {
  id: number;
  user_id: number;
  reference_number: string;
  total_amount: number | null;
  fields: Record<string, string | boolean>;
  files: OrderFile[];
  activities: OrderActivity[];
  linked_invoice: LinkedInvoice | null;
  linked_quotation: LinkedQuotation | null;
  created_at: string;
  updated_at: string;
  source_platform: string;
  attended_at: string | null;
}

// Dynamic Order Type + the bird's-nest reactive production formulas.
export const ORDER_TYPES = [
  '燕窩回禮燉製',
  'honour訂製',
  'honour en訂製',
  'Nestiee 燕窩訂單',
  'Cupmoka',
] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/** Sidebar shortcuts that set the Order Type filter to a specific type. */
export const ORDER_NAV_TYPE_FILTERS = [
  { param: 'honour訂製', label: 'honour訂單' },
  { param: '燕窩回禮燉製', label: '燕窩回禮' },
  { param: 'Nestiee 燕窩訂單', label: '燕窩訂單', status: 'processing' },
] as const;

export type OrderNavTypeParam = (typeof ORDER_NAV_TYPE_FILTERS)[number]['param'];

export function isOrderNavTypeParam(value: string): value is OrderNavTypeParam {
  return (ORDER_NAV_TYPE_FILTERS as readonly { param: string }[]).some((f) => f.param === value);
}

/** Whether an order's type matches a nav/filter value (exact type or nav group param). */
export function orderMatchesTypeFilter(orderType: string, filter: string): boolean {
  if (!filter) return true;
  if (filter === 'honour') return isBadgeOrderType(orderType);
  if (filter === 'wedding') return isWeddingGiftOrderType(orderType);
  if (filter === 'nestiee') return isNestieeOrderType(orderType);
  return orderType === filter;
}

/** Resolve status-list key for a filter (nav group → representative type). */
export function statusKeyForTypeFilter(filter: string): string {
  if (filter === 'honour') return 'honour訂製';
  if (filter === 'wedding') return WEDDING_GIFT_ORDER_TYPE;
  if (filter === 'nestiee') return NESTIEE_ORDER_TYPE;
  return filter;
}

export function getOrderType(o: Pick<Order, 'fields'>): string {
  const t = o.fields?.order_type;
  return typeof t === 'string' ? t : '';
}

/** Badge-style custom orders (honour訂製 / honour en訂製) share the curated Order Detail form. */
export const BADGE_ORDER_TYPES = ['honour訂製', 'honour en訂製'] as const;
export type BadgeOrderType = (typeof BADGE_ORDER_TYPES)[number];
export function isBadgeOrderType(t: string): t is BadgeOrderType {
  return (BADGE_ORDER_TYPES as readonly string[]).includes(t);
}

/** Bird's-nest stewing orders (燕窩回禮燉製) share dates, flavor qty, and production formulas. */
export const BIRD_NEST_ORDER_TYPES = ['燕窩回禮燉製'] as const;
export type BirdNestOrderType = (typeof BIRD_NEST_ORDER_TYPES)[number];
export function isBirdNestOrderType(t: string): t is BirdNestOrderType {
  return (BIRD_NEST_ORDER_TYPES as readonly string[]).includes(t);
}

export const NESTIEE_ORDER_TYPE = 'Nestiee 燕窩訂單' as const;
export function isNestieeOrderType(t: string): boolean {
  return t === NESTIEE_ORDER_TYPE;
}

/** Denormalized orders.order_type — kept in sync with fields_json.order_type. */
export function orderTypeFromFields(fields: Record<string, unknown> | null | undefined): string | null {
  const t = typeof fields?.order_type === 'string' ? fields.order_type.trim() : '';
  return t || null;
}

export const CUPMOKA_ORDER_TYPE = 'Cupmoka' as const;
export function isCupmokaOrderType(t: string): boolean {
  return t === CUPMOKA_ORDER_TYPE;
}

/** Manual “所需禮盒” qty inputs on Nestiee Order Detail (not from Woo). */
export const NESTIEE_GIFT_BOX_TYPES: { id: string; label: string; qtyKey: string }[] = [
  { id: 'star_gold', label: '星空金', qtyKey: 'nestiee_gift_qty_star_gold' },
  { id: 'star_silver', label: '星空銀', qtyKey: 'nestiee_gift_qty_star_silver' },
  { id: 'red_gold', label: '紅色金', qtyKey: 'nestiee_gift_qty_red_gold' },
  { id: 'red_silver', label: '紅色銀', qtyKey: 'nestiee_gift_qty_red_silver' },
  { id: 'pink_osmanthus', label: '粉紅心意 - 桂花味', qtyKey: 'nestiee_gift_qty_pink_osmanthus' },
  { id: 'pink_red_date', label: '粉紅心意 - 紅棗味', qtyKey: 'nestiee_gift_qty_pink_red_date' },
  { id: 'sui_xin_7', label: '隨心燉 - 7份裝', qtyKey: 'nestiee_gift_qty_sui_xin_7' },
  { id: 'sui_xin_14', label: '隨心燉 - 14份裝', qtyKey: 'nestiee_gift_qty_sui_xin_14' },
  { id: 'sui_xin_18', label: '隨心燉 - 18份裝', qtyKey: 'nestiee_gift_qty_sui_xin_18' },
  { id: 'qiu_yan_fei_yue', label: '秋燕飛躍', qtyKey: 'nestiee_gift_qty_qiu_yan_fei_yue' },
  { id: 'rou_run_share_box', label: '柔潤分享時光盒', qtyKey: 'nestiee_gift_qty_rou_run_share_box' },
  { id: 'trial_set', label: 'Trial Set', qtyKey: 'nestiee_gift_qty_trial_set' },
  { id: 'hua_yue', label: '花月禮盒', qtyKey: 'nestiee_gift_qty_hua_yue' },
];

/** Extra Woo SKU / English names that should count as a 所需禮盒 type. */
const NESTIEE_GIFT_BOX_LABEL_ALIASES: Record<string, string[]> = {
  rou_run_share_box: ['Sharing We Time Box', '柔潤分享'],
};

function normalizeGiftBoxLabel(text: string): string {
  return nestieeNameForGiftMatch(text)
    .toLowerCase()
    .replace(/[\s·‧.\-–—_/]/g, '');
}

/** Longest-first needles so 粉紅心意-桂花味 wins over a shorter overlap. */
const NESTIEE_GIFT_BOX_LABEL_NEEDLES: { qtyKey: string; needle: string }[] = (() => {
  const out: { qtyKey: string; needle: string }[] = [];
  for (const g of NESTIEE_GIFT_BOX_TYPES) {
    for (const raw of [g.label, ...(NESTIEE_GIFT_BOX_LABEL_ALIASES[g.id] || [])]) {
      const needle = normalizeGiftBoxLabel(raw);
      if (needle) out.push({ qtyKey: g.qtyKey, needle });
    }
  }
  return out.sort((a, b) => b.needle.length - a.needle.length);
})();

/**
 * Older Nestiee SKUs (e.g. #10609-era) use the 所需禮盒 label as the Woo line name
 * (`星空金`, `紅色銀`, `粉紅心意 - 桂花味`) instead of the configurable 星空禮盒 / 心意禮盒 products.
 */
function nameMatchesGiftBoxNeedle(normalizedName: string, needle: string): boolean {
  if (normalizedName === needle) return true;
  if (!normalizedName.startsWith(needle)) return false;
  // Allow `星空金3盒` but not `花月禮盒兩盒` / longer configurable product titles.
  return /^\d+盒?$/.test(normalizedName.slice(needle.length));
}

function parseNestieeGiftBoxByTypeLabel(
  name: string,
  haystack: string
): { qtyKey: string; boxes: number } | null {
  const n = normalizeGiftBoxLabel(name);
  if (!n) return null;
  for (const g of NESTIEE_GIFT_BOX_LABEL_NEEDLES) {
    if (nameMatchesGiftBoxNeedle(n, g.needle)) {
      return { qtyKey: g.qtyKey, boxes: parseNestieeNBoxQty(haystack) ?? 1 };
    }
  }
  return null;
}

/** Mid-Autumn combo SKU: 1 set → 1 花月禮盒 + 1 星空金 + 1 星空銀. */
const NESTIEE_MID_AUTUMN_HUA_YUE_BUNDLE = '中秋 ‧ 花好月圓燕窩禮盒套裝';
const NESTIEE_MID_AUTUMN_HUA_YUE_BUNDLE_NEEDLE = normalizeGiftBoxLabel(
  NESTIEE_MID_AUTUMN_HUA_YUE_BUNDLE
);

function isNestieeMidAutumnHuaYueBundle(name: string, haystack: string): boolean {
  if (!NESTIEE_MID_AUTUMN_HUA_YUE_BUNDLE_NEEDLE) return false;
  return (
    normalizeGiftBoxLabel(name).includes(NESTIEE_MID_AUTUMN_HUA_YUE_BUNDLE_NEEDLE) ||
    normalizeGiftBoxLabel(haystack).includes(NESTIEE_MID_AUTUMN_HUA_YUE_BUNDLE_NEEDLE)
  );
}

/** Auto-map Woo line name / EPO options → 所需禮盒 qty keys. */
const NESTIEE_STAR_BOX_NAME_CORE = '星空禮盒 · 即食燕窩';
const NESTIEE_HUA_YUE_CN_QTY: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
};

const NESTIEE_PINK_BOX_NAME = '心意即食燕窩禮盒 ‧ 𝑫𝒆𝒂𝒓𝒆𝒔𝒕 𝑴𝒐𝒎𝒆𝒏𝒕';
const NESTIEE_PINK_BOX_NAME_ALT = '心意即食燕窩禮盒 · 𝑫𝒆𝒂𝒓𝒆𝒔𝒕 𝑴𝒐𝒎𝒆𝒏𝒕';
const NESTIEE_PINK_SINGLE_OPTION = '👑👩 單盒就夠';
const NESTIEE_PINK_DOUBLE_OPTION = '🌷雙盒更優惠';
const NESTIEE_PINK_OSMANTHUS_OPTION = '⚪ 經典滋潤 (桂花&冰糖)';
const NESTIEE_PINK_RED_DATE_OPTION = '🟡 暖心補氣: (紅棗&冰糖)';
const NESTIEE_PINK_BOTH_OPTION = '兩味各一盒';

function normalizeNestieeMatchText(text: string): string {
  return text
    .replace(/\u2027|\u00b7/g, '·') // hyphenation / middle dots → ·
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNestieeEmojis(text: string): string {
  return text
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(/[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]/g, '');
}

function nestieeNameForGiftMatch(name: string): string {
  return normalizeNestieeMatchText(stripNestieeEmojis(name));
}

/** NFKC first so math-bold / fullwidth digits become ASCII before emoji/surrogate stripping. */
function nestieeQtyText(text: string): string {
  return nestieeNameForGiftMatch(text.normalize('NFKC'));
}

function nestieeGiftQtyHaystack(line: NestieeLineItem): string {
  const parts = [line.name || ''];
  for (const opt of line.options || []) {
    if (opt.label) parts.push(opt.label);
    if (opt.value) parts.push(opt.value);
  }
  return nestieeQtyText(parts.join(' '));
}

/** Arabic N盒, else Chinese 一…八盒. Ignores 金盒 / 銀盒 / 單盒 / 雙盒. */
function parseNestieeNBoxQty(haystack: string): number | null {
  const arabic = haystack.match(/(\d+)\s*盒/);
  if (arabic) {
    const n = Number(arabic[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const cn = haystack.match(/([一二三四五六七八])\s*盒/);
  if (!cn) return null;
  return NESTIEE_HUA_YUE_CN_QTY[cn[1]] ?? null;
}

function parseNestieeStarGiftBoxQtys(
  name: string,
  haystack: string
): { gold: number; silver: number } | null {
  if (!nestieeNameForGiftMatch(name).includes(NESTIEE_STAR_BOX_NAME_CORE)) return null;
  const mixed = haystack.match(/(\d+)\s*盒[\s\S]*?(\d+)\s*金\s*(\d+)\s*銀/);
  if (mixed) {
    return { gold: Number(mixed[2]) || 0, silver: Number(mixed[3]) || 0 };
  }
  const gold = haystack.match(/金[\s\S]*?·[\s\S]*?桂花[\s\S]*?(\d+)\s*盒/);
  if (gold) return { gold: Number(gold[1]) || 0, silver: 0 };
  const silver = haystack.match(/銀[\s\S]*?·[\s\S]*?冰糖[\s\S]*?(\d+)\s*盒/);
  if (silver) return { gold: 0, silver: Number(silver[1]) || 0 };
  return { gold: 0, silver: 0 };
}

function parseNestieeHuaYueQty(name: string, haystack: string): number | null {
  if (!nestieeNameForGiftMatch(name).includes('花月禮盒')) return null;
  return parseNestieeNBoxQty(haystack);
}

function parseNestieeTrialSetQty(name: string, haystack: string): number | null {
  if (!nestieeNameForGiftMatch(name).includes('Trial Set')) return null;
  return parseNestieeNBoxQty(haystack) ?? 1;
}

/** 心意禮盒: 紅棗x盒 → 紅色金, 冰糖x盒 → 紅色銀, x套y盒 → x on both. */
function parseNestieeXinYiGiftBoxQtys(
  name: string,
  haystack: string
): { gold: number; silver: number } | null {
  if (!nestieeNameForGiftMatch(name).includes('心意禮盒')) return null;
  const redDate = haystack.match(/紅棗\s*(\d+)\s*盒/);
  const rockSugar = haystack.match(/冰糖\s*(\d+)\s*盒/);
  if (redDate || rockSugar) {
    return {
      gold: redDate ? Number(redDate[1]) || 0 : 0,
      silver: rockSugar ? Number(rockSugar[1]) || 0 : 0,
    };
  }
  const set = haystack.match(/(\d+)\s*套\s*(\d+)\s*盒/);
  if (set) {
    const n = Number(set[1]) || 0;
    return { gold: n, silver: n };
  }
  return { gold: 0, silver: 0 };
}

/**
 * Derive 所需禮盒 quantities from Nestiee Woo lines.
 * Product identity is taken from the line name; box counts from name + all EPO options
 * as a number immediately before 盒 (NFKC so fullwidth / math-bold digits match).
 */
export function computeNestieeGiftBoxQtysFromLines(
  lines: NestieeLineItem[]
): Record<string, number> {
  const qtys: Record<string, number> = {
    nestiee_gift_qty_star_gold: 0,
    nestiee_gift_qty_star_silver: 0,
    nestiee_gift_qty_red_gold: 0,
    nestiee_gift_qty_red_silver: 0,
    nestiee_gift_qty_pink_osmanthus: 0,
    nestiee_gift_qty_pink_red_date: 0,
    nestiee_gift_qty_hua_yue: 0,
    nestiee_gift_qty_trial_set: 0,
    nestiee_gift_qty_rou_run_share_box: 0,
    nestiee_gift_qty_qiu_yan_fei_yue: 0,
    nestiee_gift_qty_sui_xin_7: 0,
    nestiee_gift_qty_sui_xin_14: 0,
    nestiee_gift_qty_sui_xin_18: 0,
  };
  const pinkNames = new Set([
    normalizeNestieeMatchText(NESTIEE_PINK_BOX_NAME),
    normalizeNestieeMatchText(NESTIEE_PINK_BOX_NAME_ALT),
  ]);
  const pinkSingle = normalizeNestieeMatchText(NESTIEE_PINK_SINGLE_OPTION);
  const pinkDouble = normalizeNestieeMatchText(NESTIEE_PINK_DOUBLE_OPTION);
  const pinkOsmanthus = normalizeNestieeMatchText(NESTIEE_PINK_OSMANTHUS_OPTION);
  const pinkRedDate = normalizeNestieeMatchText(NESTIEE_PINK_RED_DATE_OPTION);
  const pinkBoth = normalizeNestieeMatchText(NESTIEE_PINK_BOTH_OPTION);

  for (const line of lines) {
    const name = normalizeNestieeMatchText(line.name);
    const nameForProduct = nestieeNameForGiftMatch(line.name);
    const haystack = nestieeGiftQtyHaystack(line);
    const qty = Math.max(0, line.quantity || 0);
    if (!qty) continue;
    const firstOpt = normalizeNestieeMatchText(line.options?.[0]?.value || '');
    const secondOpt = normalizeNestieeMatchText(line.options?.[1]?.value || '');

    // 中秋套裝 must run before 花月禮盒 / 星空 parsers — the variation title embeds those words.
    if (isNestieeMidAutumnHuaYueBundle(line.name, haystack)) {
      qtys.nestiee_gift_qty_hua_yue += qty;
      qtys.nestiee_gift_qty_star_gold += qty;
      qtys.nestiee_gift_qty_star_silver += qty;
      continue;
    }

    const trialQty = parseNestieeTrialSetQty(line.name, haystack);
    if (trialQty != null) {
      qtys.nestiee_gift_qty_trial_set += trialQty * qty;
      continue;
    }

    const huaYueQty = parseNestieeHuaYueQty(line.name, haystack);
    if (huaYueQty != null) {
      qtys.nestiee_gift_qty_hua_yue += huaYueQty * qty;
      continue;
    }

    const starQtys = parseNestieeStarGiftBoxQtys(line.name, haystack);
    if (starQtys) {
      qtys.nestiee_gift_qty_star_gold += starQtys.gold * qty;
      qtys.nestiee_gift_qty_star_silver += starQtys.silver * qty;
      continue;
    }

    if (
      nameForProduct.includes('Sharing We Time Box') ||
      nameForProduct.includes('柔潤分享時光盒')
    ) {
      const nBox = parseNestieeNBoxQty(haystack);
      if (nBox != null) {
        qtys.nestiee_gift_qty_rou_run_share_box += nBox * qty;
        continue;
      }
    }

    if (nameForProduct.includes('秋燕飛躍')) {
      const nBox = parseNestieeNBoxQty(haystack);
      if (nBox != null) {
        qtys.nestiee_gift_qty_qiu_yan_fei_yue += nBox * qty;
        continue;
      }
    }

    if (nameForProduct.includes('隨心燉')) {
      if (haystack.includes('21份裝')) {
        qtys.nestiee_gift_qty_sui_xin_7 += qty;
        qtys.nestiee_gift_qty_sui_xin_14 += qty;
        continue;
      }
      if (haystack.includes('18份裝')) {
        qtys.nestiee_gift_qty_sui_xin_18 += qty;
        continue;
      }
      if (haystack.includes('14份裝')) {
        qtys.nestiee_gift_qty_sui_xin_7 += 2 * qty;
        continue;
      }
      if (haystack.includes('一周7份')) {
        qtys.nestiee_gift_qty_sui_xin_7 += qty;
        continue;
      }
    }

    const xinYiQtys = parseNestieeXinYiGiftBoxQtys(line.name, haystack);
    if (xinYiQtys) {
      qtys.nestiee_gift_qty_red_gold += xinYiQtys.gold * qty;
      qtys.nestiee_gift_qty_red_silver += xinYiQtys.silver * qty;
      continue;
    }

    if (pinkNames.has(name)) {
      if (firstOpt === pinkSingle) {
        if (secondOpt === pinkOsmanthus) qtys.nestiee_gift_qty_pink_osmanthus += qty;
        else if (secondOpt === pinkRedDate) qtys.nestiee_gift_qty_pink_red_date += qty;
      } else if (firstOpt === pinkDouble) {
        if (secondOpt === pinkBoth) {
          qtys.nestiee_gift_qty_pink_osmanthus += qty;
          qtys.nestiee_gift_qty_pink_red_date += qty;
        } else if (secondOpt === pinkOsmanthus) {
          qtys.nestiee_gift_qty_pink_osmanthus += qty * 2;
        } else if (secondOpt === pinkRedDate) {
          qtys.nestiee_gift_qty_pink_red_date += qty * 2;
        }
      }
      continue;
    }

    const byLabel = parseNestieeGiftBoxByTypeLabel(line.name, haystack);
    if (byLabel) {
      qtys[byLabel.qtyKey] = (qtys[byLabel.qtyKey] || 0) + byLabel.boxes * qty;
    }
  }
  return qtys;
}

/** Manual-edit flag key for a 所需禮盒 qty field. */
export function nestieeGiftQtyManualKey(qtyKey: string): string {
  return `${qtyKey}_manual`;
}

export function isNestieeGiftQtyManual(
  fields: Record<string, unknown>,
  qtyKey: string
): boolean {
  const v = fields[nestieeGiftQtyManualKey(qtyKey)];
  return v === true || v === 'true' || v === 1 || v === '1';
}

/**
 * Apply auto gift-box qtys onto fields, skipping keys the user has manually edited.
 * Returns the keys that were written.
 */
export function applyNestieeGiftBoxAutoQtys(
  fields: Record<string, unknown>,
  lines: NestieeLineItem[]
): string[] {
  const giftQtys = computeNestieeGiftBoxQtysFromLines(lines);
  const written: string[] = [];
  for (const [key, qty] of Object.entries(giftQtys)) {
    if (isNestieeGiftQtyManual(fields, key)) continue;
    fields[key] = String(qty);
    written.push(key);
  }
  return written;
}

/**
 * Fill 所需禮盒 from stored Woo lines (skips keys the user marked manual).
 * Used on dashboard rollup, order read, and the one-time backfill.
 */
export function hydrateNestieeGiftBoxQtys(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const lines = getNestieeLines(fields);
  if (!lines.length) return fields;
  applyNestieeGiftBoxAutoQtys(fields, lines);
  return fields;
}

/** True when auto gift-box keys would change (used by the persist backfill). */
export function nestieeGiftBoxQtyFieldsChanged(
  fields: Record<string, unknown>
): boolean {
  const before: Record<string, string> = {};
  for (const g of NESTIEE_GIFT_BOX_TYPES) {
    before[g.qtyKey] = String(fields[g.qtyKey] ?? '');
  }
  hydrateNestieeGiftBoxQtys(fields);
  return NESTIEE_GIFT_BOX_TYPES.some((g) => String(fields[g.qtyKey] ?? '') !== before[g.qtyKey]);
}

export interface NestieeLineOption {
  label: string;
  value: string;
  price: number;
}

/** Normalized Woo line item stored on Nestiee orders as `fields.nestiee_lines` JSON. */
export interface NestieeLineItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  options?: NestieeLineOption[];
}

export type WooAddressLike = {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type WooMetaDatum = {
  key?: string | null;
  value?: unknown;
  display_key?: string | null;
  display_value?: unknown;
};

export type WooLineItemLike = {
  name?: string | null;
  quantity?: number | string | null;
  price?: number | string | null;
  total?: number | string | null;
  meta_data?: WooMetaDatum[] | null;
  image?: { src?: string | null; id?: string | number | null } | null;
};

function nestieeNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || !value.trim()) return 0;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function hasExplicitAmount(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim() !== '';
  return false;
}

/** Keep an explicit $0 line total; only fall back to unit × qty when total is missing. */
function nestieeResolvedLineTotal(explicit: unknown, unitPrice: number, quantity: number): number {
  if (hasExplicitAmount(explicit)) {
    return Math.round(nestieeNum(explicit) * 100) / 100;
  }
  return Math.round(unitPrice * quantity * 100) / 100;
}

/** Strip simple HTML tags from TM EPO labels. */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Join non-empty Woo address parts into a multiline string (street/city only; name & phone live on the order). */
export function formatWooAddress(addr: WooAddressLike | null | undefined): string {
  if (!addr) return '';
  const part = (v: unknown) => String(v ?? '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = [
    part(addr.company),
    part(addr.address_1),
    part(addr.address_2),
    [part(addr.city), part(addr.state), part(addr.postcode)].filter(Boolean).join(', ').trim(),
    part(addr.country),
  ].filter(Boolean);
  return lines.join('\n');
}

function parseNestieeOptionsFromMeta(meta: WooMetaDatum[] | null | undefined): NestieeLineOption[] {
  if (!Array.isArray(meta)) return [];
  const epo = meta.find((m) => m?.key === '_tmcartepo_data');
  const raw = epo?.value;
  if (Array.isArray(raw)) {
    const out: NestieeLineOption[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const label = stripHtml(String(e.name ?? ''));
      const value = stripHtml(String(e.value ?? ''));
      if (!label && !value) continue;
      out.push({
        label: label || 'Option',
        value,
        price: Math.round(nestieeNum(e.price) * 100) / 100,
      });
    }
    if (out.length) return out;
  }

  // Admin-created Woo line items often store options as visible meta, not _tmcartepo_data.
  const visible: NestieeLineOption[] = [];
  for (const m of meta) {
    const key = String(m?.key || '').trim();
    if (!key || key.startsWith('_')) continue;
    const label = stripHtml(String(m.display_key || key));
    const value = nestieeMetaScalarText(m.display_value ?? m.value);
    if (!label && !value) continue;
    visible.push({
      label: label || 'Option',
      value,
      price: 0,
    });
  }
  return visible;
}

function parseNestieeOptionsStored(raw: unknown): NestieeLineOption[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const out: NestieeLineOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const label = String(e.label ?? '').trim();
    const value = String(e.value ?? '').trim();
    if (!label && !value) continue;
    out.push({
      label: label || 'Option',
      value,
      price: Math.round(nestieeNum(e.price) * 100) / 100,
    });
  }
  return out.length ? out : undefined;
}

/** Normalize WooCommerce `line_items` into Nestiee product rows (incl. TM EPO options). */
export function parseNestieeLinesFromWoo(lineItems: WooLineItemLike[] | null | undefined): NestieeLineItem[] {
  if (!Array.isArray(lineItems) || !lineItems.length) return [];
  const out: NestieeLineItem[] = [];
  for (const li of lineItems) {
    const name = String(li?.name ?? '').trim();
    if (!name) continue;
    const quantity = nestieeNum(li.quantity);
    const unit_price = Math.round(nestieeNum(li.price) * 100) / 100;
    const line_total = nestieeResolvedLineTotal(li.total, unit_price, quantity);
    const options = parseNestieeOptionsFromMeta(li.meta_data);
    const row: NestieeLineItem = { name, quantity, unit_price, line_total };
    if (options.length) row.options = options;
    out.push(row);
  }
  return out;
}

/** True when Nestiee EPO option is any ASAP / 按最快寄出 送貨安排 variant. */
export function isNestieeFastestShipOption(opt: Pick<NestieeLineOption, 'label' | 'value'>): boolean {
  const label = stripHtml(String(opt.label || ''));
  const value = stripHtml(String(opt.value || ''));
  if (!/送貨安排/.test(label)) return false;
  // Covers 按最快寄出… and 按最快日子寄出…
  return /按最快(?:日子)?寄出/.test(value);
}

/** True when Nestiee EPO option is 預約指定日子 under 送貨安排. */
export function isNestieeScheduledShipOption(opt: Pick<NestieeLineOption, 'label' | 'value'>): boolean {
  const label = stripHtml(String(opt.label || ''));
  const value = stripHtml(String(opt.value || ''));
  if (!/送貨安排/.test(label)) return false;
  return /預約指定日子/.test(value);
}

/** Companion date field shown when customer books a delivery day. */
export function isNestieeScheduledDeliveryDateOption(
  opt: Pick<NestieeLineOption, 'label' | 'value'>
): boolean {
  const label = stripHtml(String(opt.label || ''));
  return /預約送達日期|請選擇送貨日/.test(label);
}

function nestieeOrderCreatedIso(orderCreatedAt: string | null | undefined): string {
  return (
    normalizeOrderDueDate(String(orderCreatedAt || '').slice(0, 10)) ||
    normalizeOrderDueDate(String(orderCreatedAt || '')) ||
    ''
  );
}

function isNestieeAsapDeliveryText(raw: string): boolean {
  return /按最快(?:日子)?寄出/.test(stripHtml(raw));
}

const NESTIEE_DELIVERY_DATE_META_KEYS = new Set([
  '_wc_other/nestiee/delivery_date',
  'nestiee/delivery_date',
]);

/** True for Woo meta that looks like a delivery/receipt date (admin custom fields included). */
export function isNestieeDeliveryDateMetaField(key: string, displayKey = ''): boolean {
  const k = String(key || '').trim();
  const d = stripHtml(String(displayKey || ''));
  if (!k && !d) return false;
  if (NESTIEE_DELIVERY_DATE_META_KEYS.has(k)) return true;
  const hay = `${k} ${d}`.toLowerCase();
  if (/(?:^|_)(?:date_paid|date_completed|date_created|date_modified|paid_date)(?:$|_)/.test(hay)) {
    return false;
  }
  if (/pi_overall_estimate/.test(hay)) return false;
  if (/delivery[_-]?date|ship(?:ping)?[_-]?date/.test(hay)) return true;
  if (/送貨日期|收貨日期|送達日期|出貨日期/.test(`${k}${d}`)) return true;
  return false;
}

function nestieeMetaScalarText(value: unknown): string {
  if (value == null || value === false) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) return new Date(value).toISOString().slice(0, 10);
    if (value > 1e9) return new Date(value * 1000).toISOString().slice(0, 10);
    return String(value);
  }
  if (typeof value === 'string') return stripHtml(value).trim();
  if (Array.isArray(value)) {
    for (const v of value) {
      const text = nestieeMetaScalarText(v);
      if (text) return text;
    }
    return '';
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of ['date', 'value', 'delivery_date', 'formatted', 'label']) {
      const text = nestieeMetaScalarText(o[k]);
      if (text) return text;
    }
  }
  return stripHtml(String(value)).trim();
}

function parseNestieeDeliveryDateMetaValue(raw: unknown): string {
  const value = nestieeMetaScalarText(raw);
  if (!value) return '';
  if (isNestieeAsapDeliveryText(value)) return '__ASAP__';
  return normalizeOrderDueDate(value) || '';
}

function collectNestieeWooMeta(payload: Record<string, unknown>): WooMetaDatum[] {
  const out: WooMetaDatum[] = [];
  if (Array.isArray(payload.meta_data)) {
    out.push(...(payload.meta_data as WooMetaDatum[]));
  }
  const lines = Array.isArray(payload.line_items) ? payload.line_items : [];
  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const meta = (line as WooLineItemLike).meta_data;
    if (Array.isArray(meta)) out.push(...meta);
  }
  return out;
}

/** Nestiee checkout / admin custom field: order (or line) meta delivery date. */
export function parseNestieeDeliveryDateMeta(
  payload: Record<string, unknown> | null | undefined
): string {
  if (!payload) return '';
  const meta = collectNestieeWooMeta(payload);

  const read = (m: WooMetaDatum): string =>
    parseNestieeDeliveryDateMetaValue(m.display_value ?? m.value);

  for (const m of meta) {
    const key = String(m?.key || '').trim();
    if (!NESTIEE_DELIVERY_DATE_META_KEYS.has(key)) continue;
    const parsed = read(m);
    if (parsed) return parsed;
  }

  for (const m of meta) {
    const key = String(m?.key || '').trim();
    if (key === '_tmcartepo_data') continue;
    const displayKey = String(m?.display_key || '');
    if (!isNestieeDeliveryDateMetaField(key, displayKey)) continue;
    const parsed = read(m);
    if (parsed) return parsed;
  }
  return '';
}

/**
 * Nestiee → 客人收貨日期 (priority):
 * 1. Order meta nestiee/delivery_date (ISO / English date, or ASAP text → created+2)
 * 2. Other Woo delivery-date custom fields (admin-created orders often skip checkout EPO)
 * 3. EPO 預約指定日子 + companion 預約送達日期 (or the same options on visible line meta)
 * 4. EPO 按最快寄出… → created+2
 */
export function parseNestieeReceiptDateFromDeliveryOptions(
  lines: NestieeLineItem[] | null | undefined,
  orderCreatedAt: string | null | undefined,
  payload?: Record<string, unknown> | null
): string {
  const created =
    nestieeOrderCreatedIso(orderCreatedAt) ||
    nestieeOrderCreatedIso(
      typeof payload?.date_created === 'string' ? payload.date_created : ''
    );

  const fromMeta = parseNestieeDeliveryDateMeta(payload);
  if (fromMeta === '__ASAP__') {
    return created ? addCalendarDays(created, 2) : '';
  }
  if (fromMeta) return fromMeta;

  if (Array.isArray(lines) && lines.length) {
    for (const line of lines) {
      const opts = line.options || [];
      if (!opts.some((opt) => isNestieeScheduledShipOption(opt))) continue;
      for (const opt of opts) {
        if (!isNestieeScheduledDeliveryDateOption(opt)) continue;
        const iso = normalizeOrderDueDate(opt.value);
        if (iso) return iso;
      }
    }

    const hasFastest = lines.some((line) =>
      (line.options || []).some((opt) => isNestieeFastestShipOption(opt))
    );
    if (hasFastest && created) return addCalendarDays(created, 2);
  }

  return '';
}

/** Existing InvoiceFlow receipt date (due_date / 客人收貨日期), if parseable. */
export function existingOrderReceiptDate(fields: Record<string, unknown> | null | undefined): string {
  if (!fields) return '';
  return (
    normalizeOrderDueDate(String(fields.due_date || '')) ||
    normalizeOrderDueDate(String(fields.client_delivery_date || '')) ||
    ''
  );
}

/**
 * Hub ingest / re-sync: Woo delivery date wins whenever it parses.
 * Covers Woo-admin edits after checkout, local 客人收貨日期 edits, and ASAP (created+2).
 * Keep the local date only when Woo has nothing parseable.
 */
export function resolveNestieeReceiptDateOnIngest(
  fields: Record<string, unknown> | null | undefined,
  lines: NestieeLineItem[] | null | undefined,
  orderCreatedAt: string | null | undefined,
  payload?: Record<string, unknown> | null
): string {
  return (
    parseNestieeReceiptDateFromDeliveryOptions(lines, orderCreatedAt, payload) ||
    existingOrderReceiptDate(fields)
  );
}

/** Read `fields.nestiee_lines` (JSON string or already-parsed array). */
export function getNestieeLines(
  fields: Record<string, string | boolean | unknown>
): NestieeLineItem[] {
  const raw = fields.nestiee_lines;
  if (raw == null || raw === false || raw === '') return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const out: NestieeLineItem[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    if (!name) continue;
    const quantity = nestieeNum(r.quantity);
    const unit_price = Math.round(nestieeNum(r.unit_price ?? r.price) * 100) / 100;
    const line_total = nestieeResolvedLineTotal(
      r.line_total != null && r.line_total !== '' ? r.line_total : r.total,
      unit_price,
      quantity
    );
    const item: NestieeLineItem = { name, quantity, unit_price, line_total };
    const options = parseNestieeOptionsStored(r.options);
    if (options) item.options = options;
    out.push(item);
  }
  return out;
}

/** Billing for quotations: prefer fields.billing_address, else shipping. */
export function resolveOrderAddressesForQuotation(order: {
  shipping_address?: string | null;
  fields?: Record<string, string | boolean | unknown>;
}): { billingAddress: string | null; shippingAddress: string | null } {
  const billing = String(order.fields?.billing_address ?? '').trim() || null;
  const shipping = order.shipping_address?.trim() || null;
  return {
    billingAddress: billing || shipping,
    shippingAddress: shipping || billing,
  };
}

/** Default order_type when ingesting from a WooCommerce store platform. */
export const WOO_PLATFORM_ORDER_TYPE: Partial<
  Record<'nestiee' | 'honour' | 'honour_en' | 'cupmoka', OrderType>
> = {
  honour: 'honour訂製',
  honour_en: 'honour en訂製',
  nestiee: NESTIEE_ORDER_TYPE,
  cupmoka: 'Cupmoka',
};

export const PAYMENT_STATUS_LABELS = ['Unpaid', '部分付款 Partly Paid', 'Full Paid'] as const;
export type PaymentStatusLabel = (typeof PAYMENT_STATUS_LABELS)[number];

export const ORDER_PAYMENT_METHODS = [
  'FPS',
  'Payme',
  'Yedpay 信用卡',
  'Yedpay Alipay',
  '現金',
  '其他(請備註)',
] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];
export const ORDER_PAYMENT_METHOD_OTHER: OrderPaymentMethod = '其他(請備註)';

/** Map free-text / OCR method strings onto the fixed payment-method options. */
export function normalizeOrderPaymentMethod(raw: string | null | undefined): {
  method: OrderPaymentMethod | '';
  note: string;
} {
  const text = String(raw || '').trim();
  if (!text) return { method: '', note: '' };
  if ((ORDER_PAYMENT_METHODS as readonly string[]).includes(text)) {
    return { method: text as OrderPaymentMethod, note: '' };
  }
  const lower = text.toLowerCase();
  if (/轉數快|\bfps\b/.test(lower)) return { method: 'FPS', note: '' };
  if (/pay\s*me|payme/.test(lower)) return { method: 'Payme', note: '' };
  if (/yedpay/.test(lower) && /(信用卡|credit|visa|master|card)/.test(lower)) {
    return { method: 'Yedpay 信用卡', note: '' };
  }
  if (/yedpay/.test(lower) && /(alipay|支付寶|支付宝)/.test(lower)) {
    return { method: 'Yedpay Alipay', note: '' };
  }
  if (/(alipay|支付寶|支付宝)/.test(lower) && /online|yedpay|線上/.test(lower)) {
    return { method: 'Yedpay Alipay', note: '' };
  }
  if (/現金|cash/.test(lower)) return { method: '現金', note: '' };
  return { method: ORDER_PAYMENT_METHOD_OTHER, note: text };
}

/** Extract Nestiee payment bank/method from a Woo order payload. */
export function parseNestieePaymentFromWoo(payload: Record<string, unknown> | null | undefined): {
  bank: string;
  method: OrderPaymentMethod | '';
  note: string;
} {
  const meta = Array.isArray(payload?.meta_data) ? (payload!.meta_data as WooMetaDatum[]) : [];
  const yedpayMethod = String(
    meta.find((m) => String(m?.key || '') === 'yedpay_payment_method')?.value ?? ''
  ).trim();
  const title = String(payload?.payment_method_title ?? '').trim();
  const combined = [title, yedpayMethod].filter(Boolean).join(' ');
  const primary = normalizeOrderPaymentMethod(combined || yedpayMethod || title);
  return {
    bank: title,
    method: primary.method,
    note: primary.note,
  };
}

/** Synthetic Nestiee line name for Woo shipping fees. */
export const NESTIEE_SHIPPING_LINE_NAME = 'Shipping';

type WooShippingLineLike = {
  method_title?: string | null;
  method_id?: string | null;
  total?: string | number | null;
};

/** Prefer top-level shipping_total; else sum shipping_lines[].total. */
export function parseWooShippingTotal(payload: Record<string, unknown> | null | undefined): number {
  if (!payload) return 0;
  const top = nestieeNum(payload.shipping_total);
  if (top > 0) return Math.round(top * 100) / 100;
  const lines = Array.isArray(payload.shipping_lines)
    ? (payload.shipping_lines as WooShippingLineLike[])
    : [];
  let sum = 0;
  for (const line of lines) {
    sum += nestieeNum(line?.total);
  }
  return Math.round(sum * 100) / 100;
}

/** First non-empty shipping_lines[].method_title. */
export function parseWooShippingMethod(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return '';
  const lines = Array.isArray(payload.shipping_lines)
    ? (payload.shipping_lines as WooShippingLineLike[])
    : [];
  for (const line of lines) {
    const title = String(line?.method_title ?? '').trim();
    if (title) return title;
  }
  return '';
}

/** Map Woo shipping titles onto Shipment Detail select options when possible. */
export function normalizeOrderShippingMethod(raw: string | null | undefined): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if ((ORDER_SHIPPING_METHODS as readonly string[]).includes(text)) return text;
  const lower = text.toLowerCase();
  if (/sf\s*express|\bsf\b|順豐速運|顺丰/.test(lower) || /順豐/.test(text)) {
    if (/sf\s*順豐|^sf\b/i.test(text) || /sf\s*express/i.test(lower)) return 'SF 順豐';
    return '順豐';
  }
  if (/\bems\b/i.test(text)) return 'EMS';
  if (/香港郵政|hong\s*kong\s*post|hkpost/i.test(text)) return '香港郵政';
  if (/其他|other/i.test(text)) return '其他';
  // Preserve unknown Woo titles so nothing is lost (select still shows the value).
  return text;
}

/**
 * Strip any existing Shipping rows, then append one when shippingTotal > 0.
 * Keeps Nestiee re-imports idempotent.
 */
export function appendNestieeShippingLine(
  lines: NestieeLineItem[],
  shippingTotal: number
): NestieeLineItem[] {
  const withoutShipping = lines.filter(
    (line) => normalizeNestieeMatchText(line.name) !== normalizeNestieeMatchText(NESTIEE_SHIPPING_LINE_NAME)
  );
  const amount = Math.round(Math.max(0, shippingTotal) * 100) / 100;
  if (amount <= 0) return withoutShipping;
  return [
    ...withoutShipping,
    {
      name: NESTIEE_SHIPPING_LINE_NAME,
      quantity: 1,
      unit_price: amount,
      line_total: amount,
    },
  ];
}

/** Synthetic Cupmoka line name for Woo shipping fees. */
export const CUPMOKA_SHIPPING_LINE_NAME = 'Shipping';

export interface CupmokaLineOption {
  label: string;
  value: string;
  price: number;
}

/** Normalized Woo line item stored on Cupmoka orders as `fields.cupmoka_lines` JSON. */
export interface CupmokaLineItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image?: string;
  options?: CupmokaLineOption[];
}

function parseCupmokaOptionsFromMeta(meta: WooMetaDatum[] | null | undefined): CupmokaLineOption[] {
  if (!Array.isArray(meta)) return [];
  const out: CupmokaLineOption[] = [];
  for (const m of meta) {
    const key = String(m?.key ?? '').trim();
    const displayKey = String(m?.display_key ?? '').trim();
    const label = displayKey || key;
    if (!label || label.startsWith('_')) continue;
    const rawVal = m?.display_value ?? m?.value;
    const value = stripHtml(String(rawVal ?? '')).trim();
    if (!value) continue;
    out.push({ label, value, price: 0 });
  }
  return out;
}

function parseCupmokaOptionsStored(raw: unknown): CupmokaLineOption[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const out: CupmokaLineOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const label = String(e.label ?? '').trim();
    const value = String(e.value ?? '').trim();
    if (!label && !value) continue;
    out.push({
      label: label || 'Option',
      value,
      price: Math.round(nestieeNum(e.price) * 100) / 100,
    });
  }
  return out.length ? out : undefined;
}

/** Normalize WooCommerce `line_items` into Cupmoka product rows. */
export function parseCupmokaLinesFromWoo(lineItems: WooLineItemLike[] | null | undefined): CupmokaLineItem[] {
  if (!Array.isArray(lineItems) || !lineItems.length) return [];
  const out: CupmokaLineItem[] = [];
  for (const li of lineItems) {
    const name = String(li?.name ?? '').trim();
    if (!name) continue;
    const quantity = nestieeNum(li.quantity);
    const unit_price = Math.round(nestieeNum(li.price) * 100) / 100;
    const line_total = nestieeResolvedLineTotal(li.total, unit_price, quantity);
    const row: CupmokaLineItem = { name, quantity, unit_price, line_total };
    const image = String(li?.image?.src ?? '').trim();
    if (image) row.image = image;
    const options = parseCupmokaOptionsFromMeta(li.meta_data);
    if (options.length) row.options = options;
    out.push(row);
  }
  return out;
}

/**
 * Strip any existing Shipping rows, then append one when shippingTotal > 0.
 */
export function appendCupmokaShippingLine(
  lines: CupmokaLineItem[],
  shippingTotal: number
): CupmokaLineItem[] {
  const withoutShipping = lines.filter(
    (line) => line.name.trim().toLowerCase() !== CUPMOKA_SHIPPING_LINE_NAME.toLowerCase()
  );
  const amount = Math.round(Math.max(0, shippingTotal) * 100) / 100;
  if (amount <= 0) return withoutShipping;
  return [
    ...withoutShipping,
    {
      name: CUPMOKA_SHIPPING_LINE_NAME,
      quantity: 1,
      unit_price: amount,
      line_total: amount,
    },
  ];
}

/** Read `fields.cupmoka_lines` (JSON string or already-parsed array). */
export function getCupmokaLines(
  fields: Record<string, string | boolean | unknown>
): CupmokaLineItem[] {
  const raw = fields.cupmoka_lines;
  if (raw == null || raw === false || raw === '') return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const out: CupmokaLineItem[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    if (!name) continue;
    const quantity = nestieeNum(r.quantity);
    const unit_price = Math.round(nestieeNum(r.unit_price ?? r.price) * 100) / 100;
    const line_total = nestieeResolvedLineTotal(
      r.line_total != null && r.line_total !== '' ? r.line_total : r.total,
      unit_price,
      quantity
    );
    const item: CupmokaLineItem = { name, quantity, unit_price, line_total };
    const image = String(r.image ?? '').trim();
    if (image) item.image = image;
    const options = parseCupmokaOptionsStored(r.options);
    if (options) item.options = options;
    out.push(item);
  }
  return out;
}

/** Extract Cupmoka payment bank/method from a Woo order payload. */
export function parseCupmokaPaymentFromWoo(payload: Record<string, unknown> | null | undefined): {
  bank: string;
  method: OrderPaymentMethod | '';
  note: string;
  datePaid: string;
} {
  const title = String(payload?.payment_method_title ?? '').trim();
  const methodId = String(payload?.payment_method ?? '').trim();
  const label = title || methodId;
  const primary = normalizeOrderPaymentMethod(label);
  const datePaid =
    normalizeOrderDueDate(String(payload?.date_paid ?? '').slice(0, 10)) ||
    normalizeOrderDueDate(String(payload?.date_paid ?? '')) ||
    '';
  return {
    bank: label,
    method: primary.method,
    note: primary.note,
    datePaid,
  };
}

type WooShipmentTrackingItem = {
  tracking_provider?: string | null;
  custom_tracking_provider?: string | null;
  tracking_number?: string | null;
};

/** Read Woo `_wc_shipment_tracking_items` for Cupmoka. */
export function parseCupmokaShipmentTracking(
  payload: Record<string, unknown> | null | undefined
): { tracking_no: string; shipping_method_hint: string } {
  if (!payload) return { tracking_no: '', shipping_method_hint: '' };
  const meta = Array.isArray(payload.meta_data) ? (payload.meta_data as WooMetaDatum[]) : [];
  const row = meta.find((m) => String(m?.key || '') === '_wc_shipment_tracking_items');
  const items = Array.isArray(row?.value) ? (row!.value as WooShipmentTrackingItem[]) : [];
  const first = items[0];
  if (!first || typeof first !== 'object') return { tracking_no: '', shipping_method_hint: '' };
  const tracking_no = String(first.tracking_number ?? '').trim();
  const provider = String(first.tracking_provider || first.custom_tracking_provider || '').trim();
  let shipping_method_hint = '';
  if (/sf/i.test(provider) || /順豐/.test(provider)) {
    shipping_method_hint = /sf[\s_-]*express/i.test(provider) ? 'SF 順豐' : '順豐';
  }
  return { tracking_no, shipping_method_hint };
}

/** Synthetic Honour line style for Woo shipping fees — see export near HonourLineItem. */

export interface HonourCpoOption {
  label: string;
  value: string;
  key: string;
}

function honourMetaLabel(m: WooMetaDatum): string {
  const display = stripHtml(String(m.display_key ?? '')).trim();
  if (display && !display.startsWith('_')) return display;
  return String(m.key ?? '').trim();
}

function honourMetaValue(m: WooMetaDatum): string {
  const display = stripHtml(String(m.display_value ?? '')).trim();
  if (display) return display;
  return stripHtml(String(m.value ?? '')).trim();
}

function isHonourCpoInternalKey(key: string): boolean {
  if (!key) return true;
  if (key.startsWith('_cpo_')) return true;
  if (key.startsWith('_uni_item_')) return true;
  if (key.startsWith('_uni_custom_')) return true;
  if (key.startsWith('pi_')) return true;
  if (key === '_add-to-cart') return true;
  if (/_upload(_file)?$/i.test(key)) return true;
  if (/_notes$/i.test(key)) return true;
  return false;
}

/** Digits from CPO qty display values like "300個" / "300pcs". */
export function parseHonourCpoQuantityDigits(raw: string): string {
  const m = String(raw || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : '';
}

function honourCpoQuantityFromMeta(meta: WooMetaDatum[] | null | undefined): string {
  if (!Array.isArray(meta)) return '';
  for (const m of meta) {
    const key = String(m?.key ?? '');
    if (/_(quantity|qty)$/i.test(key)) {
      const digits = parseHonourCpoQuantityDigits(honourMetaValue(m));
      if (digits) return digits;
    }
  }
  for (const m of meta) {
    const label = honourMetaLabel(m);
    if (!label || /顏色數量|人數/.test(label)) continue;
    if (/數量|quantity|pcs/i.test(label)) {
      const digits = parseHonourCpoQuantityDigits(honourMetaValue(m));
      if (digits) return digits;
    }
  }
  return '';
}

/**
 * Visible Uni CPO options from line meta (excludes internals / uploads / pi_*).
 */
export function extractHonourCpoOptions(meta: WooMetaDatum[] | null | undefined): HonourCpoOption[] {
  if (!Array.isArray(meta)) return [];
  const out: HonourCpoOption[] = [];
  for (const m of meta) {
    const key = String(m?.key ?? '').trim();
    if (isHonourCpoInternalKey(key)) continue;
    // Keep _uni_cpo_* product options; skip other underscore internals without display labels.
    const label = honourMetaLabel(m);
    const value = honourMetaValue(m);
    if (!value) continue;
    if (!key.startsWith('_uni_cpo_') && label.startsWith('_')) continue;
    if (!label || label.startsWith('_')) continue;
    out.push({ label, value, key });
  }
  return out;
}

function honourCardSizeFromMeta(meta: WooMetaDatum[] | null | undefined): string {
  if (!Array.isArray(meta)) return '';
  let length = '';
  let width = '';
  let size = '';
  for (const m of meta) {
    const key = String(m?.key ?? '');
    const value = honourMetaValue(m);
    if (!value) continue;
    if (/custom_length/i.test(key)) length = value;
    else if (/custom_width/i.test(key)) width = value;
    else if (/_size$/i.test(key) || /尺寸|size/i.test(honourMetaLabel(m))) {
      if (!/^自訂|custom$/i.test(value)) size = value;
    }
  }
  if (length && width) return `${length}×${width}`;
  return size;
}

/**
 * Map CPO options onto a single Honour product line (craft / packaging / other_options).
 * Only fills empty fields so local edits survive re-import.
 * Known craft: size, 做法, 金屬電鍍色, 背面配件.
 * Known packaging: 內部包裝處理, 交貨包裝 (and aliases).
 * Everything else visible goes into other_options (not duplicated into known fields' dump).
 */
export function applyHonourOptionsToLine(
  line: HonourLineItem,
  options: HonourCpoOption[],
  metaForSize?: WooMetaDatum[] | null
): HonourLineItem {
  const next = { ...line };
  const setIfEmpty = (key: keyof HonourLineItem, value: string) => {
    if (!value.trim()) return;
    if (String(next[key] ?? '').trim()) return;
    (next as Record<string, string>)[key] = value.trim();
  };

  const cardSize = honourCardSizeFromMeta(metaForSize || null);
  if (cardSize) setIfEmpty('card_size', cardSize);

  const otherLines: string[] = [];
  for (const opt of options) {
    const label = opt.label;
    const value = opt.value;
    if (/備註|notes?/i.test(label)) continue;

    if (label === '金屬電鍍色') {
      setIfEmpty('plating_color', value);
      continue;
    }
    if (label === '背面配件') {
      setIfEmpty('clasp', value);
      continue;
    }
    if (label === '做法') {
      setIfEmpty('craft', value);
      continue;
    }
    if (label === '內部包裝處理' || /內部包裝/.test(label)) {
      setIfEmpty('internal_pack', value);
      continue;
    }
    if (
      label === '交貨包裝' ||
      label === '客戶要求交貨包裝' ||
      /交貨包裝|客戶.*包裝/.test(label)
    ) {
      setIfEmpty('pack_required', value);
      continue;
    }

    otherLines.push(`${label}: ${value}`);
  }
  if (otherLines.length) setIfEmpty('other_options', otherLines.join('\n'));
  return seedHonourLineDescription(next);
}

/** Preserve non-empty per-line craft/packaging when Hub re-syncs style/qty/price. */
export function mergeHonourLinesPreservingLocal(
  incoming: HonourLineItem[],
  existing: HonourLineItem[]
): HonourLineItem[] {
  return incoming.map((line, index) => {
    if (isHonourShippingLine(line)) return line;
    const prev = existing[index];
    if (!prev || isHonourShippingLine(prev)) return line;
    return {
      ...line,
      description: prev.description || line.description,
      card_size: prev.card_size || line.card_size,
      craft: prev.craft || line.craft,
      plating_color: prev.plating_color || line.plating_color,
      clasp: prev.clasp || line.clasp,
      internal_pack: prev.internal_pack || line.internal_pack,
      pack_required: prev.pack_required || line.pack_required,
      other_options: prev.other_options || line.other_options,
    };
  });
}

/** Normalize Woo line_items into Honour style/qty/price rows (Uni CPO qty preferred). */
export function parseHonourLinesFromWoo(lineItems: WooLineItemLike[] | null | undefined): HonourLineItem[] {
  if (!Array.isArray(lineItems) || !lineItems.length) return [];
  const out: HonourLineItem[] = [];
  for (const li of lineItems) {
    const style = String(li?.name ?? '').trim();
    if (!style) continue;
    const cpoQty = honourCpoQuantityFromMeta(li.meta_data);
    const wooQty = nestieeNum(li.quantity);
    const quantity = cpoQty || (wooQty > 0 ? String(wooQty) : '');
    const parsedQuantity = nestieeNum(quantity);
    const linePrice = nestieeNum(li.price);
    const unitPrice = parsedQuantity > 0 ? linePrice / parsedQuantity : linePrice;
    const unit_price = String(Math.round(unitPrice * 10_000) / 10_000);
    out.push({ ...emptyHonourLine(), style, quantity, unit_price });
  }
  return out;
}

/**
 * Build Honour lines from Woo with per-line CPO craft/packaging/options applied.
 */
export function buildHonourLinesFromWoo(
  lineItems: WooLineItemLike[] | null | undefined,
  shippingTotal = 0
): HonourLineItem[] {
  if (!Array.isArray(lineItems) || !lineItems.length) {
    return appendHonourShippingLine([], shippingTotal);
  }
  const out: HonourLineItem[] = [];
  for (const li of lineItems) {
    const style = String(li?.name ?? '').trim();
    if (!style) continue;
    const cpoQty = honourCpoQuantityFromMeta(li.meta_data);
    const wooQty = nestieeNum(li.quantity);
    const quantity = cpoQty || (wooQty > 0 ? String(wooQty) : '');
    const parsedQuantity = nestieeNum(quantity);
    const linePrice = nestieeNum(li.price);
    const unitPrice = parsedQuantity > 0 ? linePrice / parsedQuantity : linePrice;
    const unit_price = String(Math.round(unitPrice * 10_000) / 10_000);
    const base: HonourLineItem = { ...emptyHonourLine(), style, quantity, unit_price };
    const meta = li.meta_data || [];
    out.push(applyHonourOptionsToLine(base, extractHonourCpoOptions(meta), meta));
  }
  return appendHonourShippingLine(out, shippingTotal);
}

/**
 * Strip any existing Shipping rows, then append one when shippingTotal > 0.
 */
export function appendHonourShippingLine(
  lines: HonourLineItem[],
  shippingTotal: number
): HonourLineItem[] {
  const withoutShipping = lines.filter((line) => !isHonourShippingLine(line));
  const amount = Math.round(Math.max(0, shippingTotal) * 100) / 100;
  if (amount <= 0) return withoutShipping;
  return [
    ...withoutShipping,
    {
      ...emptyHonourLine(),
      style: HONOUR_SHIPPING_LINE_STYLE,
      quantity: '1',
      unit_price: String(amount),
    },
  ];
}

/** Same Woo payment shape as Nestiee. */
export function parseHonourPaymentFromWoo(
  payload: Record<string, unknown> | null | undefined
): ReturnType<typeof parseNestieePaymentFromWoo> {
  return parseNestieePaymentFromWoo(payload);
}

/** Honour's earliest overall estimate, normalized for the receipt-date input. */
export function parseHonourEstimateMinDate(
  payload: Record<string, unknown> | null | undefined
): string {
  if (!payload) return '';
  const meta = Array.isArray(payload.meta_data) ? (payload.meta_data as WooMetaDatum[]) : [];
  const min = String(
    meta.find((m) => String(m?.key || '') === 'pi_overall_estimate_min_date')?.value ?? ''
  ).trim();
  return normalizeOrderDueDate(min) || '';
}

/** Hub ingest / re-sync: Honour Woo estimate wins whenever it parses. */
export function resolveHonourReceiptDateOnIngest(
  fields: Record<string, unknown> | null | undefined,
  payload?: Record<string, unknown> | null
): string {
  return parseHonourEstimateMinDate(payload) || existingOrderReceiptDate(fields);
}

/** Collect CPO options across all product line items. */
export function collectHonourCpoOptionsFromLines(
  lineItems: WooLineItemLike[] | null | undefined
): { options: HonourCpoOption[]; sizeMeta: WooMetaDatum[] } {
  if (!Array.isArray(lineItems)) return { options: [], sizeMeta: [] };
  const options: HonourCpoOption[] = [];
  const sizeMeta: WooMetaDatum[] = [];
  for (const li of lineItems) {
    const meta = li.meta_data || [];
    sizeMeta.push(...meta);
    options.push(...extractHonourCpoOptions(meta));
  }
  return { options, sizeMeta };
}

/** Collect non-empty CPO 備註 values for the order's customer notes. */
export function parseHonourCpoNotesFromLines(
  lineItems: WooLineItemLike[] | null | undefined
): string {
  if (!Array.isArray(lineItems)) return '';
  const notes: string[] = [];
  for (const li of lineItems) {
    for (const meta of li.meta_data || []) {
      const key = String(meta?.key ?? '');
      const label = honourMetaLabel(meta);
      if (!/備註|notes?/i.test(label) && !/_notes?$/i.test(key)) continue;
      const value = honourMetaValue(meta);
      if (value && !notes.includes(value)) notes.push(value);
    }
  }
  return notes.join('\n');
}

/** Parse a free-form payment amount field into a finite number (else 0). */
export function parsePaymentAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || !value.trim()) return 0;
  const n = Number(value.replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum installment payments. First payment uses `payment_amount` when set,
 * otherwise falls back to legacy `payment1_amount` (never both).
 */
export function computeOrderPaidTotal(fields: Record<string, string | boolean>): number {
  const first =
    parsePaymentAmount(fields.payment_amount) || parsePaymentAmount(fields.payment1_amount);
  const second = parsePaymentAmount(fields.payment2_amount);
  const third = parsePaymentAmount(fields.payment3_amount);
  return Math.round((first + second + third) * 100) / 100;
}

/** Derive payment status from paid total vs optional amount due (invoice/order total). */
export function derivePaymentStatusLabel(
  paidTotal: number,
  dueTotal?: number | null
): PaymentStatusLabel {
  if (dueTotal != null && Number.isFinite(dueTotal) && dueTotal <= 0.009) {
    return 'Full Paid';
  }
  if (paidTotal <= 0.009) return 'Unpaid';
  if (dueTotal != null && Number.isFinite(dueTotal) && dueTotal > 0 && paidTotal >= dueTotal - 0.01) {
    return 'Full Paid';
  }
  return '部分付款 Partly Paid';
}

export type PaymentSlot = 1 | 2 | 3;

export const PAYMENT_SLOTS: { slot: PaymentSlot; label: string; shortLabel: string }[] = [
  { slot: 1, label: '第一期付款', shortLabel: '第一期' },
  { slot: 2, label: '第二期付款', shortLabel: '第二期' },
  { slot: 3, label: '第三期付款', shortLabel: '第三期' },
];

export interface PaymentSlotFieldKeys {
  date: string;
  amount: string;
  bank: string;
  method: string;
  reference: string;
  receipt: string;
  verified: string;
}

/** Map installment slot → `fields_json` keys. Slot 1 reuses legacy `payment_*` names. */
export function paymentSlotFields(slot: PaymentSlot): PaymentSlotFieldKeys {
  if (slot === 2) {
    return {
      date: 'payment2_date',
      amount: 'payment2_amount',
      bank: 'payment2_bank',
      method: 'payment2_method_detail',
      reference: 'payment2_reference',
      receipt: 'payment2_receipt_path',
      verified: 'payment2_verified',
    };
  }
  if (slot === 3) {
    return {
      date: 'payment3_date',
      amount: 'payment3_amount',
      bank: 'payment3_bank',
      method: 'payment3_method_detail',
      reference: 'payment3_reference',
      receipt: 'payment3_receipt_path',
      verified: 'payment3_verified',
    };
  }
  return {
    date: 'payment_date',
    amount: 'payment_amount',
    bank: 'payment_bank',
    method: 'payment_method_detail',
    reference: 'payment_reference',
    receipt: 'payment_receipt_path',
    verified: 'payment_verified',
  };
}

export function normalizePaymentSlot(slot: unknown): PaymentSlot {
  const n = Number(slot);
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 1;
}

export function isPaymentSlotVerified(
  fields: Record<string, string | boolean>,
  slot: PaymentSlot
): boolean {
  const key = paymentSlotFields(slot).verified;
  const v = fields[key];
  return v === true || v === 'true' || v === '1';
}

export function orderHasPaymentSlotData(
  fields: Record<string, string | boolean>,
  slot: PaymentSlot
): boolean {
  const keys = paymentSlotFields(slot);
  return [keys.date, keys.amount, keys.bank, keys.method, keys.reference, keys.receipt].some((k) => {
    const v = fields[k];
    return v != null && String(v).trim() !== '';
  });
}

export interface AccountingPaymentEntry {
  order_id: number;
  payment_slot: PaymentSlot;
  installment_label: string;
  order_ref: string;
  po_number: string;
  title: string;
  customer: string;
  order_type: string;
  payment_date: string;
  amount: string;
  bank: string;
  method: string;
  reference: string;
  has_receipt: boolean;
  payment_receipt_path: string;
  verified: boolean;
  linked_reconciliation_id: number | null;
}

/** Expand one order into 0–3 accounting rows (one per populated installment). */
export function expandOrderToPaymentEntries(
  order: {
    id: number;
    reference_number: string;
    po_number?: string | null;
    name: string | null;
    fields: Record<string, string | boolean>;
  },
  meta: {
    title: string;
    linkedByOrderSlot: Map<string, number>;
  }
): AccountingPaymentEntry[] {
  const entries: AccountingPaymentEntry[] = [];
  for (const { slot, shortLabel } of PAYMENT_SLOTS) {
    if (!orderHasPaymentSlotData(order.fields, slot)) continue;
    const keys = paymentSlotFields(slot);
    const linkedKey = `${order.id}-${slot}`;
    entries.push({
      order_id: order.id,
      payment_slot: slot,
      installment_label: shortLabel,
      order_ref: order.reference_number,
      po_number: (order.po_number || '').trim(),
      title: meta.title,
      customer: order.name || '',
      order_type: String(order.fields.order_type || ''),
      payment_date: String(order.fields[keys.date] || ''),
      amount: String(order.fields[keys.amount] || ''),
      bank: String(order.fields[keys.bank] || ''),
      method: String(order.fields[keys.method] || ''),
      reference: String(order.fields[keys.reference] || ''),
      has_receipt: Boolean(order.fields[keys.receipt]),
      payment_receipt_path: String(order.fields[keys.receipt] || ''),
      verified: isPaymentSlotVerified(order.fields, slot),
      linked_reconciliation_id: meta.linkedByOrderSlot.get(linkedKey) ?? null,
    });
  }
  return entries;
}

export const BIRD_NEST_FLAVORS: { key: string; label: string }[] = [
  { key: 'qty_rock_sugar', label: '客人訂冰糖味 (樽)' },
  { key: 'qty_osmanthus', label: '客人訂桂花味 (樽)' },
  { key: 'qty_red_date', label: '客人訂紅棗味 (樽)' },
];

/** Short labels for 燕窩回禮燉製 Order Detail flavor inputs. */
export const WEDDING_GIFT_CLIENT_FLAVORS: { key: string; label: string }[] = [
  { key: 'qty_rock_sugar', label: '冰糖味' },
  { key: 'qty_osmanthus', label: '桂花味' },
  { key: 'qty_red_date', label: '紅棗味' },
];

export const WEDDING_GIFT_ACTUAL_FLAVORS: { key: string; label: string; clientKey: string }[] = [
  { key: 'actual_qty_rock_sugar', label: '冰糖味', clientKey: 'qty_rock_sugar' },
  { key: 'actual_qty_osmanthus', label: '桂花味', clientKey: 'qty_osmanthus' },
  { key: 'actual_qty_red_date', label: '紅棗味', clientKey: 'qty_red_date' },
];

export const WEDDING_GIFT_BOTTLE_CAPACITIES = ['25g', '45g', '75g(高身樽)', '75g(大肚樽)'] as const;
export type WeddingGiftBottleCapacity = (typeof WEDDING_GIFT_BOTTLE_CAPACITIES)[number];

/** Map legacy stored `75g` to the renamed tall-bottle option. */
export function normalizeWeddingGiftBottleCapacity(v: string): string {
  return v === '75g' ? '75g(高身樽)' : v;
}

/** Map order bottle_capacity → kitchen-prep capacity id. */
export function mapWeddingCapacityToPrep(capacity: string): PrepCapacity | null {
  const c = normalizeWeddingGiftBottleCapacity(capacity.trim());
  if (c === '25g' || c === '45g') return c;
  if (c === '75g(高身樽)') return '75g';
  if (c === '75g(大肚樽)') return '75g_big_belly';
  return null;
}

/** Pack matrix column id for a bottle capacity. */
export function mapWeddingCapacityToPackId(capacity: string): '25' | '45' | '75' | null {
  const c = normalizeWeddingGiftBottleCapacity(capacity.trim());
  if (c === '25g') return '25';
  if (c === '45g') return '45';
  if (c === '75g(高身樽)' || c === '75g(大肚樽)') return '75';
  return null;
}

const WEDDING_FLAVOR_KEYS: { prep: PrepFlavor; actualKey: string; clientKey: string }[] = [
  { prep: 'rock_sugar', actualKey: 'actual_qty_rock_sugar', clientKey: 'qty_rock_sugar' },
  { prep: 'osmanthus', actualKey: 'actual_qty_osmanthus', clientKey: 'qty_osmanthus' },
  { prep: 'red_date', actualKey: 'actual_qty_red_date', clientKey: 'qty_red_date' },
];

function fieldNum(fields: Record<string, string | boolean>, k: string): number {
  const v = fields[k];
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function effectiveFlavorQty(
  fields: Record<string, string | boolean>,
  actualKey: string,
  clientKey: string
): number {
  const raw = fields[actualKey];
  const hasActual = raw !== undefined && String(raw).trim() !== '';
  return hasActual ? fieldNum(fields, actualKey) : fieldNum(fields, clientKey);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function qtyStr(n: number, decimals = 0): string {
  if (!Number.isFinite(n) || n === 0) return '';
  if (decimals === 0) return String(Math.round(n));
  const r = round2(n);
  return r === 0 ? '' : String(r);
}

/** Auto-calc 材料 from capacity × per-flavor actual (fallback client) qtys. */
export function computeWeddingGiftMaterials(
  fields: Record<string, string | boolean>
): Record<string, string> {
  const capacityRaw = typeof fields.bottle_capacity === 'string' ? fields.bottle_capacity : '';
  const prepCap = mapWeddingCapacityToPrep(capacityRaw);
  const empty = {
    mat_bird_cake: '',
    mat_bottle_25ml: '',
    mat_bottle_45ml: '',
    mat_osmanthus: '',
    mat_red_date: '',
    mat_rock_sugar: '',
    mat_slab_sugar: '',
  };
  if (!prepCap) return empty;

  let birdCake = 0;
  let osmanthus = 0;
  let redDate = 0;
  let rockSugar = 0;
  let slabSugar = 0;
  let totalBottles = 0;

  for (const { prep, actualKey, clientKey } of WEDDING_FLAVOR_KEYS) {
    const qty = effectiveFlavorQty(fields, actualKey, clientKey);
    if (qty <= 0) continue;
    const formula = getFlavorFormula(prepCap, prep);
    if (!formula) continue;
    totalBottles += qty;
    for (const l of getFormulaLines(formula, prep)) {
      if (isBirdNestFormulaIngredient(l.name)) birdCake += qty * l.qty;
      else if (l.name === '桂花') osmanthus += qty * l.qty;
      else if (l.name === '紅棗') redDate += qty * l.qty;
      else if (l.name === '冰糖') rockSugar += qty * l.qty;
      else if (l.name === '片糖') slabSugar += qty * l.qty;
    }
  }

  const glass25 = prepCap === '25g' ? qtyStr(totalBottles) : '';
  const glass45 = prepCap === '45g' ? qtyStr(totalBottles) : '';
  // 75g capacities: leave both glass fields blank

  return {
    mat_bird_cake: qtyStr(birdCake, 2),
    mat_bottle_25ml: glass25,
    mat_bottle_45ml: glass45,
    mat_osmanthus: qtyStr(osmanthus, 2),
    mat_red_date: qtyStr(redDate, 2),
    mat_rock_sugar: qtyStr(rockSugar, 2),
    mat_slab_sugar: qtyStr(slabSugar, 2),
  };
}

/** Auto-calc 包裝 from package amount (= total effective bottles) and selected capacity column. */
export function computeWeddingGiftPacking(
  fields: Record<string, string | boolean>
): Record<string, string> {
  const capacityRaw = typeof fields.bottle_capacity === 'string' ? fields.bottle_capacity : '';
  const packId = mapWeddingCapacityToPackId(capacityRaw);
  const out: Record<string, string> = {};

  const flavorQtys: Record<string, number> = {};
  let total = 0;
  for (const { prep, actualKey, clientKey } of WEDDING_FLAVOR_KEYS) {
    // Skip disabled red_date for capacities that disallow it
    const prepCap = mapWeddingCapacityToPrep(capacityRaw);
    if (prepCap && prep === 'red_date' && !isRedDateAllowed(prepCap)) {
      flavorQtys[prep] = 0;
      continue;
    }
    const qty = effectiveFlavorQty(fields, actualKey, clientKey);
    flavorQtys[prep] = qty;
    total += qty;
  }

  for (const flavor of WEDDING_GIFT_PACK_FLAVORS) {
    for (const cap of WEDDING_GIFT_PACK_CAPACITIES) {
      const roundKey = weddingGiftRoundTagKey(cap.id, flavor.id);
      const foilKey = weddingGiftFoilStickerKey(cap.id, flavor.id);
      if (packId && cap.id === packId) {
        out[roundKey] = qtyStr(flavorQtys[flavor.id] || 0);
        out[foilKey] = qtyStr(flavorQtys[flavor.id] || 0);
      } else {
        out[roundKey] = '';
        out[foilKey] = '';
      }
    }
  }

  const pkg = qtyStr(total);
  out.pack_gold_string = pkg;
  out.pack_wedding_logo_tag = pkg;
  out.pack_bow_qty = pkg;
  out.pack_ribbon_bag_small = pkg;
  out.pack_ribbon_bag_large = '';

  return out;
}

export const WEDDING_GIFT_ORDER_TYPE = '燕窩回禮燉製' as const;

export function isWeddingGiftOrderType(t: string): boolean {
  return t === WEDDING_GIFT_ORDER_TYPE;
}

export const WEDDING_GIFT_MATERIAL_FIELDS: { key: string; label: string; step?: string }[] = [
  { key: 'mat_bird_cake', label: '燕餅(g)' },
  { key: 'mat_bottle_25ml', label: '玻璃樽(25mL)' },
  { key: 'mat_bottle_45ml', label: '玻璃樽(45mL)' },
  { key: 'mat_osmanthus', label: '桂花(g)', step: '0.01' },
  { key: 'mat_red_date', label: '紅棗(g)', step: '0.01' },
  { key: 'mat_rock_sugar', label: '冰糖(g)', step: '0.01' },
  { key: 'mat_slab_sugar', label: '片糖(g)', step: '0.01' },
];

/** Packing matrices: capacities × flavors are independent (any combo can have a qty). */
export const WEDDING_GIFT_PACK_CAPACITIES = [
  { id: '25', label: '25g' },
  { id: '45', label: '45g' },
  { id: '75', label: '75g' },
] as const;

export const WEDDING_GIFT_PACK_FLAVORS = [
  { id: 'rock_sugar', label: '冰糖味' },
  { id: 'osmanthus', label: '桂花味' },
  { id: 'red_date', label: '紅棗味' },
] as const;

export function weddingGiftRoundTagKey(capacityId: string, flavorId: string): string {
  return `pack_round_tag_${capacityId}_${flavorId}`;
}

export function weddingGiftFoilStickerKey(capacityId: string, flavorId: string): string {
  return `pack_foil_sticker_${capacityId}_${flavorId}`;
}

export const WEDDING_GIFT_PACK_BOW_FIELDS: { key: string; label: string }[] = [
  { key: 'pack_bow_qty', label: '數量' },
  { key: 'pack_wedding_logo_tag', label: 'wedding logo tag' },
];

export const WEDDING_GIFT_PACK_BAG_FIELDS: { key: string; label: string }[] = [
  { key: 'pack_ribbon_bag_small', label: '絲帶袋(小)' },
  { key: 'pack_ribbon_bag_large', label: '絲帶袋(大)' },
  { key: 'pack_gold_string', label: '金繩' },
];

export const WEDDING_GIFT_PACK_CARTON_FIELDS: { key: string; label: string }[] = [
  { key: 'pack_carton_small', label: '紙箱(細)' },
  { key: 'pack_carton_large', label: '紙箱(大)' },
];

/** 總金額 = 單樽價格 × 客人訂購總數. */
export function computeWeddingGiftTotal(fields: Record<string, string | boolean>): number {
  const n = (k: string) => {
    const v = fields[k];
    if (typeof v === 'number') return Number.isFinite(v) ? Math.max(0, v) : 0;
    if (typeof v !== 'string' || !v.trim()) return 0;
    const num = Number(v.replace(/,/g, '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  };
  const totalOrdered = n('qty_rock_sugar') + n('qty_osmanthus') + n('qty_red_date');
  const unitPrice = n('unit_bottle_price');
  return Math.round(unitPrice * totalOrdered * 100) / 100;
}

/** Nestiee: actual production bottles per flavor (mirrors client qty fields). */
export const BIRD_NEST_ACTUAL_FLAVORS: { key: string; label: string }[] = [
  { key: 'actual_qty_rock_sugar', label: '實際生產冰糖味 (樽)' },
  { key: 'actual_qty_osmanthus', label: '實際生產桂花味 (樽)' },
  { key: 'actual_qty_red_date', label: '實際生產紅棗味 (樽)' },
];

export function computeBirdNestActualTotal(fields: Record<string, string | boolean>): number {
  const n = (k: string) => {
    const v = fields[k];
    const num = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  };
  const effective = (actualKey: string, clientKey: string) => {
    const raw = fields[actualKey];
    const hasActual = raw !== undefined && String(raw).trim() !== '';
    return hasActual ? n(actualKey) : n(clientKey);
  };
  return (
    effective('actual_qty_rock_sugar', 'qty_rock_sugar') +
    effective('actual_qty_osmanthus', 'qty_osmanthus') +
    effective('actual_qty_red_date', 'qty_red_date')
  );
}

// Grams of 燕餅 per production bottle (capacity label).
export const BIRD_CAKE_GRAMS_PER_BOTTLE = 0.8;

export interface BirdNestTotals {
  totalOrdered: number; // 客人訂總數量
  actualProductionBottles: number; // 實際生產總數量
  productionBottles: number; // used for packing formulas (= actualProductionBottles)
  birdCakeGrams: number; // 燕餅 (g)
  roundTag: number; // 圓形tag
  sticker: number; // 貼紙
  goldString: number; // 金繩
  weddingLogoTag: number; // Wedding Logo Tag
}

// Pure reactive formula: packing checklist counts from 實際生產樽數 (falls back to client qty).
export function computeBirdNestTotals(fields: Record<string, string | boolean>): BirdNestTotals {
  const n = (k: string) => {
    const v = fields[k];
    const num = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(num) ? Math.max(0, num) : 0;
  };
  const totalOrdered = n('qty_rock_sugar') + n('qty_osmanthus') + n('qty_red_date');
  const actualProductionBottles = computeBirdNestActualTotal(fields);
  const productionBottles = actualProductionBottles;
  const birdCakeGrams = Math.round(productionBottles * BIRD_CAKE_GRAMS_PER_BOTTLE * 100) / 100;
  return {
    totalOrdered,
    actualProductionBottles,
    productionBottles,
    birdCakeGrams,
    roundTag: productionBottles,
    sticker: productionBottles,
    goldString: productionBottles,
    weddingLogoTag: productionBottles,
  };
}

export function orderTitle(o: {
  reference_number?: string | null;
  po_number?: string | null;
  name?: string | null;
  description?: string | null;
}): string {
  return (
    [o.reference_number, displayOrderNumber(o.po_number), o.name, o.description].filter(Boolean).join(' - ') ||
    'Untitled order'
  );
}
