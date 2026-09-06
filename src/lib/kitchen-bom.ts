/** Gift-box bill of materials and stock-delta helpers (client-safe). */

import type { PrepCapacity, PrepFlavor, BirdNestType } from './kitchen-prep';
import {
  isGlassBottleFormulaIngredient,
  defaultGiftBoxGlassBottleStockName,
  resolveRawStockName,
  bomRawDisplayLabel,
  BIRD_NEST_FORMULA_PLACEHOLDER,
} from './kitchen-prep';

export { resolveRawStockName, bomRawDisplayLabel, isGlassBottleFormulaIngredient, LEGACY_GLASS_BOTTLE_NAME } from './kitchen-prep';

export type KitchenFlavor = PrepFlavor;
export type KitchenCapacity = PrepCapacity;

export function finishedSku(capacity: KitchenCapacity, flavor: KitchenFlavor): string {
  return `${capacity}|${flavor}`;
}

export function parseFinishedSku(sku: string): { capacity: KitchenCapacity; flavor: KitchenFlavor } | null {
  const [capacity, flavor] = sku.split('|');
  if (!capacity || !flavor) return null;
  return { capacity: capacity as KitchenCapacity, flavor: flavor as KitchenFlavor };
}

export function finishedSkuLabel(sku: string): string {
  const parsed = parseFinishedSku(sku);
  if (!parsed) return sku;
  return FINISHED_SKU_LABELS[sku] || `${parsed.capacity} ${FLAVOR_ZH[parsed.flavor] || parsed.flavor}`;
}

const FLAVOR_ZH: Record<KitchenFlavor, string> = {
  osmanthus: '桂花',
  red_date: '紅棗',
  rock_sugar: '冰糖',
};

/** Display order for 成品樽 inventory (matches kitchen UI catalog). */
export const FINISHED_CAPACITIES: KitchenCapacity[] = ['25g', '45g', '75g_big_belly', '75g'];
export const FINISHED_FLAVORS: KitchenFlavor[] = ['osmanthus', 'red_date', 'rock_sugar'];

export const FINISHED_SKUS: string[] = FINISHED_CAPACITIES.flatMap((c) =>
  FINISHED_FLAVORS.map((f) => finishedSku(c, f))
);

/** Canonical Chinese labels for the 12 finished bottle SKUs. */
export const FINISHED_SKU_LABELS: Record<string, string> = {
  [finishedSku('25g', 'osmanthus')]: '25g 桂花',
  [finishedSku('25g', 'red_date')]: '25g 紅棗',
  [finishedSku('25g', 'rock_sugar')]: '25g 冰糖',
  [finishedSku('45g', 'osmanthus')]: '45g 桂花',
  [finishedSku('45g', 'red_date')]: '45g 紅棗',
  [finishedSku('45g', 'rock_sugar')]: '45g 冰糖',
  [finishedSku('75g_big_belly', 'osmanthus')]: '75g 桂花 (大肚樽)',
  [finishedSku('75g_big_belly', 'red_date')]: '75g 紅棗 (大肚樽)',
  [finishedSku('75g_big_belly', 'rock_sugar')]: '75g 冰糖 (大肚樽)',
  [finishedSku('75g', 'osmanthus')]: '75g 桂花 (高身樽)',
  [finishedSku('75g', 'red_date')]: '75g 紅棗 (高身樽)',
  [finishedSku('75g', 'rock_sugar')]: '75g 冰糖 (高身樽)',
};

export type BomLine =
  | { kind: 'finished'; sku: string; qty: number }
  | { kind: 'raw'; name: string; qty: number };

/** 隨心燉: each portion unit → grams in inventory. */
export const SUI_XIN_YAN_BING_G = 1.7; // 頂級乾燕餅 → 燕餅
export const SUI_XIN_BING_TANG_G = 0.6; // 燕窩冰糖 → 冰糖

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function suiXinStewBottles(portions: number): number {
  if (portions <= 0) return 0;
  return Math.max(2, Math.round((portions / 7) * 2));
}

function suiXinRawBom(portions: number): BomLine[] {
  const lines: BomLine[] = [];
  const stewBottles = suiXinStewBottles(portions);
  if (stewBottles > 0) {
    lines.push({ kind: 'raw', name: defaultGiftBoxGlassBottleStockName(), qty: stewBottles });
  }
  lines.push({ kind: 'raw', name: BIRD_NEST_FORMULA_PLACEHOLDER, qty: round3(portions * SUI_XIN_YAN_BING_G) });
  lines.push({ kind: 'raw', name: '冰糖', qty: round3(portions * SUI_XIN_BING_TANG_G) });
  return lines;
}

