/** Client-safe Nestiee production demand rollup for processing orders. */

import { expandGiftBoxBom, finishedSku, GIFT_BOX_BOMS, type BomLine } from './kitchen-bom';
import {
  hydrateNestieeGiftBoxQtys,
  isNestieeOrderType,
  localDateYmd,
  orderDueDate,
  orderTypeFromFields,
} from './orders';
import { addCalendarDays } from './wedding-gift-confirmation';

export const NESTIEE_PROCESSING_STATUS = 'processing' as const;
export const NESTIEE_SHIPPED_STATUSES = ['shipped', 'completed'] as const;

export type NestieeDemandScope = 'processing' | 'shipped' | 'all' | 'ship_today';

export const NESTIEE_DEMAND_SCOPES: readonly NestieeDemandScope[] = [
  'processing',
  'shipped',
  'all',
  'ship_today',
] as const;

/** Inclusive delivery-date window: today through today + N calendar days. */
export const NESTIEE_SHIP_TODAY_DAYS = 4;

/** Status-summary card: processing orders due to ship within this many calendar days (inclusive). */
export const NESTIEE_STATUS_SHIP_WITHIN_DAYS = 3;

export function parseNestieeDemandScope(raw: string | null | undefined): NestieeDemandScope {
  const v = String(raw || '').trim();
  if (v === 'shipped' || v === 'all' || v === 'ship_today') return v;
  return 'processing';
}

export function isNestieeShipTodayScope(scope: NestieeDemandScope): boolean {
  return scope === 'ship_today';
}

/** Statuses included in the Nestiee production dashboard for a given scope. */
export function nestieeStatusesForDemandScope(scope: NestieeDemandScope): readonly string[] {
  if (scope === 'processing' || scope === 'ship_today') return [NESTIEE_PROCESSING_STATUS];
  if (scope === 'shipped') return NESTIEE_SHIPPED_STATUSES;
  return [NESTIEE_PROCESSING_STATUS, ...NESTIEE_SHIPPED_STATUSES];
}

export function orderMatchesNestieeDemandScope(
  status: string | null | undefined,
  scope: NestieeDemandScope,
): boolean {
  const s = String(status || '').trim();
  return nestieeStatusesForDemandScope(scope).includes(s);
}

export type NestieeDateFilterType = 'order_date' | 'delivery_date';

export const NESTIEE_DATE_FILTER_TYPES: readonly NestieeDateFilterType[] = [
  'order_date',
  'delivery_date',
] as const;

export function parseNestieeDateFilterType(raw: string | null | undefined): NestieeDateFilterType {
  return String(raw || '').trim() === 'delivery_date' ? 'delivery_date' : 'order_date';
}

export function orderMatchesNestieeDateRange(
  order: { created_at?: string | null; fields?: Record<string, unknown> },
  opts: {
    dateStart?: string;
    dateEnd?: string;
    dateFilterType?: NestieeDateFilterType;
  } = {},
): boolean {
  const dateStart = opts.dateStart || '';
  const dateEnd = opts.dateEnd || '';
  if (!dateStart && !dateEnd) return true;

  const dateFilterType = parseNestieeDateFilterType(opts.dateFilterType);
  if (dateFilterType === 'delivery_date') {
    const day = orderDueDate(order);
    if (!day) return false;
    if (dateStart && day < dateStart) return false;
    if (dateEnd && day > dateEnd) return false;
    return true;
  }

  // Match orders list FilterBar: empty created_at is kept.
  const created = String(order.created_at || '').slice(0, 10);
  if (!created) return true;
  if (dateStart && created < dateStart) return false;
  if (dateEnd && created > dateEnd) return false;
  return true;
}

export function nestieeShipTodayDateRange(today: string = localDateYmd()): {
  dateStart: string;
  dateEnd: string;
} {
  return {
    dateStart: today,
    dateEnd: addCalendarDays(today, NESTIEE_SHIP_TODAY_DAYS),
  };
}

