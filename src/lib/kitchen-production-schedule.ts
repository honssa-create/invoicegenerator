/** Bird's nest 75g production queue — shared daily kitchen capacity (client-safe). */

import { finishedSku } from './kitchen-bom';
import { localDateYmd } from './orders';

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

export function finishedSkuForScheduleFlavor(flavor: ProductionScheduleFlavor): string {
  return finishedSku('75g', flavor);
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
): ProductionScheduleSummary {
  const rows: ProductionScheduleRow[] = PRODUCTION_SCHEDULE_FLAVORS.map((flavor) => {
    const demand = Math.max(0, Math.floor(demandByFlavor[flavor] || 0));
    const stock = Math.max(0, Math.floor(stockByFlavor[flavor] || 0));
    const shortfall = Math.max(0, demand - stock);
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

/** Map finished-bottle SKU totals into schedule flavor keys (75g tall only). */
export function demandFrom75gBottleTotals(
  totals: Array<{ sku: string; qty: number }>,
): Record<ProductionScheduleFlavor, number> {
  const out: Record<ProductionScheduleFlavor, number> = {
    red_date: 0,
    osmanthus: 0,
    rock_sugar: 0,
  };
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
): Record<ProductionScheduleFlavor, number> {
  const out: Record<ProductionScheduleFlavor, number> = {
    red_date: 0,
    osmanthus: 0,
    rock_sugar: 0,
  };
  for (const row of rows) {
    for (const flavor of PRODUCTION_SCHEDULE_FLAVORS) {
      if (row.sku === finishedSkuForScheduleFlavor(flavor)) {
        out[flavor] = Math.max(0, Math.floor(row.quantity || 0));
      }
    }
  }
  return out;
}