/** Nestiee gift-box type id → per-box consumption. */
export const GIFT_BOX_BOMS: Record<string, BomLine[]> = {
  star_gold: [{ kind: 'finished', sku: finishedSku('75g_big_belly', 'osmanthus'), qty: 3 }],
  star_silver: [{ kind: 'finished', sku: finishedSku('75g_big_belly', 'rock_sugar'), qty: 3 }],
  red_gold: [{ kind: 'finished', sku: finishedSku('75g', 'red_date'), qty: 3 }],
  red_silver: [{ kind: 'finished', sku: finishedSku('75g', 'rock_sugar'), qty: 3 }],
  pink_osmanthus: [
    { kind: 'finished', sku: finishedSku('75g', 'rock_sugar'), qty: 2 },
    { kind: 'finished', sku: finishedSku('75g', 'osmanthus'), qty: 3 },
  ],
  pink_red_date: [
    { kind: 'finished', sku: finishedSku('75g', 'rock_sugar'), qty: 2 },
    { kind: 'finished', sku: finishedSku('75g', 'red_date'), qty: 3 },
  ],
  // 隨心燉 portions × grams (燕餅 1.7g / 冰糖 0.6g per portion) + 玻璃燉瓶
  sui_xin_7: suiXinRawBom(7),
  sui_xin_14: suiXinRawBom(14),
  sui_xin_18: suiXinRawBom(18),
  // 75g 高身樽 finished bottles
  qiu_yan_fei_yue: [
    { kind: 'finished', sku: finishedSku('75g', 'rock_sugar'), qty: 2 },
    { kind: 'finished', sku: finishedSku('75g', 'osmanthus'), qty: 3 },
    { kind: 'finished', sku: finishedSku('75g', 'red_date'), qty: 3 },
  ],
  rou_run_share_box: [
    { kind: 'finished', sku: finishedSku('45g', 'rock_sugar'), qty: 3 },
    { kind: 'finished', sku: finishedSku('45g', 'osmanthus'), qty: 3 },
  ],
  trial_set: [
    { kind: 'finished', sku: finishedSku('45g', 'rock_sugar'), qty: 1 },
    { kind: 'finished', sku: finishedSku('45g', 'osmanthus'), qty: 1 },
    { kind: 'finished', sku: finishedSku('45g', 'red_date'), qty: 1 },
  ],
  hua_yue: [
    { kind: 'finished', sku: finishedSku('75g', 'rock_sugar'), qty: 1 },
    { kind: 'finished', sku: finishedSku('75g', 'osmanthus'), qty: 1 },
    { kind: 'finished', sku: finishedSku('75g', 'red_date'), qty: 1 },
  ],
};

export function bomLineKey(line: BomLine): string {
  return line.kind === 'finished' ? `finished:${line.sku}` : `raw:${line.name}`;
}

/** Gift-box BOM includes 燕餅 placeholder — user picks 大/細燕餅 when packaging. */
export function giftBoxBomNeedsBirdNestChoice(lines: BomLine[]): boolean {
  return lines.some((l) => l.kind === 'raw' && l.name === BIRD_NEST_FORMULA_PLACEHOLDER);
}

export function expandGiftBoxBom(
  boxType: string,
  quantity: number,
  boms: Record<string, BomLine[]> = GIFT_BOX_BOMS
): BomLine[] {
  const base = boms[boxType];
  if (!base || quantity <= 0) return [];
  const q = Math.floor(quantity);
  return base.map((line) =>
    line.kind === 'finished'
      ? { kind: 'finished' as const, sku: line.sku, qty: line.qty * q }
      : {
          kind: 'raw' as const,
          name: line.name,
          qty: isGlassBottleFormulaIngredient(line.name) ? line.qty * q : round3(line.qty * q),
        }
  );
}

export type FinishedFlavorQtys = {
  osmanthus: number;
  red_date: number;
  rock_sugar: number;
};

/** Aggregate finished-bottle shortfalls from BOM lines, grouped by prep capacity. */
export function finishedShortfallsByCapacity(
  bomLines: BomLine[],
  finishedStock: Record<string, number>
): { capacity: PrepCapacity; qtys: FinishedFlavorQtys }[] {
  const byCap = new Map<PrepCapacity, FinishedFlavorQtys>();
  for (const line of bomLines) {
    if (line.kind !== 'finished') continue;
    const parsed = parseFinishedSku(line.sku);
    if (!parsed) continue;
    const have = finishedStock[line.sku] || 0;
    const short = Math.max(0, Math.ceil(line.qty - have));
    if (short <= 0) continue;
    const cur = byCap.get(parsed.capacity) || { osmanthus: 0, red_date: 0, rock_sugar: 0 };
    cur[parsed.flavor] = (cur[parsed.flavor] || 0) + short;
    byCap.set(parsed.capacity, cur);
  }
  return Array.from(byCap.entries()).map(([capacity, qtys]) => ({ capacity, qtys }));
}

/** Normalize a consume qty for packaging (finished / bottles = int; gram raw = 3dp). */
export function normalizeBomQty(line: BomLine, qty: number): number {
  if (!Number.isFinite(qty) || qty < 0) return line.qty;
  if (line.kind === 'finished' || isGlassBottleFormulaIngredient(line.name)) return Math.floor(qty);
  return round3(qty);
}

