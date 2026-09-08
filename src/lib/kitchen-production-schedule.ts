/** Bird's nest 75g production queue — shared daily kitchen capacity (client-safe). */

import { expandGiftBoxBom, finishedSku, type BomLine } from './kitchen-bom';
import { hydrateNestieeGiftBoxQtys, localDateYmd } from './orders';

export const KITCHEN_DAILY_SESSION_LIMIT = 2;

export type ProductionScheduleFlavor = 'red_date' | 'osmanthus' | 'rock_sugar';

export const PRODUCTION_SCHEDULE_FLAVORS: ProductionScheduleFlavor[] = [
  'red_date',
  'osmanthus',
  'rock_sugar',
];

export const PRODUCTION_SCHEDULE_LABELS: Record<ProductionScheduleFlavor, string> = {
  red_date: '75g 紅棗',
  osmanthus: '75g 桂花',
  rock_sugar: '75g 冰糖',
};

/** Star boxes count toward 75g tall schedule flavors (not 大肚樽 SKU). */
export const PRODUCTION_SCHEDULE_STAR_BOX_TYPES = new Set(['star_gold', 'star_silver']);

/** Bottles per session (轉) by flavor. */
export const SESSION_BOTTLES_PER_FLAVOR: Record<ProductionScheduleFlavor, number> = {
  red_date: 100,
  osmanthus: 110,
  rock_sugar: 110,
};

export interface ProductionScheduleRow {
  flavor: ProductionScheduleFlavor;
  product: string;
  stock: number;
  demand: number;
  shortfall: number;
  sessions: number | null;
}

export interface ProductionScheduleSummary {
  rows: ProductionScheduleRow[];
  totalSessions: number;
  totalDaysNeeded: number;
  estimatedCompletionDate: string;
  today: string;
}

export type ProductionScheduleFlavorTotals = Record<ProductionScheduleFlavor, number>;

export interface ProductionScheduleNetInputs {
  grossDemand: ProductionScheduleFlavorTotals;
  giftBoxBottles: ProductionScheduleFlavorTotals;
  looseStock: ProductionScheduleFlavorTotals;
  netDemand: ProductionScheduleFlavorTotals;
  netStock: ProductionScheduleFlavorTotals;
}

export function emptyFlavorTotals(): ProductionScheduleFlavorTotals {
  return { red_date: 0, osmanthus: 0, rock_sugar: 0 };
}

export function finishedSkuForScheduleFlavor(flavor: ProductionScheduleFlavor): string {
  return finishedSku('75g', flavor);
}

/** Map a finished SKU from gift-box BOM to a 75g tall schedule flavor, if any. */
export function scheduleFlavorForGiftBoxFinishedSku(
  boxType: string,
  sku: string,
): ProductionScheduleFlavor | null {
  for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
    if (sku === finishedSkuForScheduleFlavor(flavor)) return flavor;
    if (
      PRODUCTION_SCHEDULE_STAR_BOX_TYPES.has(boxType) &&
      sku === finishedSku('75g_big_belly', flavor)
    ) {
      return flavor;
    }
  }
  return null;
}

function fieldQty(fields: Record<string, unknown>, key: string): number {
  const v = fields[key];
  const num = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function fulfilledGiftQty(
  fulfillments: Map<string, number>,
  orderId: number,
  boxType: string,
): number {
  return fulfillments.get(`${orderId}::gift:${boxType}`) || 0;
}

/** Expand gift-box qty into 75g tall bottle demand by schedule flavor. */
export function giftBoxBottlesByScheduleFlavor(
  boxType: string,
  quantity: number,
  boms: Record<string, BomLine[]>,
): ProductionScheduleFlavorTotals {
  const totals = emptyFlavorTotals();
  if (quantity <= 0) return totals;
  for (const line of expandGiftBoxBom(boxType, quantity, boms)) {
    if (line.kind !== 'finished') continue;
    const flavor = scheduleFlavorForGiftBoxFinishedSku(boxType, line.sku);
    if (!flavor) continue;
    totals[flavor] += line.qty;
  }
  return totals;
}

function addFlavorTotals(
  target: ProductionScheduleFlavorTotals,
  partial: ProductionScheduleFlavorTotals,
): void {
  for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
    target[flavor] += partial[flavor];
  }
}

export interface ProductionScheduleGiftBoxType {
  id: string;
  qtyKey: string;
  active?: boolean;
}

/**
 * Gross 75g bottle demand from processing orders — uses remaining (unfulfilled) 所需禮盒 only.
 */
export function grossDemandFromRemainingGiftBoxes(
  orders: Array<{ id: number; fields?: Record<string, unknown> }>,
  giftBoxTypes: ProductionScheduleGiftBoxType[],
  boms: Record<string, BomLine[]>,
  fulfillments: Map<string, number>,
): ProductionScheduleFlavorTotals {
  const totals = emptyFlavorTotals();
  const activeTypes = giftBoxTypes.filter((g) => g.active !== false);

  for (const order of orders) {
    const fields = hydrateNestieeGiftBoxQtys({ ...(order.fields || {}) });
    for (const g of activeTypes) {
      const required = fieldQty(fields, g.qtyKey);
      if (required <= 0) continue;
      const fulfilled = Math.min(required, fulfilledGiftQty(fulfillments, order.id, g.id));
      const remaining = Math.max(0, required - fulfilled);
      if (remaining <= 0) continue;
      addFlavorTotals(totals, giftBoxBottlesByScheduleFlavor(g.id, remaining, boms));
    }
  }
  return totals;
}

