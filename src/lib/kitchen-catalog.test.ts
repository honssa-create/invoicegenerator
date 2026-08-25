import { describe, expect, it } from 'vitest';
import {
  defaultKitchenCatalog,
  defaultKitchenFormulas,
  defaultKitchenCatalogBundle,
  finishedSkusFromCatalog,
  expandGiftBoxBomFrom,
  normalizeCatalogBundle,
  validateKitchenCatalogBundle,
  getStewFlavorFormula,
  giftBoxQtyKey,
  uniqueCatalogId,
  mergeCatalogGiftBoxTypes,
  mergeSuiXinGiftBoxBoms,
  mergeStewWaterFormulaLines,
  giftBoxBomRawOptions,
} from './kitchen-catalog';
import { expandGiftBoxBom, GIFT_BOX_BOMS } from './kitchen-bom';
import {
  computePrepCalculation,
  computeStewingRawNeeds,
  getFormulaLines,
  formulaFromLines,
  CAPACITY_FLAVOR_FORMULAS,
  STEW_WATER_BOIL_SUGAR,
  STEW_WATER_COLD_SOAK,
  BIRD_NEST_FORMULA_PLACEHOLDER,
} from './kitchen-prep';

describe('kitchen catalog defaults', () => {
  it('seeds raw materials, gift boxes, and finished SKUs', () => {
    const catalog = defaultKitchenCatalog();
    expect(catalog.rawMaterials.map((m) => m.name)).toContain('大燕餅');
    expect(catalog.rawMaterials.map((m) => m.name)).toContain('細燕餅');
    expect(catalog.rawMaterials.map((m) => m.name)).toContain(STEW_WATER_BOIL_SUGAR);
    expect(catalog.rawMaterials.map((m) => m.name)).toContain(STEW_WATER_COLD_SOAK);
    expect(catalog.rawMaterials.find((m) => m.name === STEW_WATER_BOIL_SUGAR)?.unit).toBe('g');
    expect(catalog.rawMaterials.map((m) => m.name)).toContain('25g玻璃燉瓶');
    expect(catalog.rawMaterials.map((m) => m.name)).toContain('75g玻璃燉瓶(大肚)');
    expect(catalog.giftBoxTypes.length).toBeGreaterThanOrEqual(12);
    expect(finishedSkusFromCatalog(catalog)).toHaveLength(12);
    expect(giftBoxQtyKey('star_gold')).toBe('nestiee_gift_qty_star_gold');
  });

  it('uniqueCatalogId auto-generates and avoids collisions', () => {
    expect(uniqueCatalogId('box', ['star_gold'])).toBe('box_1');
    expect(uniqueCatalogId('box', ['box_1', 'box_2'])).toBe('box_3');
    expect(uniqueCatalogId('cap', ['25g', '45g'], '75g Big')).toBe('75g_big');
    expect(uniqueCatalogId('cap', ['75g_big'], '75g Big')).toBe('75g_big_2');
  });

  it('default formulas use variable ingredient lines', () => {
    const formulas = defaultKitchenFormulas();
    expect(formulas.giftBoxBoms.star_gold).toEqual(GIFT_BOX_BOMS.star_gold);
    expect(formulas.giftBoxBoms.sui_xin_7?.[0]).toEqual({
      kind: 'raw',
      name: '75g玻璃燉瓶(大肚)',
      qty: 2,
    });
    expect(getStewFlavorFormula('25g', 'red_date', formulas.stewFormulas)).toBeNull();
    const lines = getFormulaLines(getStewFlavorFormula('45g', 'osmanthus', formulas.stewFormulas), 'osmanthus');
    expect(lines.find((l) => l.name === '燕餅')?.qty).toBe(0.8);
    expect(lines.some((l) => l.name === STEW_WATER_BOIL_SUGAR)).toBe(true);
    expect(lines.some((l) => l.name === STEW_WATER_COLD_SOAK)).toBe(true);
  });

  it('mergeStewWaterFormulaLines adds water lines to saved stew formulas', () => {
    const formulas = defaultKitchenFormulas();
    const cell = formulas.stewFormulas['45g']!.rock_sugar!;
    formulas.stewFormulas['45g']!.rock_sugar = formulaFromLines(
      getFormulaLines(cell, 'rock_sugar').filter(
        (l) => l.name !== STEW_WATER_BOIL_SUGAR && l.name !== STEW_WATER_COLD_SOAK
      )
    );
    const merged = mergeStewWaterFormulaLines(formulas);
    const lines = getFormulaLines(merged.stewFormulas['45g']!.rock_sugar!, 'rock_sugar');
    expect(lines.some((l) => l.name === STEW_WATER_BOIL_SUGAR)).toBe(true);
    expect(lines.some((l) => l.name === STEW_WATER_COLD_SOAK)).toBe(false);
  });

  it('mergeCatalogGiftBoxTypes appends missing default gift boxes and BOMs', () => {
    const bundle = defaultKitchenCatalogBundle();
    bundle.catalog.giftBoxTypes = bundle.catalog.giftBoxTypes.filter(
      (g) => !['qiu_yan_fei_yue', 'rou_run_share_box', 'trial_set'].includes(g.id)
    );
    delete bundle.formulas.giftBoxBoms.qiu_yan_fei_yue;
    delete bundle.formulas.giftBoxBoms.rou_run_share_box;
    delete bundle.formulas.giftBoxBoms.trial_set;

    const merged = mergeCatalogGiftBoxTypes(bundle);
    expect(merged.catalog.giftBoxTypes.map((g) => g.id)).toContain('qiu_yan_fei_yue');
    expect(merged.catalog.giftBoxTypes.map((g) => g.id)).toContain('rou_run_share_box');
    expect(merged.catalog.giftBoxTypes.map((g) => g.id)).toContain('trial_set');
    expect(merged.formulas.giftBoxBoms.qiu_yan_fei_yue).toEqual(GIFT_BOX_BOMS.qiu_yan_fei_yue);
    expect(merged.formulas.giftBoxBoms.trial_set).toEqual(GIFT_BOX_BOMS.trial_set);
  });

  it('mergeSuiXinGiftBoxBoms adds glass jar and migrates legacy name', () => {
    const formulas = defaultKitchenFormulas();
    formulas.giftBoxBoms.sui_xin_7 = [
      { kind: 'raw', name: '玻璃燉瓶', qty: 2 },
      { kind: 'raw', name: '大燕餅', qty: 11.9 },
      { kind: 'raw', name: '冰糖', qty: 4.2 },
    ];
    const merged = mergeSuiXinGiftBoxBoms(formulas);
    expect(merged.giftBoxBoms.sui_xin_7![0].name).toBe('75g玻璃燉瓶(大肚)');
    expect(merged.giftBoxBoms.sui_xin_7!.some((l) => l.kind === 'raw' && l.name === BIRD_NEST_FORMULA_PLACEHOLDER)).toBe(true);

    formulas.giftBoxBoms.sui_xin_14 = [
      { kind: 'raw', name: '大燕餅', qty: 23.8 },
      { kind: 'raw', name: '冰糖', qty: 8.4 },
    ];
    const merged2 = mergeSuiXinGiftBoxBoms(formulas);
    expect(
      merged2.giftBoxBoms.sui_xin_14!.some((l) => l.kind === 'raw' && l.name === '75g玻璃燉瓶(大肚)')
    ).toBe(true);
  });

  it('giftBoxBomRawOptions lists jar sizes first', () => {
    const catalog = defaultKitchenCatalog();
    const opts = giftBoxBomRawOptions(catalog);
    expect(opts.slice(0, 4)).toEqual([
      '25g玻璃燉瓶',
      '45g玻璃燉瓶',
      '75g玻璃燉瓶(高身)',
      '75g玻璃燉瓶(大肚)',
    ]);
  });

  it('validate accepts default stew formulas with 燕餅 placeholder', () => {
    const bundle = defaultKitchenCatalogBundle();
    expect(validateKitchenCatalogBundle(bundle.catalog, bundle.formulas)).toBeNull();
  });

  it('validate rejects BOM referencing unknown raw', () => {
    const bundle = defaultKitchenCatalogBundle();
    bundle.formulas.giftBoxBoms.star_gold = [{ kind: 'raw', name: '不存在', qty: 1 }];
    expect(validateKitchenCatalogBundle(bundle.catalog, bundle.formulas)).toMatch(/未知原料/);
  });

  it('normalize fills qtyKey and preserves custom BOM expand', () => {
    const normalized = normalizeCatalogBundle(
      {
        giftBoxTypes: [{ id: 'custom_box', label: '自訂', qtyKey: '', sortOrder: 0, active: true }],
      },
      {
        giftBoxBoms: {
          custom_box: [{ kind: 'finished', sku: '75g|osmanthus', qty: 2 }],
        },
      }
    );
    expect(normalized.catalog.giftBoxTypes[0].qtyKey).toBe('nestiee_gift_qty_custom_box');
    const lines = expandGiftBoxBomFrom(normalized.formulas.giftBoxBoms, 'custom_box', 3);
    expect(lines).toEqual([{ kind: 'finished', sku: '75g|osmanthus', qty: 6 }]);
    expect(expandGiftBoxBom('custom_box', 3, normalized.formulas.giftBoxBoms)).toEqual(lines);
  });
});

