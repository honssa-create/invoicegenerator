/** Server-side kitchen catalog load/save (org-scoped in kitchen_settings). */

import db from './db';
import { isUntrackedStewIngredient } from './kitchen-prep';
import {
  defaultKitchenCatalogBundle,
  mergeBirdNestCatalogRawMaterials,
  mergeGlassBottleCatalogRawMaterials,
  mergeReserveRawMaterials,
  mergeStewWaterCatalogRawMaterials,
  mergeStewWaterFormulaLines,
  mergeCatalogGiftBoxTypes,
  mergeSuiXinGiftBoxBoms,
  normalizeCatalogBundle,
  validateKitchenCatalogBundle,
  finishedSkusFromCatalog,
  type KitchenCatalog,
  type KitchenCatalogBundle,
  type KitchenFormulas,
} from './kitchen-catalog';

/** Bump when merge helpers change so existing DBs re-run once. */
export const KITCHEN_CATALOG_MERGE_VERSION = '2026-08-v3';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

async function ensureSettingsRow(userId: number) {
  await db
    .prepare(`INSERT OR IGNORE INTO kitchen_settings (user_id, holiday_mode) VALUES (?, 0)`)
    .run(userId);
}

async function persistCatalogMergeVersion(userId: number) {
  await db
    .prepare('UPDATE kitchen_settings SET catalog_merge_version = ? WHERE user_id = ?')
    .run(KITCHEN_CATALOG_MERGE_VERSION, userId);
}

async function runCatalogMerges(
  userId: number,
  catalogIn: KitchenCatalog,
  formulasIn: KitchenFormulas,
  opts: { hasCatalog: boolean; hasFormulas: boolean; row: { catalog_json: string | null; formulas_json: string | null } | undefined },
): Promise<KitchenCatalogBundle> {
  const defaults = defaultKitchenCatalogBundle();
  let catalog = catalogIn;
  let formulas = formulasIn;

  const catalogWithBirdNest = mergeBirdNestCatalogRawMaterials(catalog);
  if (catalogWithBirdNest !== catalog) {
    catalog = catalogWithBirdNest;
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET catalog_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(JSON.stringify(catalog), userId);
  }

  const catalogWithGlass = mergeGlassBottleCatalogRawMaterials(catalog);
  if (catalogWithGlass !== catalog) {
    catalog = catalogWithGlass;
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET catalog_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(JSON.stringify(catalog), userId);
  }

  const catalogWithReserve = mergeReserveRawMaterials(catalog);
  if (catalogWithReserve !== catalog) {
    catalog = catalogWithReserve;
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET catalog_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(JSON.stringify(catalog), userId);
  }

  const catalogWithWater = mergeStewWaterCatalogRawMaterials(catalog);
  if (catalogWithWater !== catalog) {
    catalog = catalogWithWater;
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET catalog_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(JSON.stringify(catalog), userId);
  }

  let formulasMerged = mergeStewWaterFormulaLines(formulas);
  if (JSON.stringify(formulasMerged) !== JSON.stringify(formulas)) {
    formulas = formulasMerged;
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET formulas_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(JSON.stringify(formulas), userId);
  }

  formulasMerged = mergeSuiXinGiftBoxBoms(formulas);
  if (JSON.stringify(formulasMerged) !== JSON.stringify(formulas)) {
    formulas = formulasMerged;
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET formulas_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(JSON.stringify(formulas), userId);
  }

  const mergedBundle = mergeCatalogGiftBoxTypes({ catalog, formulas });
  if (
    JSON.stringify(mergedBundle.catalog) !== JSON.stringify(catalog) ||
    JSON.stringify(mergedBundle.formulas) !== JSON.stringify(formulas)
  ) {
    catalog = mergedBundle.catalog;
    formulas = mergedBundle.formulas;
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET catalog_json = ?, formulas_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(JSON.stringify(catalog), JSON.stringify(formulas), userId);
  }

  if (!opts.hasCatalog || !opts.hasFormulas) {
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET catalog_json = COALESCE(catalog_json, ?),
             formulas_json = COALESCE(formulas_json, ?),
             updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(
        opts.hasCatalog ? opts.row!.catalog_json : JSON.stringify(defaults.catalog),
        opts.hasFormulas ? opts.row!.formulas_json : JSON.stringify(defaults.formulas),
        userId
      );
  }

  await persistCatalogMergeVersion(userId);
  return { catalog, formulas };
}

