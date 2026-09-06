/** Client-safe types and helpers for 備貨預測 (Demand Forecast). */

export type DemandForecastDateFilterType = 'order_date' | 'delivery_date';

export const DEMAND_FORECAST_DATE_FILTER_TYPES: readonly DemandForecastDateFilterType[] = [
  'order_date',
  'delivery_date',
] as const;

export const DEMAND_FORECAST_DATE_FILTER_LABELS: Record<
  DemandForecastDateFilterType,
  { en: string; zh: string }
> = {
  order_date: { en: 'By order date', zh: '落下單日期' },
  delivery_date: { en: 'By delivery date', zh: '按送貨日期' },
};

export function parseDemandForecastDateFilterType(
  raw: string | null | undefined,
): DemandForecastDateFilterType {
  return String(raw || '').trim() === 'delivery_date' ? 'delivery_date' : 'order_date';
}

export function localDateYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthStartYmd(today = localDateYmd()): string {
  return `${today.slice(0, 8)}01`;
}

export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateYmd(dt);
}

export const NESTIEE_ORDER_TYPE = 'Nestiee 燕窩訂單';
export const NESTIEE_PROCESSING_STATUS = 'processing';
export const NESTIEE_SHIPPED_STATUSES = ['shipped', 'completed'] as const;

export function isNestieeOrderType(orderType: string | null | undefined): boolean {
  const t = String(orderType || '').trim();
  return t === NESTIEE_ORDER_TYPE || t.includes('Nestiee') || t.includes('燕窩訂單');
}

export function orderTypeFromFields(fields: Record<string, unknown> | undefined): string {
  if (!fields) return '';
  const v = fields.order_type;
  return typeof v === 'string' ? v.trim() : '';
}

