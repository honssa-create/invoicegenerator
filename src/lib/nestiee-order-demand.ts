/** Client-safe Nestiee production demand rollup for processing orders. */

import { expandGiftBoxBom, finishedSku, GIFT_BOX_BOMS, type BomLine } from './kitchen-bom';
import { getOrderType, isNestieeOrderType } from './orders';

export const NESTIEE_PROCESSING_STATUS = 'processing' as const;

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
  processingOrderCount: number;
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
  giftBoxBoms: Record<string, BomLine[]> = {}
): NestieeProcessingDemand {
  const boms = { ...GIFT_BOX_BOMS, ...giftBoxBoms };
  const activeTypes = [...giftBoxTypes]
    .filter((g) => g.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const giftTotals = new Map<string, number>();
  for (const g of activeTypes) giftTotals.set(g.id, 0);

  const bottleTotals = new Map<string, number>();
  for (const slot of NESTIEE_BOTTLE_DASHBOARD_SLOTS) bottleTotals.set(slot.sku, 0);

  let processingOrderCount = 0;

  for (const order of orders) {
    if (!isNestieeOrderType(getOrderType(order))) continue;
    if (order.status !== NESTIEE_PROCESSING_STATUS) continue;
    processingOrderCount += 1;

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
    processingOrderCount,
  };
}