/**
 * Load effective catalog + formulas for an org. Seeds JSON columns from code defaults
 * when null so subsequent reads are stable.
 */
/** Capacity dropdown labels only — skips catalog merge migrations (fast path for prep list). */
/**
 * Stew formulas for prep calculator — skips full catalog merge when DB version is current.
 * Falls back to {@link loadKitchenCatalog} when migrations are pending.
 */
const STEW_FORMULAS_CACHE_TTL_MS = 60_000;
const stewFormulasCache = new Map<number, { at: number; formulas: KitchenFormulas }>();

export async function readKitchenStewFormulas(userId: number): Promise<KitchenFormulas> {
  const cached = stewFormulasCache.get(userId);
  if (cached && Date.now() - cached.at < STEW_FORMULAS_CACHE_TTL_MS) {
    return cached.formulas;
  }

  await ensureSettingsRow(userId);
  const row = (await db
    .prepare(
      'SELECT formulas_json, catalog_merge_version FROM kitchen_settings WHERE user_id = ?'
    )
    .get(userId)) as
    | { formulas_json: string | null; catalog_merge_version: string | null }
    | undefined;

  const defaults = defaultKitchenCatalogBundle();
  const hasFormulas = Boolean(row?.formulas_json);
  if (hasFormulas && row?.catalog_merge_version === KITCHEN_CATALOG_MERGE_VERSION) {
    const formulas = normalizeCatalogBundle(
      null,
      parseJson(row!.formulas_json, defaults.formulas),
      defaults,
    ).formulas;
    stewFormulasCache.set(userId, { at: Date.now(), formulas });
    return formulas;
  }
  const formulas = (await loadKitchenCatalog(userId)).formulas;
  stewFormulasCache.set(userId, { at: Date.now(), formulas });
  return formulas;
}

/** Gift box types + BOMs for Nestiee demand rollup — avoids full catalog merge when version is current. */
export async function readKitchenGiftBoxDemandData(userId: number): Promise<{
  giftBoxTypes: Array<{
    id: string;
    label: string;
    qtyKey: string;
    sortOrder: number;
    active: boolean;
  }>;
  giftBoxBoms: KitchenFormulas['giftBoxBoms'];
}> {
  await ensureSettingsRow(userId);
  const row = (await db
    .prepare(
      'SELECT catalog_json, formulas_json, catalog_merge_version FROM kitchen_settings WHERE user_id = ?'
    )
    .get(userId)) as
    | { catalog_json: string | null; formulas_json: string | null; catalog_merge_version: string | null }
    | undefined;

  const defaults = defaultKitchenCatalogBundle();
  const hasCatalog = Boolean(row?.catalog_json);
  const hasFormulas = Boolean(row?.formulas_json);
  if (
    hasCatalog &&
    hasFormulas &&
    row?.catalog_merge_version === KITCHEN_CATALOG_MERGE_VERSION
  ) {
    const catalog = normalizeCatalogBundle(
      parseJson(row!.catalog_json, defaults.catalog),
      null,
      defaults,
    ).catalog;
    const formulas = normalizeCatalogBundle(
      null,
      parseJson(row!.formulas_json, defaults.formulas),
      defaults,
    ).formulas;
    return {
      giftBoxTypes: catalog.giftBoxTypes.map((g) => ({
        id: g.id,
        label: g.label,
        qtyKey: g.qtyKey,
        sortOrder: g.sortOrder ?? 0,
        active: g.active !== false,
      })),
      giftBoxBoms: formulas.giftBoxBoms,
    };
  }
  const bundle = await loadKitchenCatalog(userId);
  return {
    giftBoxTypes: bundle.catalog.giftBoxTypes.map((g) => ({
      id: g.id,
      label: g.label,
      qtyKey: g.qtyKey,
      sortOrder: g.sortOrder ?? 0,
      active: g.active !== false,
    })),
    giftBoxBoms: bundle.formulas.giftBoxBoms,
  };
}

