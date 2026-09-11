/** Bird's nest production queue — 75g / 45g / 25g bottle planning (client-safe). */

import { expandGiftBoxBom, finishedSku, type BomLine } from './kitchen-bom';
import { hydrateNestieeGiftBoxQtys, localDateYmd } from './orders';

export const KITCHEN_DAILY_SESSION_LIMIT = 2;

export type ProductionScheduleFlavor = 'red_date' | 'osmanthus' | 'rock_sugar';
export type ProductionScheduleCapacity = '75g' | '45g' | '25g';
export type ProductionScheduleSlotId = `${ProductionScheduleCapacity}:${ProductionScheduleFlavor}`;

export const PRODUCTION_SCHEDULE_FLAVORS: ProductionScheduleFlavor[] = [
  'red_date',
  'osmanthus',
  'rock_sugar',
];

export interface ProductionScheduleSlot {
  id: ProductionScheduleSlotId;
  capacity: ProductionScheduleCapacity;
  flavor: ProductionScheduleFlavor;
  label: string;
  /** 75g tall only — bottles per stewing session (轉). */
  sessionBottles?: number;
}

export const PRODUCTION_SCHEDULE_SLOTS: ProductionScheduleSlot[] = [
  { id: '75g:red_date', capacity: '75g', flavor: 'red_date', label: '75g 紅棗', sessionBottles: 100 },
  { id: '75g:osmanthus', capacity: '75g', flavor: 'osmanthus', label: '75g 桂花', sessionBottles: 110 },
  { id: '75g:rock_sugar', capacity: '75g', flavor: 'rock_sugar', label: '75g 冰糖', sessionBottles: 110 },
  { id: '45g:red_date', capacity: '45g', flavor: 'red_date', label: '45g 紅棗' },
  { id: '45g:osmanthus', capacity: '45g', flavor: 'osmanthus', label: '45g 桂花' },
  { id: '45g:rock_sugar', capacity: '45g', flavor: 'rock_sugar', label: '45g 冰糖' },
  { id: '25g:osmanthus', capacity: '25g', flavor: 'osmanthus', label: '25g 桂花' },
  { id: '25g:rock_sugar', capacity: '25g', flavor: 'rock_sugar', label: '25g 冰糖' },
];

/** @deprecated Use PRODUCTION_SCHEDULE_SLOTS labels for 75g rows. */
export const PRODUCTION_SCHEDULE_LABELS: Record<ProductionScheduleFlavor, string> = {
  red_date: '75g 紅棗',
  osmanthus: '75g 桂花',
  rock_sugar: '75g 冰糖',
};

/** Star boxes count toward 75g tall schedule slots (not 大肚樽 SKU). */
export const PRODUCTION_SCHEDULE_STAR_BOX_TYPES = new Set(['star_gold', 'star_silver']);

/** Bottles per session (轉) — 75g tall only. */
export const SESSION_BOTTLES_PER_FLAVOR: Record<ProductionScheduleFlavor, number> = {
  red_date: 100,
  osmanthus: 110,
  rock_sugar: 110,
};

export interface ProductionScheduleRow {
  slotId: ProductionScheduleSlotId;
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

export type ProductionScheduleSlotTotals = Record<ProductionScheduleSlotId, number>;

/** @deprecated Legacy 75g-only totals keyed by flavor. */
export type ProductionScheduleFlavorTotals = Record<ProductionScheduleFlavor, number>;

export interface ProductionScheduleNetInputs {
  grossDemand: ProductionScheduleSlotTotals;
  giftBoxBottles: ProductionScheduleSlotTotals;
  looseStock: ProductionScheduleSlotTotals;
  netDemand: ProductionScheduleSlotTotals;
  netStock: ProductionScheduleSlotTotals;
}

export function emptySlotTotals(): ProductionScheduleSlotTotals {
  const out: Partial<ProductionScheduleSlotTotals> = {};
  for (const slot of PRODUCTION_SCHEDULE_SLOTS) out[slot.id] = 0;
  return out as ProductionScheduleSlotTotals;
}

/** @deprecated Use emptySlotTotals — 75g flavor slice only. */
export function emptyFlavorTotals(): ProductionScheduleFlavorTotals {
  return { red_date: 0, osmanthus: 0, rock_sugar: 0 };
}

export function finishedSkuForScheduleSlot(slotId: ProductionScheduleSlotId): string {
  const slot = PRODUCTION_SCHEDULE_SLOTS.find((s) => s.id === slotId);
  if (!slot) throw new Error(`Unknown schedule slot: ${slotId}`);
  return finishedSku(slot.capacity, slot.flavor);
}

export function finishedSkuForScheduleFlavor(flavor: ProductionScheduleFlavor): string {
  return finishedSku('75g', flavor);
}

function slotIdForCapacityFlavor(
  capacity: ProductionScheduleCapacity,
  flavor: ProductionScheduleFlavor,
): ProductionScheduleSlotId | null {
  const id = `${capacity}:${flavor}` as ProductionScheduleSlotId;
  return PRODUCTION_SCHEDULE_SLOTS.some((s) => s.id === id) ? id : null;
}

/** Map a finished SKU from gift-box BOM to a schedule slot, if tracked. */
export function scheduleSlotForGiftBoxFinishedSku(
  boxType: string,
  sku: string,
): ProductionScheduleSlotId | null {
  for (const slot of PRODUCTION_SCHEDULE_SLOTS) {
    if (sku === finishedSku(slot.capacity, slot.flavor)) return slot.id;
  }
  if (PRODUCTION_SCHEDULE_STAR_BOX_TYPES.has(boxType)) {
    for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
      if (sku === finishedSku('75g_big_belly', flavor)) {
        return slotIdForCapacityFlavor('75g', flavor);
      }
    }
  }
  return null;
}