describe('stew variable ingredient lines', () => {
  it('computePrepCalculation totals ingredientGrams from lines', () => {
    const custom = structuredClone(CAPACITY_FLAVOR_FORMULAS);
    custom['45g']!.osmanthus = formulaFromLines([{ name: '燕餅', qty: 1 }]);
    const calc = computePrepCalculation(
      '45g',
      'daily',
      { osmanthus: 10, red_date: 0, rock_sugar: 0 },
      custom
    );
    expect(calc.totals.ingredientGrams['大燕餅']).toBe(10);
    expect(calc.totals.birdNestGrams).toBe(10);
  });

  it('maps bird nest formula slot to 細燕餅 when selected', () => {
    const custom = structuredClone(CAPACITY_FLAVOR_FORMULAS);
    custom['45g']!.osmanthus = formulaFromLines([{ name: '燕餅', qty: 1 }]);
    const calc = computePrepCalculation(
      '45g',
      'daily',
      { osmanthus: 10, red_date: 0, rock_sugar: 0 },
      custom,
      null,
      { osmanthus: 'small' }
    );
    expect(calc.totals.ingredientGrams['細燕餅']).toBe(10);
    expect(calc.totals.ingredientGrams['大燕餅']).toBeUndefined();
  });

  it('adds one capacity-specific glass jar per actual stew bottle', () => {
    const calc = computePrepCalculation('25g', 'daily', {
      osmanthus: 0,
      red_date: 0,
      rock_sugar: 10,
    });
    expect(calc.totals.ingredientGrams['25g玻璃燉瓶']).toBe(10);
    expect(calc.totals.ingredientGrams['45g玻璃燉瓶']).toBeUndefined();

    const calc75 = computePrepCalculation('75g_big_belly', 'daily', {
      osmanthus: 3,
      red_date: 0,
      rock_sugar: 0,
    });
    expect(calc75.totals.ingredientGrams['75g玻璃燉瓶(大肚)']).toBe(3);
  });

  it('supports more than 4 ingredients per bottle', () => {
    const custom = structuredClone(CAPACITY_FLAVOR_FORMULAS);
    custom['45g']!.osmanthus = formulaFromLines([
      { name: '燕餅', qty: 1 },
      { name: '桂花', qty: 0.1 },
      { name: '片糖', qty: 2 },
      { name: '冰糖', qty: 0.5 },
      { name: '玻璃燉瓶', qty: 1 },
    ]);
    const lines = computeStewingRawNeeds('45g', [{ flavor: 'osmanthus', qty: 2 }], custom);
    expect(lines).toHaveLength(5);
    expect(lines.find((l) => l.name === '45g玻璃燉瓶')?.qty).toBe(2);
    expect(lines.find((l) => l.name === '冰糖')?.qty).toBe(1);
  });

  it('allows remapping and fewer ingredients', () => {
    const custom = structuredClone(CAPACITY_FLAVOR_FORMULAS);
    custom['45g']!.osmanthus = formulaFromLines([
      { name: '燕餅', qty: 0.5 },
      { name: '紅棗', qty: 1 },
    ]);
    const lines = computeStewingRawNeeds('45g', [{ flavor: 'osmanthus', qty: 4 }], custom);
    expect(lines.find((l) => l.name === '大燕餅')?.qty).toBe(2);
    expect(lines.find((l) => l.name === '紅棗')?.qty).toBe(4);
    expect(lines.find((l) => l.name === '桂花')).toBeUndefined();
    expect(lines.find((l) => l.name === '45g玻璃燉瓶')?.qty).toBe(4);
    expect(lines).toHaveLength(3);
  });

  it('does not include untracked stew water in raw needs', () => {
    const custom = structuredClone(CAPACITY_FLAVOR_FORMULAS);
    custom['45g']!.osmanthus = formulaFromLines([
      { name: '燕餅', qty: 0.8 },
      { name: STEW_WATER_BOIL_SUGAR, qty: 50 },
      { name: STEW_WATER_COLD_SOAK, qty: 30 },
    ]);
    const lines = computeStewingRawNeeds('45g', [{ flavor: 'osmanthus', qty: 2 }], custom);
    expect(lines.find((l) => l.name === STEW_WATER_BOIL_SUGAR)).toBeUndefined();
    expect(lines.find((l) => l.name === STEW_WATER_COLD_SOAK)).toBeUndefined();
    expect(lines.find((l) => l.name === '大燕餅')?.qty).toBeCloseTo(1.6, 5);
  });

  it('sanitize migrates legacy slot formulas to lines', () => {
    const normalized = normalizeCatalogBundle(null, {
      stewFormulas: {
        '45g': {
          rock_sugar: {
            birdNest: 0.8,
            flavorIngredient: 3.57,
            rockSugar: 3.57,
            slabSugar: 0,
            flavorIngredientName: '冰糖',
            rockSugarIngredient: '冰糖',
          },
        },
      },
    });
    const cell = normalized.formulas.stewFormulas['45g']!.rock_sugar!;
    const formulaLines = getFormulaLines(cell, 'rock_sugar');
    expect(formulaLines.find((l) => l.name === '冰糖')?.qty).toBe(3.57);
    expect(formulaLines.find((l) => l.name === '燕餅')?.qty).toBe(0.8);
    const consumed = computeStewingRawNeeds(
      '45g',
      [{ flavor: 'rock_sugar', qty: 10 }],
      normalized.formulas.stewFormulas
    );
    expect(consumed.find((l) => l.name === '冰糖')?.qty).toBe(35.7);
    expect(consumed.find((l) => l.name === '大燕餅')?.qty).toBe(8);
  });
});

describe('adjust-stock delta shape', () => {
  it('absolute set delta equals to - from', () => {
    const from = 12;
    const to = 20;
    const delta = to - from;
    expect(delta).toBe(8);
    expect(-delta).toBe(-8);
  });
});
