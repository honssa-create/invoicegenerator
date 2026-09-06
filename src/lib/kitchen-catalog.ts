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
  withStewWaterLines,
  STEW_WATER_BOIL_SUGAR,
  STEW_WATER_COLD_SOAK,
  BIRD_NEST_FORMULA_PLACEHOLDER,
  isStewFormulaCatalogExempt,
  isUntrackedStewIngredient,
  defaultGiftBoxGlassBottleStockName,
  isGlassBottleFormulaIngredient,
  LEGACY_GLASS_BOTTLE_NAME,
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

/** Stew glass jars — one stock row per bottle capacity. */
export const STEW_GLASS_BOTTLE_RAW_MATERIALS: CatalogRawMaterial[] = [
  { name: '25g玻璃燉瓶', unit: '個', sortOrder: 6 },
  { name: '45g玻璃燉瓶', unit: '個', sortOrder: 7 },
  { name: '75g玻璃燉瓶(高身)', unit: '個', sortOrder: 8 },
  { name: '75g玻璃燉瓶(大肚)', unit: '個', sortOrder: 9 },
];

/** Stew water ingredients — grams per bottle in stew formulas. */
export const STEW_WATER_RAW_MATERIALS: CatalogRawMaterial[] = [
  { name: STEW_WATER_BOIL_SUGAR, unit: 'g', sortOrder: 10 },
  { name: STEW_WATER_COLD_SOAK, unit: 'g', sortOrder: 11 },
];

/** Spare bird's-nest cake stock — shown separately at the bottom of the raw table (可用 only). */
export const RESERVE_RAW_MATERIALS: CatalogRawMaterial[] = [
  { name: '備用大燕餅', unit: 'g', sortOrder: 100 },
  { name: '備用細燕餅', unit: 'g', sortOrder: 101 },
];

export function isReserveRawMaterial(name: string): boolean {
  return String(name || '').trim().startsWith('備用');
}

/** Append built-in reserve raw rows when missing from a saved catalog. */
export function mergeReserveRawMaterials(catalog: KitchenCatalog): KitchenCatalog {
  const existing = new Set(catalog.rawMaterials.map((m) => m.name));
  const missing = RESERVE_RAW_MATERIALS.filter((m) => !existing.has(m.name));
  if (missing.length === 0) return catalog;
  return {
    ...catalog,
    rawMaterials: [...catalog.rawMaterials, ...missing.map((m) => ({ ...m }))],
  };
}

/** Replace legacy 燕餅 with 大燕餅 / 細燕餅 in saved catalogs. */
export function mergeBirdNestCatalogRawMaterials(catalog: KitchenCatalog): KitchenCatalog {
  const names = new Set(catalog.rawMaterials.map((m) => m.name));
  let materials = catalog.rawMaterials.filter((m) => m.name !== '燕餅');
  let changed = materials.length !== catalog.rawMaterials.length;

  if (!materials.some((m) => m.name === '大燕餅')) {
    materials = [{ name: '大燕餅', unit: 'g', sortOrder: 0 }, ...materials];
    changed = true;
  }
  if (!materials.some((m) => m.name === '細燕餅')) {
    const maxSort = materials.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0);
    materials.push({ name: '細燕餅', unit: 'g', sortOrder: maxSort + 1 });
    changed = true;
  }

  if (!changed && !names.has('燕餅')) return catalog;

  return {
    ...catalog,
    rawMaterials: materials.map((m, i) => ({
      ...m,
      sortOrder: Number.isFinite(m.sortOrder) ? m.sortOrder : i,
    })),
  };
}

/** Append stew water raw rows when missing from a saved catalog. */
export function mergeStewWaterCatalogRawMaterials(catalog: KitchenCatalog): KitchenCatalog {
  const existing = new Set(catalog.rawMaterials.map((m) => m.name));
  const missing = STEW_WATER_RAW_MATERIALS.filter((m) => !existing.has(m.name));
  if (missing.length === 0) return catalog;
  return {
    ...catalog,
    rawMaterials: [...catalog.rawMaterials, ...missing.map((m) => ({ ...m }))],
  };
}

