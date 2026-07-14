// Client-safe constants, types and formulas for the Kitchen Scheduling & Two-Tier
// Inventory system. Server logic lives in kitchen-server.ts.

export const FLAVORS = ['冰糖', '桂花', '紅棗'] as const;
export const CAPACITIES = ['45ml', '25ml'] as const;
export type Flavor = (typeof FLAVORS)[number];
export type Capacity = (typeof CAPACITIES)[number];

export const OOS_STATUS = '無現貨 (Out of Stock)';
export const READY_STATUS = 'Ready to Ship';

export function skuOf(capacity: string, flavor: string): string {
  return `${capacity} ${flavor}`;
}

// All finished-goods SKUs (capacity × flavor).
export const FINISHED_SKUS: string[] = CAPACITIES.flatMap((c) => FLAVORS.map((f) => skuOf(c, f)));

// Raw materials + per-bottle consumption rate. 燕餅 (g) = bottles × 0.8g etc.
export interface RawMaterialDef {
  name: string;
  unit: string;
  perBottle: number;
  seedStock: number;
}

export const RAW_MATERIALS: RawMaterialDef[] = [
  { name: '燕餅', unit: 'g', perBottle: 0.8, seedStock: 500 },
  { name: '冰糖', unit: 'g', perBottle: 5, seedStock: 2000 },
  { name: '片糖', unit: 'g', perBottle: 3, seedStock: 1500 },
  { name: '空玻璃樽', unit: '個', perBottle: 1, seedStock: 300 },
  { name: '圓形Tag', unit: '個', perBottle: 1, seedStock: 300 },
  { name: '金繩', unit: '條', perBottle: 1, seedStock: 300 },
  { name: '紙箱', unit: '個', perBottle: 0.05, seedStock: 50 },
];

export interface MaterialRequirement {
  name: string;
  unit: string;
  qty: number;
}

// Compute raw materials required for a batch of `bottles` (used by the 大字報).
export function computeBatchMaterials(bottles: number): MaterialRequirement[] {
  return RAW_MATERIALS.map((m) => ({
    name: m.name,
    unit: m.unit,
    qty: Math.round(m.perBottle * bottles * 100) / 100,
  }));
}

// ---- Shared types returned by the kitchen state API ----
export interface FinishedRow {
  sku: string;
  quantity: number;
}
export interface RawRow {
  name: string;
  unit: string;
  total_stock: number;
  allocated_stock: number;
  available: number;
}
export interface DailyOrder {
  id: number;
  source: string;
  customer: string | null;
  sku: string;
  quantity: number;
  status: string;
  created_at: string;
}
export interface BrewingBatch {
  id: number;
  flavor: string;
  capacity: string;
  brewing_date: string | null;
  bottle_count: number;
  status: 'scheduled' | 'completed';
  created_at: string;
  completed_at: string | null;
  materials: MaterialRequirement[];
}
export interface KitchenState {
  finished: FinishedRow[];
  raw: RawRow[];
  orders: DailyOrder[];
  batches: BrewingBatch[];
}
