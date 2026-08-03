/** Client-safe constants and types for the Kitchen fulfillment dashboard. */

import { NESTIEE_GIFT_BOX_TYPES } from './orders';
import {
  FINISHED_SKUS,
  finishedSkuLabel,
  type BomLine,
  type StockCheckLine,
} from './kitchen-bom';

export {
  FINISHED_SKUS,
  FINISHED_CAPACITIES,
  FINISHED_FLAVORS,
  finishedSku,
  finishedSkuLabel,
  parseFinishedSku,
  expandGiftBoxBom,
  checkBomAgainstStock,
  bomIsSufficient,
  aggregateBomDemand,
  GIFT_BOX_BOMS,
  bomLineKey,
  applyBomQtyOverrides,
  normalizeBomQty,
  SUI_XIN_YAN_BING_G,
  SUI_XIN_BING_TANG_G,
  giftNeedKey,
  bottleNeedKey,
  type BomLine,
  type StockCheckLine,
  type MovementDeltas,
} from './kitchen-bom';

export const GIFT_BOX_TYPES = NESTIEE_GIFT_BOX_TYPES;

export interface RawMaterialDef {
  name: string;
  unit: string;
  seedStock: number;
}

/** Raw materials tracked in kitchen inventory (restock + 隨心燉 BOM).
 *  頂級乾燕餅 ≡ 燕餅；燕窩冰糖 ≡ 冰糖. */
export const RAW_MATERIALS: RawMaterialDef[] = [
  { name: '燕餅', unit: 'g', seedStock: 0 },
  { name: '桂花', unit: 'g', seedStock: 0 },
  { name: '紅棗', unit: 'g', seedStock: 0 },
  { name: '冰糖', unit: 'g', seedStock: 0 },
  { name: '片糖', unit: 'g', seedStock: 0 },
  { name: '玻璃燉瓶', unit: '個', seedStock: 0 },
];

/** Legacy raw names → canonical (fold stock on seed). */
export const RAW_MATERIAL_ALIASES: Record<string, string> = {
  頂級乾燕餅: '燕餅',
  燕窩冰糖: '冰糖',
};

export const KITCHEN_ACTIONS = [
  'make_gift_box',
  'allocate_gift_box',
  'make_return_gift',
  'restock_raw',
  'complete_stew',
  'print_prep_sheet',
  'void',
] as const;
export type KitchenAction = (typeof KITCHEN_ACTIONS)[number];

export const KITCHEN_ACTION_LABELS: Record<KitchenAction, string> = {
  make_gift_box: '包裝禮盒',
  allocate_gift_box: '分配禮盒',
  make_return_gift: '包裝回禮',
  restock_raw: '補充原料',
  complete_stew: '完成燉製',
  print_prep_sheet: '列印材料單',
  void: 'Void',
};

export interface GiftBoxRow {
  boxType: string;
  label: string;
  quantity: number;
  needed: number;
}

export interface FinishedRow {
  sku: string;
  label: string;
  quantity: number;
  needed: number;
}

export interface RawRow {
  name: string;
  unit: string;
  quantity: number;
  needed: number;
}

/** Format raw qty for display: grams up to 3 decimals; count units as integers. */
export function formatRawQty(qty: number, unit: string): string {
  if (!Number.isFinite(qty)) return '0';
  if (unit === 'g') {
    const rounded = Math.round(qty * 1000) / 1000;
    return rounded.toFixed(3).replace(/\.?0+$/, '') || '0';
  }
  return String(Math.round(qty));
}

/** Round raw stock values: g → 3dp, others → integer. */
export function roundRawQty(qty: number, unit: string): number {
  if (!Number.isFinite(qty)) return 0;
  if (unit === 'g') return Math.round(qty * 1000) / 1000;
  return Math.round(qty);
}

export interface KitchenNeedLine {
  needKey: string;
  label: string;
  required: number;
  fulfilled: number;
  remaining: number;
  done: boolean;
}

export interface KitchenOpenOrder {
  id: number;
  poNumber: string;
  type: 'nestiee' | 'return_gift';
  typeLabel: string;
  needs: KitchenNeedLine[];
  fullyFulfilled: boolean;
}

export interface KitchenMovement {
  id: number;
  action: KitchenAction;
  actionLabel: string;
  /** For void rows: label of the original action that was voided. */
  voidedActionLabel: string | null;
  summary: string;
  orderId: number | null;
  createdAt: string;
  createdBy: number;
  createdByName: string;
  voidedAt: string | null;
  voidedBy: number | null;
  voidedByName: string | null;
  voidsMovementId: number | null;
}

export interface KitchenDemand {
  giftBoxes: Record<string, number>;
  finished: Record<string, number>;
  raw: Record<string, number>;
}

export interface KitchenState {
  giftBoxes: GiftBoxRow[];
  finished: FinishedRow[];
  raw: RawRow[];
  demand: KitchenDemand;
  openOrders: KitchenOpenOrder[];
  movements: KitchenMovement[];
  isAdmin: boolean;
}

export function formatBomConsumption(lines: BomLine[]): string {
  return lines
    .map((l) =>
      l.kind === 'finished'
        ? `−${l.qty} ${finishedSkuLabel(l.sku)}`
        : `−${l.qty} ${l.name}`
    )
    .join(' · ');
}

export function formatStockStatus(check: StockCheckLine, unit = 'g'): string {
  const have =
    check.kind === 'raw' ? formatRawQty(check.have, unit) : String(Math.round(check.have));
  return `${have} / ${check.enough ? '足夠' : '不足'}`;
}