/** Bottles inside on-hand gift-box stock (kitchen_gift_boxes), by schedule flavor. */
export function giftBoxSupplyByScheduleFlavor(
  giftBoxes: Array<{ boxType: string; quantity: number }>,
  boms: Record<string, BomLine[]>,
): ProductionScheduleFlavorTotals {
  const totals = emptyFlavorTotals();
  for (const row of giftBoxes) {
    const qty = Math.max(0, Math.floor(row.quantity || 0));
    if (qty <= 0) continue;
    addFlavorTotals(totals, giftBoxBottlesByScheduleFlavor(row.boxType, qty, boms));
  }
  return totals;
}

/**
 * Net schedule inputs: Demand = gross − gift-box supply; Stock = loose; Shortfall = gross − gift − loose.
 * Gift-box bottles only reduce the same flavor's demand.
 */
export function netProductionScheduleInputs(
  grossDemand: ProductionScheduleFlavorTotals,
  giftBoxBottles: ProductionScheduleFlavorTotals,
  looseStock: ProductionScheduleFlavorTotals,
): ProductionScheduleNetInputs {
  const netDemand = emptyFlavorTotals();
  const netStock = emptyFlavorTotals();
  for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
    const gross = Math.max(0, Math.floor(grossDemand[flavor] || 0));
    const gift = Math.max(0, Math.floor(giftBoxBottles[flavor] || 0));
    const loose = Math.max(0, Math.floor(looseStock[flavor] || 0));
    netDemand[flavor] = Math.max(0, gross - gift);
    netStock[flavor] = loose;
  }
  return {
    grossDemand: { ...grossDemand },
    giftBoxBottles: { ...giftBoxBottles },
    looseStock: { ...looseStock },
    netDemand,
    netStock,
  };
}

export function sessionsForShortfall(
  flavor: ProductionScheduleFlavor,
  shortfall: number,
): number | null {
  if (shortfall <= 0) return null;
  const perSession = SESSION_BOTTLES_PER_FLAVOR[flavor];
  return Math.ceil(shortfall / perSession);
}

/** Advance `days` production days from `startYmd`, skipping Sundays. */
export function addProductionDaysSkippingSundays(startYmd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startYmd.trim());
  if (!m) return startYmd;
  if (days <= 0) return startYmd;

  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  let remaining = days;
  while (remaining > 0) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    if (dt.getUTCDay() === 0) continue;
    remaining -= 1;
  }
  return dt.toISOString().slice(0, 10);
}

export function computeKitchenProductionSchedule(
  demandByFlavor: Record<ProductionScheduleFlavor, number>,
  stockByFlavor: Record<ProductionScheduleFlavor, number>,
  today: string = localDateYmd(),
  grossByFlavor?: Record<ProductionScheduleFlavor, number>,
  giftBoxBottlesByFlavor?: Record<ProductionScheduleFlavor, number>,
): ProductionScheduleSummary {
  const rows: ProductionScheduleRow[] = PRODUCTION_SCHEDULE_FLAVORS.map((flavor) => {
    const gross = Math.max(
      0,
      Math.floor(grossByFlavor?.[flavor] ?? (demandByFlavor[flavor] || 0)),
    );
    const gift = Math.max(0, Math.floor(giftBoxBottlesByFlavor?.[flavor] ?? 0));
    const loose = Math.max(0, Math.floor(stockByFlavor[flavor] || 0));
    const demand = Math.max(0, Math.floor(demandByFlavor[flavor] || 0));
    const stock = loose;
    const shortfall = Math.max(0, gross - gift - loose);
    const sessions = sessionsForShortfall(flavor, shortfall);
    return {
      flavor,
      product: PRODUCTION_SCHEDULE_LABELS[flavor],
      stock,
      demand,
      shortfall,
      sessions,
    };
  });

  const totalSessions = rows.reduce((sum, row) => sum + (row.sessions || 0), 0);
  const totalDaysNeeded = totalSessions > 0
    ? Math.ceil(totalSessions / KITCHEN_DAILY_SESSION_LIMIT)
    : 0;
  const estimatedCompletionDate = addProductionDaysSkippingSundays(today, totalDaysNeeded);

  return {
    rows,
    totalSessions,
    totalDaysNeeded,
    estimatedCompletionDate,
    today,
  };
}

/** @deprecated Use grossDemandFromRemainingGiftBoxes — kept for tests migrating from bottle totals. */
export function demandFrom75gBottleTotals(
  totals: Array<{ sku: string; qty: number }>,
): ProductionScheduleFlavorTotals {
  const out = emptyFlavorTotals();
  for (const { sku, qty } of totals) {
    for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
      if (sku === finishedSkuForScheduleFlavor(flavor)) {
        out[flavor] += qty;
      }
    }
  }
  return out;
}

/** Read on-hand 75g tall stock from kitchen finished inventory rows. */
export function stockFromFinishedRows(
  rows: Array<{ sku: string; quantity: number }>,
): ProductionScheduleFlavorTotals {
  const out = emptyFlavorTotals();
  for (const row of rows) {
    for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
      if (row.sku === finishedSkuForScheduleFlavor(flavor)) {
        out[flavor] = Math.max(0, Math.floor(row.quantity || 0));
      }
    }
  }
  return out;
}
