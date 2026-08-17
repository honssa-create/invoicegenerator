import {
  getFlavorFormula,
  isRedDateAllowed,
  type PrepCapacity,
  type PrepFlavor,
} from '@/lib/kitchen-prep';

export type OrderFieldType = 'text' | 'textarea' | 'date' | 'checkbox' | 'select';

export interface OrderFieldDef {
  key: string;
  label: string;
  type: OrderFieldType;
  /** If set, this field is stored in a first-class column instead of fields_json. */
  col?: keyof CoreColumns;
  options?: string[];
  placeholder?: string;
}

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

/** Ecommerce statuses for Nestiee + 燕窩回禮燉製. */
export const ECOM_ORDER_STATUSES = [
  'checkout-draft',
  'pending payment',
  'processing',
  'shipped',
  'completed',
] as const;

export type EcomOrderStatus = (typeof ECOM_ORDER_STATUSES)[number];

export function usesEcomOrderStatuses(orderType: string): boolean {
  return isNestieeOrderType(orderType) || isWeddingGiftOrderType(orderType);
}

/** Status options for the given order type (manufacturing vs ecommerce). */
export function statusesForOrderType(orderType: string): readonly string[] {
  return usesEcomOrderStatuses(orderType) ? ECOM_ORDER_STATUSES : ORDER_STATUSES;
}

/**
 * Calendar date for an order: property-bar `due_date`, falling back to
 * shipment `client_delivery_date` (客人收貨日期) — the two stay linked in the UI.
 * Returns YYYY-MM-DD when parseable.
 */
export function orderDueDate(o: {
  delivery_date?: string | null;
  fields?: Record<string, unknown>;
}): string | null {
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
};

// The full custom-field list shown in the order detail "Fields" panel, in order.
export const ORDER_FIELDS: OrderFieldDef[] = [
  { key: 'email', label: 'E-mail', type: 'text', col: 'customer_email', placeholder: 'name@email.com' },
  { key: 'shipping', label: 'Shipping Address (最後寄出地址)', type: 'textarea', col: 'shipping_address' },
  { key: 'phone', label: '電話', type: 'text', col: 'phone', placeholder: '+852…' },
  { key: 'po', label: 'PO#', type: 'text', col: 'po_number' },
  { key: 'qty_ordered', label: '客人下單數量 Quantity', type: 'text', placeholder: 'e.g. 4款各53個' },
  { key: 'name', label: 'Name', type: 'text', col: 'name' },
  { key: 'pack_required', label: '客戶要求交貨包裝', type: 'text', placeholder: 'e.g. OPP 獨立包裝' },
  { key: 'supplier_qty', label: '供應商生產數量', type: 'text' },
  { key: 'supplier_price', label: '供應商單價', type: 'text', placeholder: 'e.g. rmb 4.2' },
  { key: 'invoice_receipt', label: '發票及收據', type: 'text', placeholder: 'e.g. 1 Invoice, 1 Receipt' },
  { key: 'quotation_no', label: 'Quotation No. #', type: 'text' },
  { key: 'supplier_received_qty', label: '供應商到貨數量(及次數)', type: 'text' },
  { key: 'mould_print_fee', label: '供應商-模費/印刷費', type: 'text' },
  { key: 'supplier_ship_date', label: '供應商寄出日期', type: 'text', placeholder: 'e.g. 15/1/26' },
  { key: 'product_type', label: '產品/樣品', type: 'select', options: ['大貨產品', '樣品', '打樣'] },
  { key: 'plating_color', label: '電鍍色', type: 'text' },
  { key: 'clasp', label: '背扣', type: 'text', placeholder: 'e.g. 四節圓圈' },
  { key: 'craft', label: '加工工藝', type: 'text', placeholder: 'e.g. 亞加力-單面' },
  { key: 'supplier', label: '供應商', type: 'text', placeholder: 'e.g. 亞加力-和夫' },
  { key: 'supplier_pack', label: '供應商出貨包裝', type: 'text', placeholder: 'e.g. OPP獨立包裝' },
  { key: 'payment_option', label: '下單時付款選項', type: 'text', placeholder: 'e.g. yedpay' },
  { key: 'internal_pack', label: '內部包裝處理', type: 'text', placeholder: 'e.g. 不需要' },
  { key: 'all_products_check', label: '有關此訂單的，所有產品…', type: 'checkbox' },
  { key: 'invoice_before_ship', label: '出貨前要開Invoice', type: 'text' },
  { key: 'invoice_no', label: 'Invoice #', type: 'text', placeholder: 'e.g. 10013205' },
  { key: 'payment_terms', label: '款項', type: 'select', options: ['100% Payment (全數付清)', '50% 訂金', '待付款'] },
  { key: 'requested_delivery', label: '客人要求收貨日期', type: 'text', placeholder: 'e.g. 28/1/26' },
  { key: 'order_from', label: 'Order From 下單平台', type: 'text' },
  { key: 'card_size', label: '紙卡尺寸', type: 'text' },
  { key: 'tracking_no', label: 'Tracking Number 運單號', type: 'text', placeholder: 'e.g. SF5120793357800' },
  { key: 'shipping_method', label: 'Shipping 寄出方式', type: 'select', options: ['SF 順豐', '順豐', 'EMS', '香港郵政', '其他'] },
  { key: 'other_craft', label: '其他加工', type: 'textarea' },
  { key: 'carton_count', label: 'Number of Cartons / 箱數', type: 'text', col: 'carton_count', placeholder: 'e.g. 5' },
  { key: 'extra_actions', label: '額外動作', type: 'textarea' },
];

