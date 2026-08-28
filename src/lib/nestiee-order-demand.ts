/** Client-safe Nestiee production demand rollup for processing orders. */

import { expandGiftBoxBom, finishedSku, GIFT_BOX_BOMS, type BomLine } from './kitchen-bom';
import { isNestieeOrderType, orderDueDate, orderTypeFromFields } from './orders';

export const NESTIEE_PROCESSING_STATUS = 'processing' as const;
export const NESTIEE_SHIPPED_STATUSES = ['shipped', 'completed'] as const;

export type NestieeDemandScope = 'processing' | 'shipped' | 'all';

export const NESTIEE_DEMAND_SCOPES: readonly NestieeDemandScope[] = [
  'processing',
  'shipped',
  'all',
] as const;

export function parseNestieeDemandScope(raw: string | null | undefined): NestieeDemandScope {
  const v = String(raw || '').trim();
  if (v === 'shipped' || v === 'all') return v;
  return 'processing';
}

/** Statuses included in the Nestiee production dashboard for a given scope. */
export function nestieeStatusesForDemandScope(scope: NestieeDemandScope): readonly string[] {
  if (scope === 'processing') return [NESTIEE_PROCESSING_STATUS];
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

export interface NestieeProcessingDemand {
  giftBoxes: NestieeDemandGiftBox[];
  bottles: NestieeDemandBottle[];
  orderCount: number;
  scope: NestieeDemandScope;
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
  orders: Array<{ status?: string; fields?: Record<string, unknown> }>,
  giftBoxTypes: NestieeGiftBoxDemandType[],
  giftBoxBoms: Record<string, BomLine[]> = {},
  scope: NestieeDemandScope = 'processing',
): NestieeProcessingDemand {
  const boms = { ...GIFT_BOX_BOMS, ...giftBoxBoms };
  const activeTypes = [...giftBoxTypes]
    .filter((g) => g.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const giftTotals = new Map<string, number>();
  for (const g of activeTypes) giftTotals.set(g.id, 0);

  const bottleTotals = new Map<string, number>();
  for (const slot of NESTIEE_BOTTLE_DASHBOARD_SLOTS) bottleTotals.set(slot.sku, 0);

  let orderCount = 0;

  for (const order of orders) {
    const orderType = orderTypeFromFields(order.fields);
    if (!orderType || !isNestieeOrderType(orderType)) continue;
    if (!orderMatchesNestieeDemandScope(order.status, scope)) continue;
    orderCount += 1;

    const fields = order.fields || {};
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
    orderCount,
    scope,
  };
}
