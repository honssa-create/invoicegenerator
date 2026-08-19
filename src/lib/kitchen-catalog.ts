/** Client-safe kitchen catalog + formula types, defaults, and pure helpers. */

import { NESTIEE_GIFT_BOX_TYPES } from './orders';
import {
  FINISHED_CAPACITIES,
  FINISHED_FLAVORS,
  FINISHED_SKU_LABELS,
  GIFT_BOX_BOMS,
  finishedSku,
  type BomLine,
  type KitchenFlavor,
} from './kitchen-bom';
import {
  CAPACITY_FLAVOR_FORMULAS,
  PREP_CAPACITY_LABELS,
  PREP_CAPACITIES,
  getFormulaLines,
  formulaFromLines,
  type FlavorFormulaPerBottle,
  type PrepCapacity,
  type PrepFlavor,
  type StewIngredientLine,
} from './kitchen-prep';

export interface CatalogRawMaterial {
  name: string;
  unit: string;
  sortOrder: number;
}

export interface CatalogGiftBoxType {
  id: string;
  label: string;
  qtyKey: string;
  sortOrder: number;
  active: boolean;
}

export interface CatalogCapacity {
  id: string;
  label: string;
  sortOrder: number;
}

export interface KitchenCatalog {
  rawMaterials: CatalogRawMaterial[];
  giftBoxTypes: CatalogGiftBoxType[];
  capacities: CatalogCapacity[];
  finishedLabels: Record<string, string>;
}

export type StewFormulaMap = Partial<
  Record<string, Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>>>
>;

export interface KitchenFormulas {
  giftBoxBoms: Record<string, BomLine[]>;
  stewFormulas: StewFormulaMap;
}

export interface KitchenCatalogBundle {
  catalog: KitchenCatalog;
  formulas: KitchenFormulas;
}

export function giftBoxQtyKey(id: string): string {
  return `nestiee_gift_qty_${id}`;
}

/**
 * Auto-generate a stable catalog id (gift box / capacity).
 * Prefers a slug from `label` when it yields a-z0-9_; otherwise `${prefix}_${n}`.
 */
