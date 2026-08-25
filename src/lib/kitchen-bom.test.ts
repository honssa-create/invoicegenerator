import { describe, expect, it } from 'vitest';
import {
  expandGiftBoxBom,
  checkBomAgainstStock,
  bomIsSufficient,
  aggregateBomDemand,
  reverseMovementDeltas,
  wouldGoNegative,
  applyBomQtyOverrides,
  bomLineKey,
  finishedSku,
  finishedSkuLabel,
  FINISHED_SKUS,
  giftNeedKey,
  giftBoxBomNeedsBirdNestChoice,
  type MovementDeltas,
  type StockMaps,
} from './kitchen-bom';
import { BIRD_NEST_FORMULA_PLACEHOLDER } from './kitchen-prep';

describe('expandGiftBoxBom', () => {
  it('expands 星空金 to 3 big-belly osmanthus per box', () => {
    const lines = expandGiftBoxBom('star_gold', 2);
    expect(lines).toEqual([
      { kind: 'finished', sku: finishedSku('75g_big_belly', 'osmanthus'), qty: 6 },
    ]);
  });

  it('expands 粉紅心意-桂花 to 75g rock sugar ×2 + osmanthus ×3', () => {
    const lines = expandGiftBoxBom('pink_osmanthus', 1);
    expect(lines).toEqual([
      { kind: 'finished', sku: finishedSku('75g', 'rock_sugar'), qty: 2 },
      { kind: 'finished', sku: finishedSku('75g', 'osmanthus'), qty: 3 },
    ]);
  });

  it('expands 隨心燉 7 using glass jar, 燕餅 placeholder and 冰糖 per portion', () => {
    const lines = expandGiftBoxBom('sui_xin_7', 1);
    expect(lines).toEqual([
      { kind: 'raw', name: '75g玻璃燉瓶(大肚)', qty: 2 },
      { kind: 'raw', name: BIRD_NEST_FORMULA_PLACEHOLDER, qty: 11.9 },
      { kind: 'raw', name: '冰糖', qty: 4.2 },
    ]);
    expect(giftBoxBomNeedsBirdNestChoice(lines)).toBe(true);
  });

  it('includes glass jar in all 隨心燉 pack sizes', () => {
    expect(
      expandGiftBoxBom('sui_xin_14', 1).some((l) => l.kind === 'raw' && l.name === '75g玻璃燉瓶(大肚)')
    ).toBe(true);
    expect(
      expandGiftBoxBom('sui_xin_18', 1).some((l) => l.kind === 'raw' && l.name === '75g玻璃燉瓶(大肚)')
    ).toBe(true);
  });

  it('scales 隨心燉 14 portions × qty', () => {
    const lines = expandGiftBoxBom('sui_xin_14', 2);
    expect(lines).toEqual([
      { kind: 'raw', name: '75g玻璃燉瓶(大肚)', qty: 8 },
      { kind: 'raw', name: BIRD_NEST_FORMULA_PLACEHOLDER, qty: 47.6 },
      { kind: 'raw', name: '冰糖', qty: 16.8 },
    ]);
  });

  it('applies packaging qty overrides for batch variance', () => {
    const defaults = expandGiftBoxBom('sui_xin_7', 1);
    const { lines, error } = applyBomQtyOverrides(defaults, {
      [bomLineKey({ kind: 'raw', name: BIRD_NEST_FORMULA_PLACEHOLDER, qty: 0 })]: 12.1,
      [bomLineKey({ kind: 'raw', name: '冰糖', qty: 0 })]: 4.0,
    });
    expect(error).toBeUndefined();
    expect(lines).toEqual([
      { kind: 'raw', name: '75g玻璃燉瓶(大肚)', qty: 2 },
      { kind: 'raw', name: BIRD_NEST_FORMULA_PLACEHOLDER, qty: 12.1 },
      { kind: 'raw', name: '冰糖', qty: 4 },
    ]);
  });

  it('expands 秋燕飛躍 to 75g tall bottles: 2 rock sugar + 3 osmanthus + 3 red date', () => {
    const lines = expandGiftBoxBom('qiu_yan_fei_yue', 1);
    expect(lines).toEqual([
      { kind: 'finished', sku: finishedSku('75g', 'rock_sugar'), qty: 2 },
      { kind: 'finished', sku: finishedSku('75g', 'osmanthus'), qty: 3 },
      { kind: 'finished', sku: finishedSku('75g', 'red_date'), qty: 3 },
    ]);
  });

  it('expands 柔潤分享時光盒 to 45g rock sugar ×3 + osmanthus ×3', () => {
    const lines = expandGiftBoxBom('rou_run_share_box', 2);
    expect(lines).toEqual([
      { kind: 'finished', sku: finishedSku('45g', 'rock_sugar'), qty: 6 },
      { kind: 'finished', sku: finishedSku('45g', 'osmanthus'), qty: 6 },
    ]);
  });

  it('expands Trial Set to 45g one of each flavor', () => {
    const lines = expandGiftBoxBom('trial_set', 3);
    expect(lines).toEqual([
      { kind: 'finished', sku: finishedSku('45g', 'rock_sugar'), qty: 3 },
      { kind: 'finished', sku: finishedSku('45g', 'osmanthus'), qty: 3 },
      { kind: 'finished', sku: finishedSku('45g', 'red_date'), qty: 3 },
    ]);
  });

  it('checkBomAgainstStock resolves 燕餅 to selected bird nest stock', () => {
    const lines = expandGiftBoxBom('sui_xin_7', 1);
    const stock = {
      finished: {},
      raw: { 大燕餅: 5, 細燕餅: 20, 冰糖: 10, '75g玻璃燉瓶(大肚)': 5 },
      giftBoxes: {},
    };
    const large = checkBomAgainstStock(lines, stock, { birdNestType: 'large' });
    const small = checkBomAgainstStock(lines, stock, { birdNestType: 'small' });
    const birdLine = (checks: ReturnType<typeof checkBomAgainstStock>) =>
      checks.find((c) => c.key === BIRD_NEST_FORMULA_PLACEHOLDER)!;
    expect(birdLine(large).label).toBe('大燕餅');
    expect(birdLine(large).enough).toBe(false);
    expect(birdLine(small).label).toBe('細燕餅');
    expect(birdLine(small).enough).toBe(true);
  });

  it('consumes admin-selected jar size from BOM', () => {
    const customBom = {
      sui_xin_7: [
        { kind: 'raw' as const, name: '45g玻璃燉瓶', qty: 2 },
        { kind: 'raw' as const, name: '大燕餅', qty: 11.9 },
        { kind: 'raw' as const, name: '冰糖', qty: 4.2 },
      ],
    };
    const checks = checkBomAgainstStock(expandGiftBoxBom('sui_xin_7', 1, customBom), {
      finished: {},
      raw: { '45g玻璃燉瓶': 5, 大燕餅: 20, 冰糖: 10 },
      giftBoxes: {},
    });
    expect(checks.find((c) => c.label === '45g玻璃燉瓶')?.enough).toBe(true);
  });

  it('rejects negative packaging overrides', () => {
    const defaults = expandGiftBoxBom('sui_xin_7', 1);
    const { error } = applyBomQtyOverrides(defaults, { [`raw:${BIRD_NEST_FORMULA_PLACEHOLDER}`]: -1 });
    expect(error).toMatch(/無效/);
  });

  it('resolves legacy 玻璃燉瓶 to 75g大肚 stock with variant label', () => {
    const checks = checkBomAgainstStock(
      [{ kind: 'raw', name: '玻璃燉瓶', qty: 2 }],
      { finished: {}, raw: { '75g玻璃燉瓶(大肚)': 5 }, giftBoxes: {} }
    );
    expect(checks[0].label).toBe('75g玻璃燉瓶(大肚)');
    expect(checks[0].enough).toBe(true);
  });

  it('returns empty for unknown type or zero qty', () => {
    expect(expandGiftBoxBom('nope', 1)).toEqual([]);
    expect(expandGiftBoxBom('star_gold', 0)).toEqual([]);
  });

  it('treats empty BOM checks as insufficient', () => {
    expect(bomIsSufficient([])).toBe(false);
  });
});