/** Synthetic Honour line style for Woo shipping fees. */
export const HONOUR_SHIPPING_LINE_STYLE = 'Shipping';

/** Honour / honour-en line items stored as JSON in fields.honour_lines. */
export interface HonourLineItem {
  style: string;
  quantity: string;
  unit_price: string;
  /** Per-line craft */
  card_size: string;
  craft: string;
  plating_color: string;
  clasp: string;
  /** Per-line packaging */
  internal_pack: string;
  pack_required: string;
  /** Unmatched CPO options for this line */
  other_options: string;
}

export function emptyHonourLine(): HonourLineItem {
  return {
    style: '',
    quantity: '',
    unit_price: '',
    card_size: '',
    craft: '',
    plating_color: '',
    clasp: '',
    internal_pack: '',
    pack_required: '',
    other_options: '',
  };
}

/** Supplier cards stored as JSON in fields.honour_suppliers. */
export interface HonourSupplierItem {
  supplier: string;
  supplier_price: string;
  mould_print_fee: string;
  supplier_qty: string;
  supplier_pack: string;
  supplier_ship_date: string;
  carton_count: string;
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
  const raw = fields.honour_lines;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const lines = parsed.map((row) => {
          const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
          return normalizeHonourLineRow(r);
        });
        return seedLegacyCraftOntoFirstProduct(lines, fields);
      }
    } catch {
      /* fall through to legacy seed */
    }
  }
  const style = fieldAsString(fields, 'badge_style');
  const quantity = fieldAsString(fields, 'badge_quantity');
  if (style || quantity) {
    return seedLegacyCraftOntoFirstProduct([{ ...emptyHonourLine(), style, quantity }], fields);
  }
  return [emptyHonourLine()];
}

export function serializeHonourLines(lines: HonourLineItem[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      style: String(l.style ?? ''),
      quantity: String(l.quantity ?? ''),
      unit_price: String(l.unit_price ?? ''),
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

/** Derived fields kept in sync for delivery-note / legacy readers. */
export function honourLinesDerivedFields(lines: HonourLineItem[]): Record<string, string> {
  const { totalQuantity } = computeHonourLineTotals(lines);
  const first = firstHonourProductLine(lines) || lines[0];
  return {
    honour_lines: serializeHonourLines(lines),
    badge_style: first?.style ?? '',
    badge_quantity: first?.quantity ?? (totalQuantity ? String(totalQuantity) : ''),
    qty_ordered: totalQuantity ? String(totalQuantity) : '',
    // Mirror first product line craft/packaging for production-note / quotation notes.
    card_size: first?.card_size ?? '',
    craft: first?.craft ?? '',
    plating_color: first?.plating_color ?? '',
    clasp: first?.clasp ?? '',
    internal_pack: first?.internal_pack ?? '',
    pack_required: first?.pack_required ?? '',
    other_craft: first?.other_options ?? '',
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
  };
}

function seedLegacySupplier(fields: Record<string, string | boolean>, cartonCountCore?: string): HonourSupplierItem {
  return {
    supplier: fieldAsString(fields, 'supplier'),
    supplier_price: fieldAsString(fields, 'supplier_price'),
    mould_print_fee: fieldAsString(fields, 'mould_print_fee'),
    supplier_qty: fieldAsString(fields, 'supplier_qty'),
    supplier_pack: fieldAsString(fields, 'supplier_pack'),
    supplier_ship_date: fieldAsString(fields, 'supplier_ship_date'),
    carton_count: fieldAsString(fields, 'carton_count') || String(cartonCountCore ?? '').trim(),
  };
}

/**
 * Parse honour_suppliers JSON. Seeds Supplier-1 from legacy flat fields when empty.
 * Pads to at least `minCount` (default: product line count) without shrinking.
 */
export function parseHonourSuppliers(
  fields: Record<string, string | boolean>,
  opts?: { minCount?: number; cartonCountCore?: string }
): HonourSupplierItem[] {
  const minCount = Math.max(1, opts?.minCount ?? 1);
  let suppliers: HonourSupplierItem[] = [];
  const raw = fields.honour_suppliers;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
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
    // Fill empty first card from legacy flats (one-time migration aid).
    const legacy = seedLegacySupplier(fields, opts?.cartonCountCore);
    if (Object.values(legacy).some(Boolean)) {
      const first = suppliers[0];
      suppliers[0] = {
        supplier: first.supplier || legacy.supplier,
        supplier_price: first.supplier_price || legacy.supplier_price,
        mould_print_fee: first.mould_print_fee || legacy.mould_print_fee,
        supplier_qty: first.supplier_qty || legacy.supplier_qty,
        supplier_pack: first.supplier_pack || legacy.supplier_pack,
        supplier_ship_date: first.supplier_ship_date || legacy.supplier_ship_date,
        carton_count: first.carton_count || legacy.carton_count,
      };
    }
  }
  return ensureHonourSupplierCount(suppliers, minCount);
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
    }))
  );
}