/** Unshipped (processing) Nestiee orders with delivery date from today through today+4. */
export function orderMatchesNestieeShipToday(
  order: { status?: string | null; fields?: Record<string, unknown> },
  today: string = localDateYmd(),
): boolean {
  if (!orderMatchesNestieeDemandScope(order.status, 'ship_today')) return false;
  const { dateStart, dateEnd } = nestieeShipTodayDateRange(today);
  return orderMatchesNestieeDateRange(order, {
    dateStart,
    dateEnd,
    dateFilterType: 'delivery_date',
  });
}

/** Delivery window for the status-summary 「三日內要出貨」 card (today inclusive). */
export function nestieeShipWithinDaysDateRange(
  today: string = localDateYmd(),
  withinDays: number = NESTIEE_STATUS_SHIP_WITHIN_DAYS,
): { dateStart: string; dateEnd: string } {
  const days = Math.max(1, Math.floor(withinDays));
  return {
    dateStart: today,
    dateEnd: addCalendarDays(today, days - 1),
  };
}

/** Processing Nestiee orders with 送貨日期 from today through today+(withinDays-1). */
export function orderMatchesNestieeShipWithinDays(
  order: {
    status?: string | null;
    fields?: Record<string, unknown>;
    created_at?: string | null;
  },
  today: string = localDateYmd(),
  withinDays: number = NESTIEE_STATUS_SHIP_WITHIN_DAYS,
): boolean {
  if (!orderMatchesNestieeDemandScope(order.status, 'processing')) return false;
  const { dateStart, dateEnd } = nestieeShipWithinDaysDateRange(today, withinDays);
  return orderMatchesNestieeDateRange(order, {
    dateStart,
    dateEnd,
    dateFilterType: 'delivery_date',
  });
}

export interface NestieeGiftBoxDemandType {
  id: string;
  label: string;
  qtyKey: string;
  sortOrder?: number;
  active?: boolean;
}

export interface NestieeDemandGiftBox {
  id: string;
  label: string;
  qty: number;
}

export interface NestieeDemandBottle {
  sku: string;
  label: string;
  qty: number;
}

export type NestieeShippingBoxId = 'small' | 'single' | 'double' | 'triple';

export interface NestieeDemandShippingBox {
  id: NestieeShippingBoxId;
  label: string;
  size: string;
  qty: number;
}

export interface NestieeProcessingDemand {
  giftBoxes: NestieeDemandGiftBox[];
  bottles: NestieeDemandBottle[];
  shippingBoxes: NestieeDemandShippingBox[];
  orderCount: number;
  scope: NestieeDemandScope;
}

/** Logistics outer boxes (外箱) for Nestiee shipments. */
export const NESTIEE_SHIPPING_BOX_SLOTS: NestieeDemandShippingBox[] = [
  { id: 'small', label: '細箱', size: '24x15x13cm', qty: 0 },
  { id: 'single', label: '單套', size: '25x25x12.5cm', qty: 0 },
  { id: 'double', label: '雙套', size: '25x25x25cm', qty: 0 },
  { id: 'triple', label: '三套', size: '25x25x35cm', qty: 0 },
];

export function shippingBoxDisplayLabel(box: Pick<NestieeDemandShippingBox, 'label' | 'size'>): string {
  return `${box.label}(${box.size})`;
}

/** Per-order gift count fed into shipping-box mapping (minimum 1 outer box per order). */
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
      return { small: 0, single: 1, double: 0, triple: 0 };
    case 2:
      return { small: 0, single: 1, double: 0, triple: 0 };
    case 3:
      return { small: 0, single: 0, double: 1, triple: 0 };
    case 4:
      return { small: 0, single: 0, double: 0, triple: 1 };
    case 5:
      return { small: 0, single: 1, double: 1, triple: 0 };
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

export function totalGiftBoxesInOrder(
  fields: Record<string, unknown>,
  activeTypes: Array<{ qtyKey: string }>,
): number {
  let total = 0;
  for (const g of activeTypes) {
    total += fieldQty(fields, g.qtyKey);
  }
  return total;
}