describe('stock sufficiency', () => {
  const stock: StockMaps = {
    finished: {
      [finishedSku('75g_big_belly', 'osmanthus')]: 5,
      [finishedSku('75g', 'rock_sugar')]: 10,
    },
    raw: { '75g玻璃燉瓶(大肚)': 8, 大燕餅: 20, 冰糖: 20 },
    giftBoxes: { star_gold: 0 },
  };

  it('reports enough when stock covers BOM', () => {
    const checks = checkBomAgainstStock(expandGiftBoxBom('star_gold', 1), stock);
    expect(bomIsSufficient(checks)).toBe(true);
    expect(checks[0].have).toBe(5);
    expect(checks[0].need).toBe(3);
  });

  it('reports insufficient when short', () => {
    const checks = checkBomAgainstStock(expandGiftBoxBom('star_gold', 2), stock);
    expect(bomIsSufficient(checks)).toBe(false);
  });

  it('aggregates multi-line demand', () => {
    const agg = aggregateBomDemand(expandGiftBoxBom('pink_osmanthus', 2));
    expect(agg.finished[finishedSku('75g', 'rock_sugar')]).toBe(4);
    expect(agg.finished[finishedSku('75g', 'osmanthus')]).toBe(6);
  });
});

describe('void reverse math', () => {
  it('negates all deltas including fulfillments', () => {
    const d: MovementDeltas = {
      giftBoxDeltas: [{ boxType: 'star_gold', delta: 1 }],
      finishedDeltas: [{ sku: finishedSku('75g_big_belly', 'osmanthus'), delta: -3 }],
      rawDeltas: [{ name: '桂花', delta: 100 }],
      fulfillments: [{ orderId: 9, needKey: giftNeedKey('star_gold'), qty: 1 }],
    };
    const rev = reverseMovementDeltas(d);
    expect(rev.giftBoxDeltas[0].delta).toBe(-1);
    expect(rev.finishedDeltas[0].delta).toBe(3);
    expect(rev.rawDeltas[0].delta).toBe(-100);
    expect(rev.fulfillments[0].qty).toBe(-1);
  });

  it('detects negative gift stock on void', () => {
    const stock: StockMaps = {
      finished: { [finishedSku('75g_big_belly', 'osmanthus')]: 10 },
      raw: {},
      giftBoxes: { star_gold: 0 },
    };
    const rev = reverseMovementDeltas({
      giftBoxDeltas: [{ boxType: 'star_gold', delta: 1 }],
      finishedDeltas: [{ sku: finishedSku('75g_big_belly', 'osmanthus'), delta: -3 }],
      rawDeltas: [],
      fulfillments: [],
    });
    // void of make_gift: reverse gift +1 → -1 on stock of 0
    expect(wouldGoNegative(rev, stock)).toMatch(/禮盒/);
  });

  it('allows void when stock covers reverse', () => {
    const stock: StockMaps = {
      finished: { [finishedSku('75g_big_belly', 'osmanthus')]: 0 },
      raw: {},
      giftBoxes: { star_gold: 1 },
    };
    const rev = reverseMovementDeltas({
      giftBoxDeltas: [{ boxType: 'star_gold', delta: 1 }],
      finishedDeltas: [{ sku: finishedSku('75g_big_belly', 'osmanthus'), delta: -3 }],
      rawDeltas: [],
      fulfillments: [],
    });
    expect(wouldGoNegative(rev, stock)).toBeNull();
  });
});

describe('finished bottle catalog', () => {
  it('lists 12 SKUs in catalog order with Chinese labels', () => {
    expect(FINISHED_SKUS).toHaveLength(12);
    expect(FINISHED_SKUS.map(finishedSkuLabel)).toEqual([
      '25g 桂花',
      '25g 紅棗',
      '25g 冰糖',
      '45g 桂花',
      '45g 紅棗',
      '45g 冰糖',
      '75g 桂花 (大肚樽)',
      '75g 紅棗 (大肚樽)',
      '75g 冰糖 (大肚樽)',
      '75g 桂花 (高身樽)',
      '75g 紅棗 (高身樽)',
      '75g 冰糖 (高身樽)',
    ]);
  });
});