/**
 * Apply optional packaging overrides (key = bomLineKey). Missing keys keep defaults.
 * Returns error if any provided override is invalid.
 */
export function applyBomQtyOverrides(
  defaults: BomLine[],
  overrides?: Record<string, number> | null
): { lines: BomLine[]; error?: string } {
  if (!overrides || Object.keys(overrides).length === 0) {
    return { lines: defaults };
  }
  const lines: BomLine[] = [];
  for (const line of defaults) {
    const key = bomLineKey(line);
    if (!(key in overrides)) {
      lines.push(line);
      continue;
    }
    const raw = Number(overrides[key]);
    if (!Number.isFinite(raw) || raw < 0) {
      return { lines: defaults, error: `無效消耗數量：${key}` };
    }
    const qty = normalizeBomQty(line, raw);
    lines.push(
      line.kind === 'finished'
        ? { kind: 'finished', sku: line.sku, qty }
        : { kind: 'raw', name: line.name, qty }
    );
  }
  return { lines };
}

export interface StockMaps {
  finished: Record<string, number>;
  raw: Record<string, number>;
  giftBoxes: Record<string, number>;
}

export interface StockCheckLine {
  kind: 'finished' | 'raw';
  key: string;
  label: string;
  need: number;
  have: number;
  enough: boolean;
}

export function checkBomAgainstStock(
  lines: BomLine[],
  stock: StockMaps,
  opts?: { birdNestType?: BirdNestType }
): StockCheckLine[] {
  const birdNestType = opts?.birdNestType ?? 'large';
  return lines.map((line) => {
    if (line.kind === 'finished') {
      const have = stock.finished[line.sku] ?? 0;
      return {
        kind: 'finished' as const,
        key: line.sku,
        label: finishedSkuLabel(line.sku),
        need: line.qty,
        have,
        enough: have >= line.qty,
      };
    }
    const stockName = resolveRawStockName(line.name, birdNestType);
    const have = stock.raw[stockName] ?? 0;
    return {
      kind: 'raw' as const,
      key: line.name,
      label: bomRawDisplayLabel(line.name, birdNestType),
      need: line.qty,
      have,
      enough: have >= line.qty,
    };
  });
}

export function bomIsSufficient(checks: StockCheckLine[]): boolean {
  if (checks.length === 0) return false;
  return checks.every((c) => c.enough);
}

/** Aggregate BOM lines into finished/raw demand maps. */
export function aggregateBomDemand(lines: BomLine[]): {
  finished: Record<string, number>;
  raw: Record<string, number>;
} {
  const finished: Record<string, number> = {};
  const raw: Record<string, number> = {};
  for (const line of lines) {
    if (line.kind === 'finished') {
      finished[line.sku] = (finished[line.sku] || 0) + line.qty;
    } else {
      raw[line.name] = (raw[line.name] || 0) + line.qty;
    }
  }
  return { finished, raw };
}

export interface MovementDeltas {
  giftBoxDeltas: { boxType: string; delta: number }[];
  finishedDeltas: { sku: string; delta: number }[];
  rawDeltas: { name: string; delta: number }[];
  fulfillments: { orderId: number; needKey: string; qty: number }[];
}

/** Reverse stock deltas for void (fulfillments reversed separately). */
export function reverseMovementDeltas(d: MovementDeltas): MovementDeltas {
  return {
    giftBoxDeltas: d.giftBoxDeltas.map((x) => ({ ...x, delta: -x.delta })),
    finishedDeltas: d.finishedDeltas.map((x) => ({ ...x, delta: -x.delta })),
    rawDeltas: d.rawDeltas.map((x) => ({ ...x, delta: -x.delta })),
    fulfillments: d.fulfillments.map((x) => ({ ...x, qty: -x.qty })),
  };
}

/** After reverse, would any stock go negative given current maps? */
export function wouldGoNegative(deltas: MovementDeltas, stock: StockMaps): string | null {
  for (const g of deltas.giftBoxDeltas) {
    const next = (stock.giftBoxes[g.boxType] ?? 0) + g.delta;
    if (next < 0) return `禮盒庫存不足，無法 void：${g.boxType}`;
  }
  for (const f of deltas.finishedDeltas) {
    const next = (stock.finished[f.sku] ?? 0) + f.delta;
    if (next < 0) return `成品庫存不足，無法 void：${finishedSkuLabel(f.sku)}`;
  }
  for (const r of deltas.rawDeltas) {
    const next = (stock.raw[r.name] ?? 0) + r.delta;
    if (next < 0) return `原料庫存不足，無法 void：${r.name}`;
  }
  return null;
}

export function giftNeedKey(boxType: string): string {
  return `gift:${boxType}`;
}

export function bottleNeedKey(sku: string): string {
  return `bottle:${sku}`;
}

export function parseGiftNeedKey(key: string): string | null {
  return key.startsWith('gift:') ? key.slice(5) : null;
}

export function parseBottleNeedKey(key: string): string | null {
  return key.startsWith('bottle:') ? key.slice(7) : null;
}
