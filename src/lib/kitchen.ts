/** Client-safe constants and types for the Kitchen fulfillment dashboard. */

import { NESTIEE_GIFT_BOX_TYPES } from './orders';
import {
  FINISHED_SKUS,
  finishedSkuLabel,
  type BomLine,
  type StockCheckLine,
} from './kitchen-bom';
import type { KitchenCatalog, KitchenFormulas } from './kitchen-catalog';
import { defaultKitchenCatalog } from './kitchen-catalog';

export {
  FINISHED_SKUS,
  FINISHED_CAPACITIES,
  FINISHED_FLAVORS,
  finishedSku,
  finishedSkuLabel,
  parseFinishedSku,
  expandGiftBoxBom,
  finishedShortfallsByCapacity,
  checkBomAgainstStock,
  bomIsSufficient,
  aggregateBomDemand,
  GIFT_BOX_BOMS,
  bomLineKey,
  applyBomQtyOverrides,
  normalizeBomQty,
  giftBoxBomNeedsBirdNestChoice,
  SUI_XIN_YAN_BING_G,
  SUI_XIN_BING_TANG_G,
  giftNeedKey,
  bottleNeedKey,
  type BomLine,
  type StockCheckLine,
  type MovementDeltas,
  type FinishedFlavorQtys,
} from './kitchen-bom';

export type {
  KitchenCatalog,
  KitchenFormulas,
  CatalogRawMaterial,
  CatalogGiftBoxType,
  CatalogCapacity,
  KitchenCatalogBundle,
} from './kitchen-catalog';

export {
  defaultKitchenCatalog,
  defaultKitchenFormulas,
  defaultKitchenCatalogBundle,
  finishedSkusFromCatalog,
  finishedSkuLabelFromCatalog,
  activeGiftBoxTypes,
  expandGiftBoxBomFrom,
  giftBoxQtyKey,
  uniqueCatalogId,
  isReserveRawMaterial,
  RESERVE_RAW_MATERIALS,
  giftBoxBomRawOptions,
  giftBoxBomRawSelectOptions,
  stewFormulaRawSelectOptions,
} from './kitchen-catalog';

export { isUntrackedStewIngredient, BIRD_NEST_FORMULA_PLACEHOLDER } from './kitchen-prep';

export const GIFT_BOX_TYPES = NESTIEE_GIFT_BOX_TYPES;

/** Minimum on-hand stock to keep for each gift-box kind. */
export const GIFT_BOX_MIN_STOCK = 10;
/** Minimum when 節日模式 (holiday mode) is on. */
export const GIFT_BOX_MIN_STOCK_HOLIDAY = 20;

export function giftBoxMinStock(holidayMode = false): number {
  return holidayMode ? GIFT_BOX_MIN_STOCK_HOLIDAY : GIFT_BOX_MIN_STOCK;
}

/** How many units to package to reach the minimum (0 if already at/above). */
export function giftBoxTopUpQty(quantity: number, minStock: number = GIFT_BOX_MIN_STOCK): number {
  const q = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
  const min = Number.isFinite(minStock) ? Math.floor(minStock) : GIFT_BOX_MIN_STOCK;
  return Math.max(0, min - q);
}

export interface RawMaterialDef {
  name: string;
  unit: string;
  seedStock: number;
}

/** Raw materials tracked in kitchen inventory (restock + 隨心燉 BOM).
 *  頂級乾燕餅 ≡ 燕餅；燕窩冰糖 ≡ 冰糖. Defaults; runtime catalog may differ. */
export const RAW_MATERIALS: RawMaterialDef[] = defaultKitchenCatalog().rawMaterials.map((m) => ({
  name: m.name,
  unit: m.unit,
  seedStock: 0,
}));

/** Legacy raw names → canonical (fold stock on seed). */
export const RAW_MATERIAL_ALIASES: Record<string, string> = {
  頂級乾燕餅: '大燕餅',
  燕餅: '大燕餅',
  玻璃燉瓶: '75g玻璃燉瓶(大肚)',
  燕窩冰糖: '冰糖',
};

export const KITCHEN_ACTIONS = [
  'make_gift_box',
  'allocate_gift_box',
  'make_return_gift',
  'restock_raw',
  'adjust_stock',
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
  adjust_stock: '庫存調整',
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

export interface ShippingBoxRow {
  boxId: string;
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
  referenceNumber: string;
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
  shippingBoxes: Record<string, number>;
}

export interface KitchenState {
  giftBoxes: GiftBoxRow[];
  finished: FinishedRow[];
  shippingBoxes: ShippingBoxRow[];
  raw: RawRow[];
  demand: KitchenDemand;
  openOrders: KitchenOpenOrder[];
  movements: KitchenMovement[];
  isAdmin: boolean;
  /** Org-wide: elevate gift-box min stock (admin toggle). */
  holidayMode: boolean;
  catalog: KitchenCatalog;
  formulas: KitchenFormulas;
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