export function orderDueDate(order: {
  delivery_date?: string | null;
  fields?: Record<string, unknown>;
}): string {
  if (order.delivery_date) return String(order.delivery_date).slice(0, 10);
  const fields = order.fields || {};
  for (const key of ['client_delivery_date', 'due_date', '客人收貨日期']) {
    const v = fields[key];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return '';
}

export function orderMatchesDateRange(
  order: { created_at?: string | null; delivery_date?: string | null; fields?: Record<string, unknown> },
  opts: {
    dateStart?: string;
    dateEnd?: string;
    dateFilterType?: DemandForecastDateFilterType;
  } = {},
): boolean {
  const dateStart = opts.dateStart || '';
  const dateEnd = opts.dateEnd || '';
  if (!dateStart && !dateEnd) return true;

  const dateFilterType = parseDemandForecastDateFilterType(opts.dateFilterType);
  if (dateFilterType === 'delivery_date') {
    const day = orderDueDate(order);
    if (!day) return false;
    if (dateStart && day < dateStart) return false;
    if (dateEnd && day > dateEnd) return false;
    return true;
  }

  const created = String(order.created_at || '').slice(0, 10);
  if (!created) return true;
  if (dateStart && created < dateStart) return false;
  if (dateEnd && created > dateEnd) return false;
  return true;
}

/** 75g finished-bottle products for the production schedule block. */
export interface ProductionScheduleProduct {
  id: string;
  label: string;
  sku: string;
}

export const PRODUCTION_SCHEDULE_75G_PRODUCTS: ProductionScheduleProduct[] = [
  { id: 'rock_sugar', label: '冰糖 (75g高身)', sku: '75g|rock_sugar' },
  { id: 'osmanthus', label: '桂花 (75g高身)', sku: '75g|osmanthus' },
  { id: 'red_date', label: '紅棗 (75g高身)', sku: '75g|red_date' },
];

export interface ProductionScheduleRow {
  product: string;
  productId: string;
  stock: number;
  demand: number;
  shortfall: number;
  daysNeeded: number | null;
  estimatedDate: string | null;
}

export type NestieeShippingBoxId = 'small' | 'single' | 'double' | 'triple';

export interface NestieeShippingBoxSlot {
  id: NestieeShippingBoxId;
  label: string;
  size: string;
}

export const NESTIEE_SHIPPING_BOX_SLOTS: NestieeShippingBoxSlot[] = [
  { id: 'small', label: '細箱', size: '24x15x13cm' },
  { id: 'single', label: '單套', size: '25x25x12.5cm' },
  { id: 'double', label: '雙套', size: '25x25x25cm' },
  { id: 'triple', label: '三套', size: '25x25x35cm' },
];

export function shippingBoxDisplayLabel(box: Pick<NestieeShippingBoxSlot, 'label' | 'size'>): string {
  return `${box.label}(${box.size})`;
}

export const NESTIEE_GIFT_BOX_QTY_KEYS = [
  'nestiee_gift_qty_star_gold',
  'nestiee_gift_qty_star_silver',
  'nestiee_gift_qty_red_gold',
  'nestiee_gift_qty_red_silver',
  'nestiee_gift_qty_pink_osmanthus',
  'nestiee_gift_qty_pink_red_date',
  'nestiee_gift_qty_sui_xin_7',
  'nestiee_gift_qty_sui_xin_14',
  'nestiee_gift_qty_sui_xin_18',
  'nestiee_gift_qty_qiu_yan_fei_yue',
  'nestiee_gift_qty_rou_run_share_box',
  'nestiee_gift_qty_trial_set',
  'nestiee_gift_qty_hua_yue',
] as const;

function fieldQty(fields: Record<string, unknown>, key: string): number {
  const v = fields[key];
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export function totalGiftBoxesInOrder(fields: Record<string, unknown>): number {
  let total = 0;
  for (const key of NESTIEE_GIFT_BOX_QTY_KEYS) {
    total += fieldQty(fields, key);
  }
  return total;
}

export function giftCountForOrderShippingBoxes(totalGiftBoxes: number): number {
  const count = Math.max(0, Math.floor(totalGiftBoxes));
  return count > 0 ? count : 1;
}

/** Map total gift boxes in one order → required shipping outer boxes (1–10). */
export function mapShippingBoxesForGiftCount(totalGiftBoxes: number): Record<NestieeShippingBoxId, number> {
  const empty = (): Record<NestieeShippingBoxId, number> => ({
    small: 0,
    single: 0,
    double: 0,
    triple: 0,
  });

  const count = Math.max(0, Math.floor(totalGiftBoxes));
  if (count === 0) return empty();

  if (count > 10) {
    const tens = Math.floor(count / 10);
    const remainder = count % 10;
    const result = empty();
    const add = (partial: Record<NestieeShippingBoxId, number>, multiplier = 1) => {
      for (const id of Object.keys(partial) as NestieeShippingBoxId[]) {
        result[id] += partial[id] * multiplier;
      }
    };
    add(mapShippingBoxesForGiftCount(10), tens);
    if (remainder > 0) add(mapShippingBoxesForGiftCount(remainder));
    return result;
  }

  switch (count) {
    case 1:
      return { small: 1, single: 0, double: 0, triple: 0 };
    case 2:
      return { small: 0, single: 1, double: 0, triple: 0 };
    case 3:
      return { small: 0, single: 0, double: 1, triple: 0 };
    case 4:
      return { small: 0, single: 0, double: 0, triple: 1 };
    case 5:
      return { small: 1, single: 0, double: 1, triple: 0 };
    case 6:
      return { small: 0, single: 1, double: 1, triple: 0 };
    case 7:
    case 8:
      return { small: 0, single: 0, double: 2, triple: 0 };
    case 9:
    case 10:
      return { small: 0, single: 0, double: 1, triple: 1 };
    default:
      return empty();
  }
}

export interface ShippingBoxForecastRow {
  id: NestieeShippingBoxId;
  label: string;
  stock: number;
  need: number;
  used: number;
}

export interface ShippingBoxesForecastData {
  rows: ShippingBoxForecastRow[];
  orderCountUsed: number;
  orderCountNeed: number;
}

/** Default daily 75g bottle production capacity for schedule estimates. */
export const DEFAULT_DAILY_75G_CAPACITY = 40;