/** Append 水(煮糖) / 水(冷泡) lines to saved stew formulas when missing. */
export function mergeStewWaterFormulaLines(formulas: KitchenFormulas): KitchenFormulas {
  const stew = formulas.stewFormulas;
  if (!stew || typeof stew !== 'object') return formulas;

  let changed = false;
  const nextStew: StewFormulaMap = {};

  for (const [cap, block] of Object.entries(stew)) {
    if (!block || typeof block !== 'object') {
      nextStew[cap] = block;
      continue;
    }
    const nextBlock: Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>> = {};
    for (const flavor of ['osmanthus', 'red_date', 'rock_sugar'] as PrepFlavor[]) {
      const cell = block[flavor];
      if (cell == null) {
        nextBlock[flavor] = cell === null ? null : cell;
        continue;
      }
      const lines = getFormulaLines(cell, flavor);
      const merged = withStewWaterLines(lines, flavor);
      if (merged.length !== lines.length) changed = true;
      nextBlock[flavor] = formulaFromLines(merged);
    }
    nextStew[cap] = nextBlock;
  }

  if (!changed) return formulas;
  return { ...formulas, stewFormulas: nextStew };
}

/** Replace legacy 玻璃燉瓶 with capacity-specific jar rows. */
export function mergeGlassBottleCatalogRawMaterials(catalog: KitchenCatalog): KitchenCatalog {
  const names = new Set(catalog.rawMaterials.map((m) => m.name));
  let materials = catalog.rawMaterials.filter((m) => m.name !== '玻璃燉瓶');
  let changed = materials.length !== catalog.rawMaterials.length;

  for (const jar of STEW_GLASS_BOTTLE_RAW_MATERIALS) {
    if (!materials.some((m) => m.name === jar.name)) {
      materials.push({ ...jar });
      changed = true;
    }
  }

  if (!changed && !names.has('玻璃燉瓶')) return catalog;

  return {
    ...catalog,
    rawMaterials: materials.map((m, i) => ({
      ...m,
      sortOrder: Number.isFinite(m.sortOrder) ? m.sortOrder : i,
    })),
  };
}

export type StewFormulaMap = Partial<
  Record<string, Partial<Record<PrepFlavor, FlavorFormulaPerBottle | null>>>
>;

export interface KitchenFormulas {
  giftBoxBoms: Record<string, BomLine[]>;
  stewFormulas: StewFormulaMap;
}

const SUI_XIN_GIFT_BOX_IDS = ['sui_xin_7', 'sui_xin_14', 'sui_xin_18'] as const;

function normalizeGiftBoxBomGlassLine(line: BomLine): BomLine {
  if (line.kind !== 'raw') return line;
  if (line.name === LEGACY_GLASS_BOTTLE_NAME) {
    return { ...line, name: defaultGiftBoxGlassBottleStockName() };
  }
  return line;
}

/** 隨心燉 BOMs: migrate fixed 大燕餅 → 燕餅 placeholder (packaging picks 大/細). */
function normalizeSuiXinBirdNestLine(line: BomLine): BomLine {
  if (line.kind === 'raw' && line.name === '大燕餅') {
    return { ...line, name: BIRD_NEST_FORMULA_PLACEHOLDER };
  }
  return line;
}

/** Append gift-box types / BOMs from code defaults when missing in a saved catalog. */
export function mergeCatalogGiftBoxTypes(bundle: KitchenCatalogBundle): KitchenCatalogBundle {
  const defaults = defaultKitchenCatalogBundle();
  const existingIds = new Set(bundle.catalog.giftBoxTypes.map((g) => g.id));
  const missingTypes = defaults.catalog.giftBoxTypes.filter((g) => !existingIds.has(g.id));

  const giftBoxBoms = { ...bundle.formulas.giftBoxBoms };
  let bomsChanged = false;
  for (const [id, lines] of Object.entries(defaults.formulas.giftBoxBoms)) {
    if (!giftBoxBoms[id]) {
      giftBoxBoms[id] = structuredClone(lines);
      bomsChanged = true;
    }
  }

  if (missingTypes.length === 0 && !bomsChanged) return bundle;

  return {
    catalog: {
      ...bundle.catalog,
      giftBoxTypes:
        missingTypes.length > 0
          ? [...bundle.catalog.giftBoxTypes, ...missingTypes]
          : bundle.catalog.giftBoxTypes,
    },
    formulas: bomsChanged ? { ...bundle.formulas, giftBoxBoms } : bundle.formulas,
  };
}

