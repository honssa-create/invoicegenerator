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
  po_number?: string | null;
  name?: string | null;
  description?: string | null;
}): string {
  return [o.po_number, o.name, o.description].filter(Boolean).join(' - ') || 'Untitled order';
}