/** @deprecated Use scheduleSlotForGiftBoxFinishedSku */
export function scheduleFlavorForGiftBoxFinishedSku(
  boxType: string,
  sku: string,
): ProductionScheduleFlavor | null {
  const slotId = scheduleSlotForGiftBoxFinishedSku(boxType, sku);
  if (!slotId || !slotId.startsWith('75g:')) return null;
  return slotId.slice(4) as ProductionScheduleFlavor;
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

/** Expand gift-box qty into bottle demand by schedule slot. */
export function giftBoxBottlesByScheduleSlot(
  boxType: string,
  quantity: number,
  boms: Record<string, BomLine[]>,
): ProductionScheduleSlotTotals {
  const totals = emptySlotTotals();
  if (quantity <= 0) return totals;
  for (const line of expandGiftBoxBom(boxType, quantity, boms)) {
    if (line.kind !== 'finished') continue;
    const slotId = scheduleSlotForGiftBoxFinishedSku(boxType, line.sku);
    if (!slotId) continue;
    totals[slotId] += line.qty;
  }
  return totals;
}

/** @deprecated Use giftBoxBottlesByScheduleSlot */
export function giftBoxBottlesByScheduleFlavor(
  boxType: string,
  quantity: number,
  boms: Record<string, BomLine[]>,
): ProductionScheduleFlavorTotals {
  const slots = giftBoxBottlesByScheduleSlot(boxType, quantity, boms);
  const out = emptyFlavorTotals();
  for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
    out[flavor] = slots[`75g:${flavor}` as ProductionScheduleSlotId] || 0;
  }
  return out;
}

function addSlotTotals(
  target: ProductionScheduleSlotTotals,
  partial: ProductionScheduleSlotTotals,
): void {
  for (const slot of PRODUCTION_SCHEDULE_SLOTS) {
    target[slot.id] += partial[slot.id] || 0;
  }
}

export interface ProductionScheduleGiftBoxType {
  id: string;
  qtyKey: string;
  active?: boolean;
}

/** Gross bottle demand from processing orders — remaining (unfulfilled) 所需禮盒 only. */
export function grossDemandFromRemainingGiftBoxes(
  orders: Array<{ id: number; fields?: Record<string, unknown> }>,
  giftBoxTypes: ProductionScheduleGiftBoxType[],
  boms: Record<string, BomLine[]>,
  fulfillments: Map<string, number>,
): ProductionScheduleSlotTotals {
  const totals = emptySlotTotals();
  const activeTypes = giftBoxTypes.filter((g) => g.active !== false);

  for (const order of orders) {
    const fields = hydrateNestieeGiftBoxQtys({ ...(order.fields || {}) });
    for (const g of activeTypes) {
      const required = fieldQty(fields, g.qtyKey);
      if (required <= 0) continue;
      const fulfilled = Math.min(required, fulfilledGiftQty(fulfillments, order.id, g.id));
      const remaining = Math.max(0, required - fulfilled);
      if (remaining <= 0) continue;
      addSlotTotals(totals, giftBoxBottlesByScheduleSlot(g.id, remaining, boms));
    }
  }
  return totals;
}

/** Bottles inside on-hand gift-box stock, by schedule slot. */
export function giftBoxSupplyByScheduleSlot(
  giftBoxes: Array<{ boxType: string; quantity: number }>,
  boms: Record<string, BomLine[]>,
): ProductionScheduleSlotTotals {
  const totals = emptySlotTotals();
  for (const row of giftBoxes) {
    const qty = Math.max(0, Math.floor(row.quantity || 0));
    if (qty <= 0) continue;
    addSlotTotals(totals, giftBoxBottlesByScheduleSlot(row.boxType, qty, boms));
  }
  return totals;
}

/** @deprecated Use giftBoxSupplyByScheduleSlot */
export function giftBoxSupplyByScheduleFlavor(
  giftBoxes: Array<{ boxType: string; quantity: number }>,
  boms: Record<string, BomLine[]>,
): ProductionScheduleFlavorTotals {
  const slots = giftBoxSupplyByScheduleSlot(giftBoxes, boms);
  const out = emptyFlavorTotals();
  for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
    out[flavor] = slots[`75g:${flavor}` as ProductionScheduleSlotId] || 0;
  }
  return out;
}

