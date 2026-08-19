/** Server-side kitchen catalog load/save (org-scoped in kitchen_settings). */

import db from './db';
import {
  defaultKitchenCatalogBundle,
  normalizeCatalogBundle,
  validateKitchenCatalogBundle,
  finishedSkusFromCatalog,
  type KitchenCatalog,
  type KitchenCatalogBundle,
  type KitchenFormulas,
} from './kitchen-catalog';

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

/**
 * Load effective catalog + formulas for an org. Seeds JSON columns from code defaults
 * when null so subsequent reads are stable.
 */
export async function loadKitchenCatalog(userId: number): Promise<KitchenCatalogBundle> {
  await ensureSettingsRow(userId);
  const row = (await db
    .prepare('SELECT catalog_json, formulas_json FROM kitchen_settings WHERE user_id = ?')
    .get(userId)) as { catalog_json: string | null; formulas_json: string | null } | undefined;

  const defaults = defaultKitchenCatalogBundle();
  const hasCatalog = Boolean(row?.catalog_json);
  const hasFormulas = Boolean(row?.formulas_json);

  const catalog = hasCatalog
    ? normalizeCatalogBundle(parseJson(row!.catalog_json, defaults.catalog), null, defaults).catalog
    : defaults.catalog;
  const formulas = hasFormulas
    ? normalizeCatalogBundle(null, parseJson(row!.formulas_json, defaults.formulas), defaults)
        .formulas
    : defaults.formulas;

  if (!hasCatalog || !hasFormulas) {
    await db
      .prepare(
        `UPDATE kitchen_settings
         SET catalog_json = COALESCE(catalog_json, ?),
             formulas_json = COALESCE(formulas_json, ?),
             updated_at = datetime('now')
         WHERE user_id = ?`
      )
      .run(
        hasCatalog ? row!.catalog_json : JSON.stringify(defaults.catalog),
        hasFormulas ? row!.formulas_json : JSON.stringify(defaults.formulas),
        userId
      );
  }

  return { catalog, formulas };
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

  const err = validateKitchenCatalogBundle(next.catalog, next.formulas);
  if (err) return { error: err };

  await ensureSettingsRow(ownerId);
  await db
    .prepare(
      `UPDATE kitchen_settings
       SET catalog_json = ?, formulas_json = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    )
    .run(JSON.stringify(next.catalog), JSON.stringify(next.formulas), ownerId);

  await ensureCatalogStockRows(ownerId, next.catalog);

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

  const raws = catalog.rawMaterials;
  if (raws.length > 0) {
    const placeholders = raws.map(() => '(?, ?, ?, ?, 0)').join(', ');
    const params = raws.flatMap((m) => [userId, m.name, m.unit, 0]);
    await db
      .prepare(
        `INSERT OR IGNORE INTO kitchen_raw (user_id, name, unit, total_stock, allocated_stock) VALUES ${placeholders}`
      )
      .run(...params);
  }

  for (const m of raws) {
    await db
      .prepare('UPDATE kitchen_raw SET unit = ? WHERE user_id = ? AND name = ?')
      .run(m.unit, userId, m.name);
  }
}