/** Mirror first supplier into legacy flat keys; persist honour_suppliers JSON. */
export function honourSuppliersDerivedFields(suppliers: HonourSupplierItem[]): Record<string, string> {
  const first = suppliers[0] || emptyHonourSupplier();
  return {
    honour_suppliers: serializeHonourSuppliers(suppliers),
    supplier: first.supplier,
    supplier_price: first.supplier_price,
    mould_print_fee: first.mould_print_fee,
    supplier_qty: first.supplier_qty,
    supplier_pack: first.supplier_pack,
    supplier_ship_date: first.supplier_ship_date,
  };
}

export interface OrderFile {
  id: number;
  path: string;
  original_name: string | null;
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
  { param: 'Nestiee 燕窩訂單', label: '燕窩訂單' },
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
];

/** Auto-map Woo line + EPO options → 所需禮盒 qty keys. */
const NESTIEE_STAR_BOX_NAME = '🌕⚪星空禮盒 · 即食燕窩';
const NESTIEE_STAR_SILVER_OPTION = '⚪冰糖原味【最勁典】';
const NESTIEE_STAR_GOLD_OPTION = '🌻 桂花味【花香餘韻】';

const NESTIEE_RED_BOX_NAME = '即食燕窩心意禮盒 ‧ 金銀套裝';
const NESTIEE_RED_BOX_NAME_ALT = '即食燕窩心意禮盒 · 金銀套裝';
const NESTIEE_RED_SINGLE_FLAVOR_OPTION = '⚪️ 只選單味（紅棗或冰糖）';
const NESTIEE_RED_GOLD_OPTION = '🟡 金盒｜紅棗・暖潤';
const NESTIEE_RED_SILVER_OPTION = '⚪ 銀盒｜冰糖・清潤';

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