export function netProductionScheduleInputs(
  grossDemand: ProductionScheduleSlotTotals,
  giftBoxBottles: ProductionScheduleSlotTotals,
  looseStock: ProductionScheduleSlotTotals,
): ProductionScheduleNetInputs {
  const netDemand = emptySlotTotals();
  const netStock = emptySlotTotals();
  for (const slot of PRODUCTION_SCHEDULE_SLOTS) {
    const gross = Math.max(0, Math.floor(grossDemand[slot.id] || 0));
    const gift = Math.max(0, Math.floor(giftBoxBottles[slot.id] || 0));
    const loose = Math.max(0, Math.floor(looseStock[slot.id] || 0));
    netDemand[slot.id] = Math.max(0, gross - gift);
    netStock[slot.id] = loose;
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

export const KITCHEN_PRODUCTION_SCHEDULE_DEFECTS_STORAGE_KEY =
  'kitchen-production-schedule-defects';

/** Defective bottle counts keyed by schedule product label (e.g. `75g 紅棗`). */
export type ProductionScheduleDefectsByProduct = Record<string, number>;

export function emptyDefectsByProduct(): ProductionScheduleDefectsByProduct {
  const out: ProductionScheduleDefectsByProduct = {};
  for (const slot of PRODUCTION_SCHEDULE_SLOTS) out[slot.label] = 0;
  return out;
}

export function parseDefectsFromStorage(raw: string | null): ProductionScheduleDefectsByProduct {
  const out = emptyDefectsByProduct();
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const slot of PRODUCTION_SCHEDULE_SLOTS) {
      const v = parsed[slot.label];
      const num = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(num)) out[slot.label] = Math.max(0, Math.floor(num));
    }
  } catch {
    /* ignore corrupt storage */
  }
  return out;
}

/**
 * Recompute shortfall / sessions treating defective bottles as non-usable stock.
 * Physical `stock` on each row is unchanged; planning uses stock − defects.
 */
export function applyDefectsToProductionSchedule(
  summary: ProductionScheduleSummary,
  defectsByProduct: ProductionScheduleDefectsByProduct,
): ProductionScheduleSummary {
  const rows: ProductionScheduleRow[] = summary.rows.map((row) => {
    const defects = Math.max(0, Math.floor(defectsByProduct[row.product] || 0));
    const usableStock = Math.max(0, row.stock - defects);
    const shortfall = Math.max(0, row.demand - usableStock);
    const slot = PRODUCTION_SCHEDULE_SLOTS.find((s) => s.id === row.slotId);
    const sessions =
      slot?.capacity === '75g' && slot.sessionBottles
        ? shortfall > 0
          ? Math.ceil(shortfall / slot.sessionBottles)
          : null
        : null;
    return { ...row, shortfall, sessions };
  });

  const totalSessions = rows.reduce((sum, row) => sum + (row.sessions || 0), 0);
  const totalDaysNeeded =
    totalSessions > 0 ? Math.ceil(totalSessions / KITCHEN_DAILY_SESSION_LIMIT) : 0;
  const estimatedCompletionDate = addProductionDaysSkippingSundays(
    summary.today,
    totalDaysNeeded,
  );

  return {
    ...summary,
    rows,
    totalSessions,
    totalDaysNeeded,
    estimatedCompletionDate,
  };
}

export function computeKitchenProductionSchedule(
  demandBySlot: ProductionScheduleSlotTotals,
  stockBySlot: ProductionScheduleSlotTotals,
  today: string = localDateYmd(),
  grossBySlot?: ProductionScheduleSlotTotals,
  giftBoxBottlesBySlot?: ProductionScheduleSlotTotals,
): ProductionScheduleSummary {
  const rows: ProductionScheduleRow[] = PRODUCTION_SCHEDULE_SLOTS.map((slot) => {
    const gross = Math.max(
      0,
      Math.floor(grossBySlot?.[slot.id] ?? (demandBySlot[slot.id] || 0)),
    );
    const gift = Math.max(0, Math.floor(giftBoxBottlesBySlot?.[slot.id] ?? 0));
    const loose = Math.max(0, Math.floor(stockBySlot[slot.id] || 0));
    const demand = Math.max(0, Math.floor(demandBySlot[slot.id] || 0));
    const stock = loose;
    const shortfall = Math.max(0, gross - gift - loose);
    const sessions =
      slot.capacity === '75g' && slot.sessionBottles
        ? shortfall > 0
          ? Math.ceil(shortfall / slot.sessionBottles)
          : null
        : null;
    return {
      slotId: slot.id,
      flavor: slot.flavor,
      product: slot.label,
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

/** @deprecated Use grossDemandFromRemainingGiftBoxes */
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

/** Read on-hand loose bottle stock for all tracked schedule slots. */
export function stockFromFinishedRows(
  rows: Array<{ sku: string; quantity: number }>,
): ProductionScheduleSlotTotals {
  const out = emptySlotTotals();
  for (const row of rows) {
    for (const slot of PRODUCTION_SCHEDULE_SLOTS) {
      if (row.sku === finishedSku(slot.capacity, slot.flavor)) {
        out[slot.id] = Math.max(0, Math.floor(row.quantity || 0));
      }
    }
  }
  return out;
}
