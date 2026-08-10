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
  type MovementDeltas,
  type StockMaps,
} from './kitchen-bom';

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

  it('expands 隨心燉 7 using 1.7g 燕餅 and 0.6g 冰糖 per portion', () => {
    const lines = expandGiftBoxBom('sui_xin_7', 1);
    expect(lines).toEqual([
      { kind: 'raw', name: '玻璃燉瓶', qty: 2 },
      { kind: 'raw', name: '燕餅', qty: 11.9 },
      { kind: 'raw', name: '冰糖', qty: 4.2 },
    ]);
  });

  it('scales 隨心燉 14 portions × qty', () => {
    const lines = expandGiftBoxBom('sui_xin_14', 2);
    expect(lines).toEqual([
      { kind: 'raw', name: '燕餅', qty: 47.6 },
      { kind: 'raw', name: '冰糖', qty: 16.8 },
    ]);
  });

  it('applies packaging qty overrides for batch variance', () => {
    const defaults = expandGiftBoxBom('sui_xin_7', 1);
    const { lines, error } = applyBomQtyOverrides(defaults, {
      [bomLineKey({ kind: 'raw', name: '燕餅', qty: 0 })]: 12.1,
      [bomLineKey({ kind: 'raw', name: '冰糖', qty: 0 })]: 4.0,
    });
    expect(error).toBeUndefined();
    expect(lines).toEqual([
      { kind: 'raw', name: '玻璃燉瓶', qty: 2 },
      { kind: 'raw', name: '燕餅', qty: 12.1 },
      { kind: 'raw', name: '冰糖', qty: 4 },
    ]);
  });

  it('rejects negative packaging overrides', () => {
    const defaults = expandGiftBoxBom('sui_xin_7', 1);
    const { error } = applyBomQtyOverrides(defaults, { 'raw:燕餅': -1 });
    expect(error).toMatch(/無效/);
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
    raw: { 玻璃燉瓶: 2, 燕餅: 20, 冰糖: 20 },
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