export function uniqueCatalogId(
  prefix: 'box' | 'cap',
  existingIds: Iterable<string>,
  label = ''
): string {
  const taken = new Set(
    [...existingIds].map((id) => String(id || '').trim()).filter(Boolean)
  );
  const fromLabel = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  if (fromLabel && /^[a-z0-9_]+$/.test(fromLabel)) {
    if (!taken.has(fromLabel)) return fromLabel;
    let n = 2;
    while (taken.has(`${fromLabel}_${n}`)) n += 1;
    return `${fromLabel}_${n}`;
  }

  let n = 1;
  while (taken.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

export function defaultKitchenCatalog(): KitchenCatalog {
  return {
    rawMaterials: [
      { name: '燕餅', unit: 'g', sortOrder: 0 },
      { name: '桂花', unit: 'g', sortOrder: 1 },
      { name: '紅棗', unit: 'g', sortOrder: 2 },
      { name: '冰糖', unit: 'g', sortOrder: 3 },
      { name: '片糖', unit: 'g', sortOrder: 4 },
      { name: '玻璃燉瓶', unit: '個', sortOrder: 5 },
    ],
    giftBoxTypes: NESTIEE_GIFT_BOX_TYPES.map((g, i) => ({
      id: g.id,
      label: g.label,
      qtyKey: g.qtyKey,
      sortOrder: i,
      active: true,
    })),
    capacities: PREP_CAPACITIES.map((id, i) => ({
      id,
      label: PREP_CAPACITY_LABELS[id] || id,
      sortOrder: i,
    })),
    finishedLabels: { ...FINISHED_SKU_LABELS },
  };
}

export function defaultKitchenFormulas(): KitchenFormulas {
  return {
    giftBoxBoms: structuredClone(GIFT_BOX_BOMS),
    stewFormulas: structuredClone(CAPACITY_FLAVOR_FORMULAS) as StewFormulaMap,
  };
}

export function defaultKitchenCatalogBundle(): KitchenCatalogBundle {
  return { catalog: defaultKitchenCatalog(), formulas: defaultKitchenFormulas() };
}

/** Finished SKUs from catalog capacities × fixed flavors. */
export function finishedSkusFromCatalog(catalog: KitchenCatalog): string[] {
  const caps = [...catalog.capacities].sort((a, b) => a.sortOrder - b.sortOrder);
  return caps.flatMap((c) => FINISHED_FLAVORS.map((f) => finishedSku(c.id as PrepCapacity, f)));
}

export function finishedSkuLabelFromCatalog(sku: string, catalog: KitchenCatalog): string {
  if (catalog.finishedLabels[sku]) return catalog.finishedLabels[sku];
  const [capacity, flavor] = sku.split('|');
  if (!capacity || !flavor) return sku;
  const capLabel = catalog.capacities.find((c) => c.id === capacity)?.label || capacity;
  const flavorZh: Record<string, string> = {
    osmanthus: '桂花',
    red_date: '紅棗',
    rock_sugar: '冰糖',
  };
  return `${capLabel} ${flavorZh[flavor] || flavor}`;
}

export function activeGiftBoxTypes(catalog: KitchenCatalog): CatalogGiftBoxType[] {
  return [...catalog.giftBoxTypes]
    .filter((g) => g.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function expandGiftBoxBomFrom(
  boms: Record<string, BomLine[]>,
  boxType: string,
  quantity: number
): BomLine[] {
  const base = boms[boxType];
  if (!base || quantity <= 0) return [];
  const q = Math.floor(quantity);
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return base.map((line) =>
    line.kind === 'finished'
      ? { kind: 'finished' as const, sku: line.sku, qty: line.qty * q }
      : {
          kind: 'raw' as const,
          name: line.name,
          qty: line.name === '玻璃燉瓶' ? line.qty * q : round3(line.qty * q),
        }
  );
}

export function getStewFlavorFormula(
  capacity: string,
  flavor: PrepFlavor,
  formulas: StewFormulaMap = CAPACITY_FLAVOR_FORMULAS as StewFormulaMap
): FlavorFormulaPerBottle | null {
  const cell = formulas[capacity]?.[flavor];
  return cell === undefined ? null : cell;
}

const GIFT_ID_RE = /^[a-z0-9_]+$/;

export function validateKitchenCatalogBundle(
  catalog: KitchenCatalog,
  formulas: KitchenFormulas
): string | null {
  if (!Array.isArray(catalog.rawMaterials) || catalog.rawMaterials.length === 0) {
    return '至少需要一種原料';
  }
  const rawNames = new Set<string>();
  for (const m of catalog.rawMaterials) {
    const name = String(m.name || '').trim();
    if (!name) return '原料名稱不可空白';
    if (rawNames.has(name)) return `重複原料：${name}`;
    rawNames.add(name);
    if (!String(m.unit || '').trim()) return `原料單位不可空白：${name}`;
  }

  if (!Array.isArray(catalog.capacities) || catalog.capacities.length === 0) {
    return '至少需要一種容量';
  }
  const capIds = new Set<string>();
  for (const c of catalog.capacities) {
    const id = String(c.id || '').trim();
    if (!id) return '容量 id 不可空白';
    if (!GIFT_ID_RE.test(id) && !/^\d+g(_[a-z0-9_]+)?$/.test(id)) {
      // allow classic capacity ids like 25g / 75g_big_belly and slug ids
      if (!/^[a-z0-9_]+$/.test(id)) return `無效容量 id：${id}`;
    }
    if (capIds.has(id)) return `重複容量：${id}`;
    capIds.add(id);
  }

  if (!Array.isArray(catalog.giftBoxTypes) || catalog.giftBoxTypes.length === 0) {
    return '至少需要一種禮盒';
  }
  const boxIds = new Set<string>();
  for (const g of catalog.giftBoxTypes) {
    const id = String(g.id || '').trim();
    if (!id || !GIFT_ID_RE.test(id)) return `無效禮盒 id：${id || '(空白)'}`;
    if (boxIds.has(id)) return `重複禮盒：${id}`;
    boxIds.add(id);
    if (!String(g.label || '').trim()) return `禮盒名稱不可空白：${id}`;
  }

  const skus = new Set(finishedSkusFromCatalog(catalog));
  for (const [boxType, lines] of Object.entries(formulas.giftBoxBoms || {})) {
    if (!boxIds.has(boxType)) continue;
    if (!Array.isArray(lines)) return `無效 BOM：${boxType}`;
    for (const line of lines) {
      if (!line || typeof line !== 'object') return `無效 BOM 行：${boxType}`;
      if (line.kind === 'finished') {
        if (!skus.has(line.sku)) return `BOM 引用未知成品：${line.sku}`;
        if (!(Number(line.qty) >= 0)) return `BOM 數量無效：${boxType}`;
      } else if (line.kind === 'raw') {
        if (!rawNames.has(line.name)) return `BOM 引用未知原料：${line.name}`;
        if (!(Number(line.qty) >= 0)) return `BOM 數量無效：${boxType}`;
      } else {
        return `無效 BOM kind：${boxType}`;
      }
    }
  }

  for (const [cap, block] of Object.entries(formulas.stewFormulas || {})) {
    if (!capIds.has(cap) || !block) continue;
    for (const flavor of FINISHED_FLAVORS as KitchenFlavor[]) {
      const cell = block[flavor];
      if (cell == null) continue;
      const lines = getFormulaLines(cell, flavor);
      for (const l of lines) {
        if (!(Number(l.qty) >= 0)) return `燉製配方數量無效：${cap}/${flavor}`;
        if (l.qty > 0 && !rawNames.has(l.name)) {
          return `燉製配方引用未知原料：${cap}/${flavor} → ${l.name}`;
        }
      }
    }
  }

  return null;
}

/** Normalize incoming PATCH body into a full bundle (fills qtyKey, sortOrder, defaults). */
export function normalizeCatalogBundle(
  catalogIn: Partial<KitchenCatalog> | null | undefined,
  formulasIn: Partial<KitchenFormulas> | null | undefined,
  base: KitchenCatalogBundle = defaultKitchenCatalogBundle()
): KitchenCatalogBundle {
  const catalog: KitchenCatalog = {
    rawMaterials: Array.isArray(catalogIn?.rawMaterials)
      ? catalogIn!.rawMaterials.map((m, i) => ({
          name: String(m.name || '').trim(),
          unit: String(m.unit || 'g').trim() || 'g',
          sortOrder: Number.isFinite(m.sortOrder) ? Number(m.sortOrder) : i,
        }))
      : base.catalog.rawMaterials,
    giftBoxTypes: Array.isArray(catalogIn?.giftBoxTypes)
      ? catalogIn!.giftBoxTypes.map((g, i) => {
          const id = String(g.id || '').trim();
          return {
            id,
            label: String(g.label || '').trim(),
            qtyKey: String(g.qtyKey || '').trim() || giftBoxQtyKey(id),
            sortOrder: Number.isFinite(g.sortOrder) ? Number(g.sortOrder) : i,
            active: g.active !== false,
          };
        })
      : base.catalog.giftBoxTypes,
    capacities: Array.isArray(catalogIn?.capacities)
      ? catalogIn!.capacities.map((c, i) => ({
          id: String(c.id || '').trim(),
          label: String(c.label || c.id || '').trim(),
          sortOrder: Number.isFinite(c.sortOrder) ? Number(c.sortOrder) : i,
        }))
      : base.catalog.capacities,
    finishedLabels:
      catalogIn?.finishedLabels && typeof catalogIn.finishedLabels === 'object'
        ? Object.fromEntries(
            Object.entries(catalogIn.finishedLabels).map(([k, v]) => [k, String(v || '')])
          )
        : base.catalog.finishedLabels,
  };

  const formulas: KitchenFormulas = {
    giftBoxBoms:
      formulasIn?.giftBoxBoms && typeof formulasIn.giftBoxBoms === 'object'
        ? sanitizeBoms(formulasIn.giftBoxBoms)
        : base.formulas.giftBoxBoms,
    stewFormulas:
      formulasIn?.stewFormulas && typeof formulasIn.stewFormulas === 'object'
        ? sanitizeStew(formulasIn.stewFormulas)
        : base.formulas.stewFormulas,
  };

  return { catalog, formulas };
}

function sanitizeBoms(raw: Record<string, BomLine[]>): Record<string, BomLine[]> {
  const out: Record<string, BomLine[]> = {};
  for (const [k, lines] of Object.entries(raw)) {
    if (!Array.isArray(lines)) continue;
    out[k] = lines
      .map((line): BomLine | null => {
        if (!line || typeof line !== 'object') return null;
        if (line.kind === 'finished') {
          return { kind: 'finished', sku: String(line.sku || ''), qty: Number(line.qty) || 0 };
        }
        if (line.kind === 'raw') {
          return { kind: 'raw', name: String(line.name || ''), qty: Number(line.qty) || 0 };
        }
        return null;
      })
      .filter((x): x is BomLine => x != null);
  }
  return out;
}

function sanitizeStew(raw: StewFormulaMap): StewFormulaMap {
  const out: StewFormulaMap = {};
  for (const [cap, block] of Object.entries(raw)) {
    if (!block || typeof block !== 'object') continue;
    const next: Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>> = {};
    for (const flavor of ['osmanthus', 'red_date', 'rock_sugar'] as PrepFlavor[]) {
      const cell = block[flavor];
      if (cell === null) {
        next[flavor] = null;
        continue;
      }
      if (!cell || typeof cell !== 'object') continue;

      let lines: StewIngredientLine[];
      if (Array.isArray(cell.lines)) {
        lines = cell.lines
          .map((l) => ({
            name: String(l?.name || '').trim(),
            qty: Math.max(0, Number(l?.qty) || 0),
          }))
          .filter((l) => l.name);
      } else {
        // Migrate legacy slot formulas → lines
        lines = getFormulaLines(cell, flavor);
      }
      next[flavor] = formulaFromLines(lines);
    }
    out[cap] = next;
  }
  return out;
}

/** Prefer catalog display order for finished capacities list used by UI. */
export function finishedCapacitiesFromCatalog(catalog: KitchenCatalog): string[] {
  return [...catalog.capacities]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.id);
}

/** Compatibility: default capacity order used when catalog absent. */
export const DEFAULT_FINISHED_CAPACITIES = [...FINISHED_CAPACITIES];