/** Finished-bottle cards shown on the Nestiee orders dashboard. */
export const NESTIEE_BOTTLE_DASHBOARD_SLOTS: NestieeDemandBottle[] = [
  { sku: finishedSku('75g', 'rock_sugar'), label: '冰糖 (75g高身)', qty: 0 },
  { sku: finishedSku('75g', 'osmanthus'), label: '桂花 (75g高身)', qty: 0 },
  { sku: finishedSku('75g', 'red_date'), label: '紅棗 (75g高身)', qty: 0 },
  { sku: finishedSku('45g', 'rock_sugar'), label: '冰糖 (45g)', qty: 0 },
  { sku: finishedSku('45g', 'osmanthus'), label: '桂花 (45g)', qty: 0 },
  { sku: finishedSku('45g', 'red_date'), label: '紅棗 (45g)', qty: 0 },
];

function fieldQty(fields: Record<string, unknown>, key: string): number {
  const v = fields[key];
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export function isNestieeOrdersFilter(filter: string): boolean {
  if (!filter) return false;
  return filter === 'nestiee' || isNestieeOrderType(filter);
}

export function summarizeNestieeProcessingDemand(
  orders: Array<{ status?: string; fields?: Record<string, unknown>; created_at?: string | null }>,
  giftBoxTypes: NestieeGiftBoxDemandType[],
  giftBoxBoms: Record<string, BomLine[]> = {},
  scope: NestieeDemandScope = 'processing',
  opts?: { today?: string },
): NestieeProcessingDemand {
  const boms = { ...GIFT_BOX_BOMS, ...giftBoxBoms };
  const activeTypes = [...giftBoxTypes]
    .filter((g) => g.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const giftTotals = new Map<string, number>();
  for (const g of activeTypes) giftTotals.set(g.id, 0);

  const bottleTotals = new Map<string, number>();
  for (const slot of NESTIEE_BOTTLE_DASHBOARD_SLOTS) bottleTotals.set(slot.sku, 0);

  const shippingTotals = new Map<NestieeShippingBoxId, number>();
  for (const slot of NESTIEE_SHIPPING_BOX_SLOTS) shippingTotals.set(slot.id, 0);

  let orderCount = 0;

  for (const order of orders) {
    const orderType = orderTypeFromFields(order.fields);
    if (!orderType || !isNestieeOrderType(orderType)) continue;
    if (scope === 'ship_today') {
      if (!orderMatchesNestieeShipToday(order, opts?.today)) continue;
    } else if (!orderMatchesNestieeDemandScope(order.status, scope)) {
      continue;
    }
    orderCount += 1;

    const fields = hydrateNestieeGiftBoxQtys({ ...(order.fields || {}) });
    for (const g of activeTypes) {
      const boxQty = fieldQty(fields, g.qtyKey);
      if (boxQty <= 0) continue;
      giftTotals.set(g.id, (giftTotals.get(g.id) || 0) + boxQty);

      for (const line of expandGiftBoxBom(g.id, boxQty, boms)) {
        if (line.kind !== 'finished') continue;
        if (!bottleTotals.has(line.sku)) continue;
        bottleTotals.set(line.sku, (bottleTotals.get(line.sku) || 0) + line.qty);
      }
    }

    const orderGiftTotal = totalGiftBoxesInOrder(fields, activeTypes);
    const shipping = mapShippingBoxesForGiftCount(giftCountForOrderShippingBoxes(orderGiftTotal));
    for (const id of Object.keys(shipping) as NestieeShippingBoxId[]) {
      shippingTotals.set(id, (shippingTotals.get(id) || 0) + shipping[id]);
    }
  }

  return {
    giftBoxes: activeTypes.map((g) => ({
      id: g.id,
      label: g.label,
      qty: giftTotals.get(g.id) || 0,
    })),
    bottles: NESTIEE_BOTTLE_DASHBOARD_SLOTS.map((slot) => ({
      sku: slot.sku,
      label: slot.label,
      qty: bottleTotals.get(slot.sku) || 0,
    })),
    shippingBoxes: NESTIEE_SHIPPING_BOX_SLOTS.map((slot) => ({
      id: slot.id,
      label: slot.label,
      size: slot.size,
      qty: shippingTotals.get(slot.id) || 0,
    })),
    orderCount,
    scope,
  };
}

export interface NestieeOrderStatusCounts {
  processing: number;
  completed: number;
  /** Processing orders with 送貨日期 within {@link NESTIEE_STATUS_SHIP_WITHIN_DAYS} calendar days. */
  shipWithinDays: number;
}

/** Nestiee order counts by status for the orders dashboard summary block. */
export function summarizeNestieeOrderStatusCounts(
  orders: Array<{
    status?: string;
    fields?: Record<string, unknown>;
    created_at?: string | null;
    updated_at?: string | null;
  }>,
  opts: {
    dateStart?: string;
    dateEnd?: string;
    dateFilterType?: NestieeDateFilterType;
    today?: string;
  } = {},
): NestieeOrderStatusCounts {
  const counts: NestieeOrderStatusCounts = { processing: 0, completed: 0, shipWithinDays: 0 };
  const today = opts.today || localDateYmd();

  for (const order of orders) {
    const orderType = orderTypeFromFields(order.fields);
    if (!orderType || !isNestieeOrderType(orderType)) continue;

    if (orderMatchesNestieeShipWithinDays(order, today)) {
      counts.shipWithinDays += 1;
    }

    if (!orderMatchesNestieeDateRange(order, opts)) continue;

    const status = String(order.status || '').trim();
    if (status === NESTIEE_PROCESSING_STATUS) {
      counts.processing += 1;
    } else if (NESTIEE_SHIPPED_STATUSES.includes(status as (typeof NESTIEE_SHIPPED_STATUSES)[number])) {
      counts.completed += 1;
    }
  }

  return counts;
}

export interface NestieeUsedShippingBoxesSummary {
  shippingBoxes: NestieeDemandShippingBox[];
  orderCount: number;
  dateStart: string;
  dateEnd: string;
  dateFilterType: NestieeDateFilterType;
}

/**
 * Shipped/completed Nestiee orders only — estimated outer boxes used in a date range.
 * Used by Kitchen 「已用物流箱統計 (燕窩訂單)」.
 */
export function summarizeNestieeUsedShippingBoxes(
  orders: Array<{ status?: string; fields?: Record<string, unknown>; created_at?: string | null }>,
  giftBoxTypes: Array<{ qtyKey: string; active?: boolean }>,
  opts: {
    dateStart?: string;
    dateEnd?: string;
    dateFilterType?: NestieeDateFilterType;
  } = {},
): NestieeUsedShippingBoxesSummary {
  const dateStart = opts.dateStart || '';
  const dateEnd = opts.dateEnd || '';
  const dateFilterType = parseNestieeDateFilterType(opts.dateFilterType);

  const activeTypes = giftBoxTypes.filter((g) => g.active !== false);
  const shippingTotals = new Map<NestieeShippingBoxId, number>();
  for (const slot of NESTIEE_SHIPPING_BOX_SLOTS) shippingTotals.set(slot.id, 0);

  let orderCount = 0;

  for (const order of orders) {
    const orderType = orderTypeFromFields(order.fields);
    if (!orderType || !isNestieeOrderType(orderType)) continue;
    if (!orderMatchesNestieeDemandScope(order.status, 'shipped')) continue;
    if (
      !orderMatchesNestieeDateRange(order, {
        dateStart,
        dateEnd,
        dateFilterType,
      })
    ) {
      continue;
    }

    orderCount += 1;
    const fields = hydrateNestieeGiftBoxQtys({ ...(order.fields || {}) });
    const orderGiftTotal = totalGiftBoxesInOrder(fields, activeTypes);
    const shipping = mapShippingBoxesForGiftCount(giftCountForOrderShippingBoxes(orderGiftTotal));
    for (const id of Object.keys(shipping) as NestieeShippingBoxId[]) {
      shippingTotals.set(id, (shippingTotals.get(id) || 0) + shipping[id]);
    }
  }

  return {
    shippingBoxes: NESTIEE_SHIPPING_BOX_SLOTS.map((slot) => ({
      id: slot.id,
      label: slot.label,
      size: slot.size,
      qty: shippingTotals.get(slot.id) || 0,
    })),
    orderCount,
    dateStart,
    dateEnd,
    dateFilterType,
  };
}