/** Ensure 隨心燉 gift-box BOMs include an editable glass-jar line (migrate legacy 玻璃燉瓶). */
export function mergeSuiXinGiftBoxBoms(formulas: KitchenFormulas): KitchenFormulas {
  const giftBoxBoms = { ...(formulas.giftBoxBoms || {}) };
  let changed = false;

  for (const boxId of SUI_XIN_GIFT_BOX_IDS) {
    const defaultLines = (GIFT_BOX_BOMS[boxId] || []).map(normalizeGiftBoxBomGlassLine);
    let lines = (giftBoxBoms[boxId] || [])
      .map(normalizeGiftBoxBomGlassLine)
      .map(normalizeSuiXinBirdNestLine);

    if (lines.length === 0) {
      giftBoxBoms[boxId] = defaultLines.map((l) => ({ ...l }));
      changed = true;
      continue;
    }

    const hasGlass = lines.some(
      (l) => l.kind === 'raw' && isGlassBottleFormulaIngredient(l.name)
    );
    if (!hasGlass) {
      const glassLine = defaultLines.find(
        (l) => l.kind === 'raw' && isGlassBottleFormulaIngredient(l.name)
      );
      if (glassLine) {
        lines = [{ ...glassLine }, ...lines];
        changed = true;
      }
    }

    const prevJson = JSON.stringify(giftBoxBoms[boxId] || []);
    giftBoxBoms[boxId] = lines;
    if (prevJson !== JSON.stringify(lines)) changed = true;
  }

  if (!changed) return formulas;
  return { ...formulas, giftBoxBoms };
}

/** Raw ingredient options for gift-box BOM editor (jar sizes first). */
export function giftBoxBomRawOptions(catalog: KitchenCatalog): string[] {
  const names = catalog.rawMaterials.map((m) => m.name);
  const jarSet = new Set(STEW_GLASS_BOTTLE_RAW_MATERIALS.map((m) => m.name));
  const jars = names.filter((n) => jarSet.has(n));
  const rest = names.filter((n) => !jarSet.has(n));
  return [...jars, ...rest];
}

export function giftBoxBomRawSelectOptions(catalog: KitchenCatalog, currentName: string): string[] {
  const base = giftBoxBomRawOptions(catalog);
  const withPlaceholder = base.includes(BIRD_NEST_FORMULA_PLACEHOLDER)
    ? base
    : [BIRD_NEST_FORMULA_PLACEHOLDER, ...base];
  if (currentName && !withPlaceholder.includes(currentName)) {
    return [currentName, ...withPlaceholder];
  }
  return withPlaceholder;
}

/** Raw ingredient options for stew formula editor (燕餅 placeholder first). */
export function stewFormulaRawSelectOptions(catalog: KitchenCatalog, currentName: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name: string) => {
    const n = String(name || '').trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  push(BIRD_NEST_FORMULA_PLACEHOLDER);
  for (const m of catalog.rawMaterials) push(m.name);
  if (currentName) push(currentName);
  return out;
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
    Array.from(existingIds)
      .map((id) => String(id || '').trim())
      .filter(Boolean)
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
      { name: '大燕餅', unit: 'g', sortOrder: 0 },
      { name: '細燕餅', unit: 'g', sortOrder: 1 },
      { name: '桂花', unit: 'g', sortOrder: 2 },
      { name: '紅棗', unit: 'g', sortOrder: 3 },
      { name: '冰糖', unit: 'g', sortOrder: 4 },
      { name: '片糖', unit: 'g', sortOrder: 5 },
      ...STEW_WATER_RAW_MATERIALS,
      ...STEW_GLASS_BOTTLE_RAW_MATERIALS,
      ...RESERVE_RAW_MATERIALS,
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
  const isJar = (name: string) =>
    name === '玻璃燉瓶' || STEW_GLASS_BOTTLE_RAW_MATERIALS.some((m) => m.name === name);
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
          qty: isJar(line.name) ? line.qty * q : round3(line.qty * q),
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
        if (!rawNames.has(line.name) && !isStewFormulaCatalogExempt(line.name)) {
          return `BOM 引用未知原料：${line.name}`;
        }
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
        if (l.qty > 0 && !rawNames.has(l.name) && !isStewFormulaCatalogExempt(l.name)) {
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