/** Formulas + capacity labels for prep detail — one settings row read on the fast path. */
export async function readKitchenPrepDetailContext(userId: number): Promise<{
  formulas: KitchenFormulas;
  capacities: Array<{ id: string; label: string; sortOrder: number }>;
}> {
  await ensureSettingsRow(userId);
  const row = (await db
    .prepare(
      'SELECT catalog_json, formulas_json, catalog_merge_version FROM kitchen_settings WHERE user_id = ?',
    )
    .get(userId)) as
    | { catalog_json: string | null; formulas_json: string | null; catalog_merge_version: string | null }
    | undefined;

  const defaults = defaultKitchenCatalogBundle();
  const hasCatalog = Boolean(row?.catalog_json);
  const hasFormulas = Boolean(row?.formulas_json);
  if (
    hasCatalog &&
    hasFormulas &&
    row?.catalog_merge_version === KITCHEN_CATALOG_MERGE_VERSION
  ) {
    const catalog = normalizeCatalogBundle(
      parseJson(row!.catalog_json, defaults.catalog),
      null,
      defaults,
    ).catalog;
    const formulas = normalizeCatalogBundle(
      null,
      parseJson(row!.formulas_json, defaults.formulas),
      defaults,
    ).formulas;
    const capacities = [...catalog.capacities]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((c) => ({ id: c.id, label: c.label, sortOrder: c.sortOrder ?? 0 }));
    return { formulas, capacities };
  }

  const bundle = await loadKitchenCatalog(userId);
  const capacities = [...bundle.catalog.capacities]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => ({ id: c.id, label: c.label, sortOrder: c.sortOrder ?? 0 }));
  return { formulas: bundle.formulas, capacities };
}

const CAPACITY_OPTIONS_CACHE_TTL_MS = 60_000;
const capacityOptionsCache = new Map<
  number,
  { at: number; data: Array<{ id: string; label: string; sortOrder: number }> }
>();

export async function readKitchenCapacityOptions(
  userId: number,
): Promise<Array<{ id: string; label: string; sortOrder: number }>> {
  const cached = capacityOptionsCache.get(userId);
  if (cached && Date.now() - cached.at < CAPACITY_OPTIONS_CACHE_TTL_MS) {
    return cached.data;
  }

  await ensureSettingsRow(userId);
  const row = (await db
    .prepare('SELECT catalog_json FROM kitchen_settings WHERE user_id = ?')
    .get(userId)) as { catalog_json: string | null } | undefined;
  const defaults = defaultKitchenCatalogBundle();
  const catalog = row?.catalog_json
    ? normalizeCatalogBundle(parseJson(row.catalog_json, defaults.catalog), null, defaults).catalog
    : defaults.catalog;
  const data = [...catalog.capacities]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => ({ id: c.id, label: c.label, sortOrder: c.sortOrder ?? 0 }));
  capacityOptionsCache.set(userId, { at: Date.now(), data });
  return data;
}

const CATALOG_BUNDLE_CACHE_TTL_MS = 60_000;
const catalogBundleCache = new Map<number, { at: number; bundle: KitchenCatalogBundle }>();

export function invalidateKitchenCatalogBundleCache(userId?: number) {
  if (userId == null) catalogBundleCache.clear();
  else catalogBundleCache.delete(userId);
}

export async function loadKitchenCatalog(userId: number): Promise<KitchenCatalogBundle> {
  const cached = catalogBundleCache.get(userId);
  if (cached && Date.now() - cached.at < CATALOG_BUNDLE_CACHE_TTL_MS) {
    return cached.bundle;
  }

  await ensureSettingsRow(userId);
  const row = (await db
    .prepare(
      'SELECT catalog_json, formulas_json, catalog_merge_version FROM kitchen_settings WHERE user_id = ?'
    )
    .get(userId)) as
    | { catalog_json: string | null; formulas_json: string | null; catalog_merge_version: string | null }
    | undefined;

  const defaults = defaultKitchenCatalogBundle();
  const hasCatalog = Boolean(row?.catalog_json);
  const hasFormulas = Boolean(row?.formulas_json);

  let catalog = hasCatalog
    ? normalizeCatalogBundle(parseJson(row!.catalog_json, defaults.catalog), null, defaults).catalog
    : defaults.catalog;
  let formulas = hasFormulas
    ? normalizeCatalogBundle(null, parseJson(row!.formulas_json, defaults.formulas), defaults).formulas
    : defaults.formulas;

  if (
    hasCatalog &&
    hasFormulas &&
    row?.catalog_merge_version === KITCHEN_CATALOG_MERGE_VERSION
  ) {
    const bundle = { catalog, formulas };
    catalogBundleCache.set(userId, { at: Date.now(), bundle });
    return bundle;
  }

  const merged = await runCatalogMerges(userId, catalog, formulas, { hasCatalog, hasFormulas, row });
  catalogBundleCache.set(userId, { at: Date.now(), bundle: merged });
  return merged;
}