/**
 * Derive 所需禮盒 quantities from Nestiee Woo lines.
 * - 星空禮盒 + first EPO flavour → 星空銀 / 星空金
 * - 金銀套裝 + 只選單味 + 金/銀盒 → 紅色金 / 紅色銀
 * - Dearest Moment 單盒/雙盒/兩味 → 粉紅心意 桂花 / 紅棗
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
  };
  const starName = normalizeNestieeMatchText(NESTIEE_STAR_BOX_NAME);
  const silverOpt = normalizeNestieeMatchText(NESTIEE_STAR_SILVER_OPTION);
  const goldOpt = normalizeNestieeMatchText(NESTIEE_STAR_GOLD_OPTION);
  const redNames = new Set([
    normalizeNestieeMatchText(NESTIEE_RED_BOX_NAME),
    normalizeNestieeMatchText(NESTIEE_RED_BOX_NAME_ALT),
  ]);
  const redSingle = normalizeNestieeMatchText(NESTIEE_RED_SINGLE_FLAVOR_OPTION);
  const redGoldOpt = normalizeNestieeMatchText(NESTIEE_RED_GOLD_OPTION);
  const redSilverOpt = normalizeNestieeMatchText(NESTIEE_RED_SILVER_OPTION);
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
    const qty = Math.max(0, line.quantity || 0);
    if (!qty) continue;
    const firstOpt = normalizeNestieeMatchText(line.options?.[0]?.value || '');
    const secondOpt = normalizeNestieeMatchText(line.options?.[1]?.value || '');

    if (name === starName) {
      if (firstOpt === silverOpt) qtys.nestiee_gift_qty_star_silver += qty;
      else if (firstOpt === goldOpt) qtys.nestiee_gift_qty_star_gold += qty;
      continue;
    }

    if (redNames.has(name) && firstOpt === redSingle) {
      if (secondOpt === redGoldOpt) qtys.nestiee_gift_qty_red_gold += qty;
      else if (secondOpt === redSilverOpt) qtys.nestiee_gift_qty_red_silver += qty;
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
};

function nestieeNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string' || !value.trim()) return 0;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Strip simple HTML tags from TM EPO labels. */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Join non-empty Woo address parts into a multiline string. */
export function formatWooAddress(addr: WooAddressLike | null | undefined): string {
  if (!addr) return '';
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim();
  const lines = [
    name,
    String(addr.company || '').trim(),
    String(addr.address_1 || '').trim(),
    String(addr.address_2 || '').trim(),
    [addr.city, addr.state, addr.postcode].filter(Boolean).join(', ').trim(),
    String(addr.country || '').trim(),
    addr.phone ? `Tel: ${String(addr.phone).trim()}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function parseNestieeOptionsFromMeta(meta: WooMetaDatum[] | null | undefined): NestieeLineOption[] {
  if (!Array.isArray(meta)) return [];
  const epo = meta.find((m) => m?.key === '_tmcartepo_data');
  const raw = epo?.value;
  if (!Array.isArray(raw)) return [];
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
  return out;
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
    const rawTotal = nestieeNum(li.total);
    const line_total =
      Math.round((rawTotal > 0 ? rawTotal : unit_price * quantity) * 100) / 100;
    const options = parseNestieeOptionsFromMeta(li.meta_data);
    const row: NestieeLineItem = { name, quantity, unit_price, line_total };
    if (options.length) row.options = options;
    out.push(row);
  }
  return out;
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
    const rawTotal = nestieeNum(r.line_total ?? r.total);
    const line_total =
      Math.round((rawTotal > 0 ? rawTotal : unit_price * quantity) * 100) / 100;
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
export const WOO_PLATFORM_ORDER_TYPE: Partial<Record<'nestiee' | 'honour' | 'cupmoka', OrderType>> = {
  honour: 'honour訂製',
  nestiee: NESTIEE_ORDER_TYPE,
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

const ORDER_SHIPPING_METHODS = ['SF 順豐', '順豐', 'EMS', '香港郵政', '其他'] as const;

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
  return next;
}

/**
 * Legacy flat-field mapper (order-level). Prefers applying into first empty craft keys.
 * Kept for tests / older call sites; Hub ingest uses per-line mapping instead.
 */
export function applyHonourOptionsToFields(
  fields: Record<string, unknown>,
  options: HonourCpoOption[],
  metaForSize?: WooMetaDatum[] | null
): string[] {
  const written: string[] = [];
  const setIfEmpty = (key: string, value: string) => {
    if (!value.trim()) return;
    if (String(fields[key] ?? '').trim()) return;
    fields[key] = value.trim();
    written.push(key);
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
  if (otherLines.length) setIfEmpty('other_craft', otherLines.join('\n'));
  return written;
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

/** Build requested_delivery from pi_overall_estimate_min/max_date. */
export function parseHonourEstimateDelivery(
  payload: Record<string, unknown> | null | undefined
): string {
  if (!payload) return '';
  const meta = Array.isArray(payload.meta_data) ? (payload.meta_data as WooMetaDatum[]) : [];
  const min = String(
    meta.find((m) => String(m?.key || '') === 'pi_overall_estimate_min_date')?.value ?? ''
  ).trim();
  const max = String(
    meta.find((m) => String(m?.key || '') === 'pi_overall_estimate_max_date')?.value ?? ''
  ).trim();
  if (min && max && min !== max) return `${min} - ${max}`;
  return min || max || '';
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
  if (paidTotal <= 0.009) return 'Unpaid';
  if (dueTotal != null && Number.isFinite(dueTotal) && dueTotal > 0 && paidTotal >= dueTotal - 0.01) {
    return 'Full Paid';
  }
  return '部分付款 Partly Paid';
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
    birdCake += qty * formula.birdNest;
    rockSugar += qty * formula.rockSugar;
    slabSugar += qty * formula.slabSugar;
    if (prep === 'osmanthus') osmanthus += qty * formula.flavorIngredient;
    if (prep === 'red_date') redDate += qty * formula.flavorIngredient;
    // rock_sugar flavor ingredient is ice sugar — counted via rockSugar column
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
  return [o.reference_number, o.po_number, o.name, o.description].filter(Boolean).join(' - ') || 'Untitled order';
}
