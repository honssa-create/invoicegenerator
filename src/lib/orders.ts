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
  '草稿',
  '已到公司',
  '圖稿已給客戶',
  '已搬到生產中',
  '製作中',
  '已寄出 SENT',
];

export const STATUS_COLORS: Record<string, string> = {
  '草稿': 'bg-gray-100 text-gray-700',
  '已到公司': 'bg-blue-100 text-blue-700',
  '圖稿已給客戶': 'bg-purple-100 text-purple-700',
  '已搬到生產中': 'bg-teal-100 text-teal-700',
  '製作中': 'bg-amber-100 text-amber-700',
  '已寄出 SENT': 'bg-yellow-100 text-yellow-800',
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
  { key: 'other_craft', label: '其他加工', type: 'text' },
  { key: 'carton_count', label: 'Number of Cartons / 箱數', type: 'text', col: 'carton_count', placeholder: 'e.g. 5' },
  { key: 'extra_actions', label: '額外動作', type: 'textarea' },
];

/** Honour / honour-en line items stored as JSON in fields.honour_lines. */
export interface HonourLineItem {
  style: string;
  quantity: string;
  unit_price: string;
}

export function emptyHonourLine(): HonourLineItem {
  return { style: '', quantity: '', unit_price: '' };
}

function fieldAsString(fields: Record<string, string | boolean>, key: string): string {
  const v = fields[key];
  if (typeof v === 'boolean') return v ? 'yes' : '';
  return String(v ?? '').trim();
}

/** Parse honour_lines JSON; seed one row from legacy badge_style / badge_quantity when empty. */
export function parseHonourLines(fields: Record<string, string | boolean>): HonourLineItem[] {
  const raw = fields.honour_lines;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((row) => {
          const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
          return {
            style: String(r.style ?? ''),
            quantity: String(r.quantity ?? ''),
            unit_price: String(r.unit_price ?? ''),
          };
        });
      }
    } catch {
      /* fall through to legacy seed */
    }
  }
  const style = fieldAsString(fields, 'badge_style');
  const quantity = fieldAsString(fields, 'badge_quantity');
  if (style || quantity) {
    return [{ style, quantity, unit_price: '' }];
  }
  return [emptyHonourLine()];
}

export function serializeHonourLines(lines: HonourLineItem[]): string {
  return JSON.stringify(
    lines.map((l) => ({
      style: String(l.style ?? ''),
      quantity: String(l.quantity ?? ''),
      unit_price: String(l.unit_price ?? ''),
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

/** Derived fields kept in sync for delivery-note / legacy readers. */
export function honourLinesDerivedFields(lines: HonourLineItem[]): Record<string, string> {
  const { totalQuantity } = computeHonourLineTotals(lines);
  const first = lines[0];
  return {
    honour_lines: serializeHonourLines(lines),
    badge_style: first?.style ?? '',
    badge_quantity: first?.quantity ?? (totalQuantity ? String(totalQuantity) : ''),
    qty_ordered: totalQuantity ? String(totalQuantity) : '',
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
}

export interface LinkedQuotation {
  id: number;
  quote_number: string;
  status: string;
}

export interface Order extends CoreColumns {
  id: number;
  user_id: number;
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

/** Badge-style custom orders (honour訂製 / honour en訂製) share the curated Order Detail form. */
export const BADGE_ORDER_TYPES = ['honour訂製', 'honour en訂製'] as const;
export type BadgeOrderType = (typeof BADGE_ORDER_TYPES)[number];
export function isBadgeOrderType(t: string): t is BadgeOrderType {
  return (BADGE_ORDER_TYPES as readonly string[]).includes(t);
}

/** Bird's-nest stewing orders share dates, flavor qty, and production formulas. */
export const BIRD_NEST_ORDER_TYPES = ['燕窩回禮燉製', 'Nestiee 燕窩訂單'] as const;
export type BirdNestOrderType = (typeof BIRD_NEST_ORDER_TYPES)[number];
export function isBirdNestOrderType(t: string): t is BirdNestOrderType {
  return (BIRD_NEST_ORDER_TYPES as readonly string[]).includes(t);
}

/** Default order_type when ingesting from a WooCommerce store platform. */
export const WOO_PLATFORM_ORDER_TYPE: Partial<Record<'nestiee' | 'honour' | 'cupmoka', OrderType>> = {
  honour: 'honour訂製',
  nestiee: 'Nestiee 燕窩訂單',
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
  if (/現金|cash/.test(lower)) return { method: '現金', note: '' };
  return { method: ORDER_PAYMENT_METHOD_OTHER, note: text };
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
    return Number.isFinite(num) ? num : 0;
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
    return Number.isFinite(num) ? num : 0;
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
  po_number?: string | null;
  name?: string | null;
  description?: string | null;
}): string {
  return [o.po_number, o.name, o.description].filter(Boolean).join(' - ') || 'Untitled order';
}
