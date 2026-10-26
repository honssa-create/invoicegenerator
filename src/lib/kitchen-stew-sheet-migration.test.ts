import { beforeEach, describe, expect, it } from 'vitest';
import db from './db';
import { formulaFromLines, getFormulaLines } from './kitchen-prep';
import { defaultKitchenCatalogBundle } from './kitchen-catalog';
import {
  KITCHEN_CATALOG_MERGE_VERSION,
  invalidateKitchenCatalogBundleCache,
  loadKitchenCatalog,
  stewFormulaSheetMigrationKey,
} from './kitchen-catalog-server';

const USER = 99981;

beforeEach(async () => {
  invalidateKitchenCatalogBundleCache(USER);
  await db.prepare('DELETE FROM app_migrations WHERE key = ?').run(stewFormulaSheetMigrationKey(USER));
  await db.prepare('DELETE FROM kitchen_settings WHERE user_id = ?').run(USER);
  await db.prepare('DELETE FROM users WHERE id = ?').run(USER);
  await db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
    USER,
    `stew-sheet-${USER}@example.com`,
    'hash',
    'Stew Sheet'
  );
});

describe('stew formula sheet migration', () => {
  it('replaces saved grams once and leaves a later edit in place', async () => {
    const bundle = defaultKitchenCatalogBundle();
    const thick = bundle.catalog.capacities.find((c) => c.id === '75g');
    const thin = bundle.catalog.capacities.find((c) => c.id === '75g_big_belly');
    if (!thick || !thin) throw new Error('missing 75g capacities');
    thick.label = '75g (高身樽)';
    thick.active = true;
    thin.label = '75g (大肚樽)';
    bundle.catalog.finishedLabels['75g|osmanthus'] = '75g 桂花 (高身樽)';
    bundle.catalog.finishedLabels['75g_big_belly|osmanthus'] = '75g 桂花 (大肚樽)';
    bundle.formulas.stewFormulas['25g']!.osmanthus = formulaFromLines([
      { name: '燕餅', qty: 0.4 },
      { name: '桂花', qty: 0.072 },
      { name: '片糖', qty: 2.79 },
    ]);
    bundle.formulas.giftBoxBoms.star_gold = [{ kind: 'finished', sku: '75g_big_belly|osmanthus', qty: 9 }];

    await db
      .prepare(
        `INSERT INTO kitchen_settings (user_id, holiday_mode, catalog_json, formulas_json, catalog_merge_version)
         VALUES (?, 0, ?, ?, ?)`
      )
      .run(USER, JSON.stringify(bundle.catalog), JSON.stringify(bundle.formulas), '2026-08-v3');

    const loaded = await loadKitchenCatalog(USER);
    expect(loaded.catalog.capacities.find((c) => c.id === '75g')).toMatchObject({
      label: '75g 厚',
      active: false,
    });
    expect(loaded.catalog.capacities.find((c) => c.id === '75g_big_belly')).toMatchObject({
      label: '75g 薄',
      active: true,
    });
    const osmanthus = getFormulaLines(loaded.formulas.stewFormulas['25g']!.osmanthus!, 'osmanthus');
    expect(osmanthus.find((l) => l.name === '桂花')?.qty).toBeCloseTo(0.056, 3);
    expect(osmanthus.find((l) => l.name === '片糖')?.qty).toBeCloseTo(2.25, 3);
    expect(osmanthus.some((l) => l.name === '水(煮糖)')).toBe(true);
    expect(loaded.formulas.giftBoxBoms.star_gold).toEqual([
      { kind: 'finished', sku: '75g_big_belly|osmanthus', qty: 9 },
    ]);
    expect(loaded.catalog.finishedLabels['75g|osmanthus']).toBe('75g 桂花 (厚)');
    expect(loaded.catalog.finishedLabels['75g_big_belly|osmanthus']).toBe('75g 桂花 (薄)');

    const row = (await db
      .prepare('SELECT catalog_merge_version FROM kitchen_settings WHERE user_id = ?')
      .get(USER)) as { catalog_merge_version: string };
    expect(row.catalog_merge_version).toBe(KITCHEN_CATALOG_MERGE_VERSION);
    const marker = await db
      .prepare('SELECT key FROM app_migrations WHERE key = ?')
      .get(stewFormulaSheetMigrationKey(USER));
    expect(marker).toBeTruthy();

    const saved = (await db
      .prepare('SELECT formulas_json FROM kitchen_settings WHERE user_id = ?')
      .get(USER)) as { formulas_json: string };
    const edited = JSON.parse(saved.formulas_json);
    const lines = edited.stewFormulas['25g'].osmanthus.lines as { name: string; qty: number }[];
    const flower = lines.find((l) => l.name === '桂花');
    if (!flower) throw new Error('missing 桂花 line');
    flower.qty = 9.99;
    await db
      .prepare(
        `UPDATE kitchen_settings SET formulas_json = ?, catalog_merge_version = ? WHERE user_id = ?`
      )
      .run(JSON.stringify(edited), '2026-08-v3', USER);
    invalidateKitchenCatalogBundleCache(USER);

    const again = await loadKitchenCatalog(USER);
    const kept = getFormulaLines(again.formulas.stewFormulas['25g']!.osmanthus!, 'osmanthus');
    expect(kept.find((l) => l.name === '桂花')?.qty).toBeCloseTo(9.99, 3);
  });
});