export async function saveKitchenCatalog(
  ownerId: number,
  isAdmin: boolean,
  patch: { catalog?: KitchenCatalog | null; formulas?: KitchenFormulas | null }
): Promise<{ error?: string; bundle?: KitchenCatalogBundle }> {
  if (!isAdmin) return { error: 'Only admin can update kitchen catalog' };

  const current = await loadKitchenCatalog(ownerId);
  const next = normalizeCatalogBundle(
    patch.catalog ?? current.catalog,
    patch.formulas ?? current.formulas,
    current
  );
  next.formulas = mergeSuiXinGiftBoxBoms(next.formulas);

  const err = validateKitchenCatalogBundle(next.catalog, next.formulas);
  if (err) return { error: err };

  await ensureSettingsRow(ownerId);
  await db
    .prepare(
      `UPDATE kitchen_settings
       SET catalog_json = ?, formulas_json = ?, catalog_merge_version = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    )
    .run(
      JSON.stringify(next.catalog),
      JSON.stringify(next.formulas),
      KITCHEN_CATALOG_MERGE_VERSION,
      ownerId
    );

  await ensureCatalogStockRows(ownerId, next.catalog);

  invalidateKitchenCatalogBundleCache(ownerId);
  capacityOptionsCache.delete(ownerId);
  stewFormulasCache.delete(ownerId);

  return { bundle: next };
}

/** Ensure stock rows exist for every catalog raw / finished SKU / gift box. */
export async function ensureCatalogStockRows(userId: number, catalog: KitchenCatalog) {
  const skus = finishedSkusFromCatalog(catalog);
  if (skus.length > 0) {
    const placeholders = skus.map(() => '(?, ?, 0)').join(', ');
    const params = skus.flatMap((sku) => [userId, sku]);
    await db
      .prepare(`INSERT OR IGNORE INTO kitchen_finished (user_id, sku, quantity) VALUES ${placeholders}`)
      .run(...params);
  }

  const boxes = catalog.giftBoxTypes;
  if (boxes.length > 0) {
    const placeholders = boxes.map(() => '(?, ?, 0)').join(', ');
    const params = boxes.flatMap((g) => [userId, g.id]);
    await db
      .prepare(`INSERT OR IGNORE INTO kitchen_gift_boxes (user_id, box_type, quantity) VALUES ${placeholders}`)
      .run(...params);
  }

  const raws = catalog.rawMaterials.filter((m) => !isUntrackedStewIngredient(m.name));
  if (raws.length > 0) {
    const placeholders = raws.map(() => '(?, ?, ?, ?, 0)').join(', ');
    const params = raws.flatMap((m) => [userId, m.name, m.unit, 0]);
    await db
      .prepare(
        `INSERT OR IGNORE INTO kitchen_raw (user_id, name, unit, total_stock, allocated_stock) VALUES ${placeholders}`
      )
      .run(...params);
  }

  const shippingIds = ['small', 'single', 'double', 'triple'];
  if (shippingIds.length > 0) {
    const placeholders = shippingIds.map(() => '(?, ?, 0)').join(', ');
    const params = shippingIds.flatMap((id) => [userId, id]);
    await db
      .prepare(`INSERT OR IGNORE INTO kitchen_shipping_boxes (user_id, box_id, quantity) VALUES ${placeholders}`)
      .run(...params);
  }

  const airCapIds = ['single', 'double'];
  if (airCapIds.length > 0) {
    const placeholders = airCapIds.map(() => '(?, ?, 0)').join(', ');
    const params = airCapIds.flatMap((id) => [userId, id]);
    await db
      .prepare(`INSERT OR IGNORE INTO kitchen_air_column_caps (user_id, cap_id, quantity) VALUES ${placeholders}`)
      .run(...params);
  }
}
