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
} from './kitchen-catalog';
import { expandGiftBoxBom, GIFT_BOX_BOMS } from './kitchen-bom';
import {
  computePrepCalculation,
  computeStewingRawNeeds,
  getFormulaLines,
  formulaFromLines,
  CAPACITY_FLAVOR_FORMULAS,
} from './kitchen-prep';

describe('kitchen catalog defaults', () => {
  it('seeds raw materials, gift boxes, and finished SKUs', () => {
    const catalog = defaultKitchenCatalog();
    expect(catalog.rawMaterials.map((m) => m.name)).toContain('燕餅');
    expect(catalog.giftBoxTypes.length).toBeGreaterThanOrEqual(9);
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
    expect(getStewFlavorFormula('25g', 'red_date', formulas.stewFormulas)).toBeNull();
    const lines = getFormulaLines(getStewFlavorFormula('45g', 'osmanthus', formulas.stewFormulas), 'osmanthus');
    expect(lines.find((l) => l.name === '燕餅')?.qty).toBe(0.8);
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
    expect(calc.totals.ingredientGrams['燕餅']).toBe(10);
    expect(calc.totals.birdNestGrams).toBe(10);
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
    expect(lines.find((l) => l.name === '玻璃燉瓶')?.qty).toBe(2);
    expect(lines.find((l) => l.name === '冰糖')?.qty).toBe(1);
  });

  it('allows remapping and fewer ingredients', () => {
    const custom = structuredClone(CAPACITY_FLAVOR_FORMULAS);
    custom['45g']!.osmanthus = formulaFromLines([
      { name: '燕餅', qty: 0.5 },
      { name: '紅棗', qty: 1 },
    ]);
    const lines = computeStewingRawNeeds('45g', [{ flavor: 'osmanthus', qty: 4 }], custom);
    expect(lines.find((l) => l.name === '紅棗')?.qty).toBe(4);
    expect(lines.find((l) => l.name === '桂花')).toBeUndefined();
    expect(lines).toHaveLength(2);
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
    const lines = getFormulaLines(cell, 'rock_sugar');
    expect(lines.find((l) => l.name === '冰糖')?.qty).toBe(3.57);
    expect(lines.find((l) => l.name === '燕餅')?.qty).toBe(0.8);
    const consumed = computeStewingRawNeeds(
      '45g',
      [{ flavor: 'rock_sugar', qty: 10 }],
      normalized.formulas.stewFormulas
    );
    expect(consumed.find((l) => l.name === '冰糖')?.qty).toBe(35.7);
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
