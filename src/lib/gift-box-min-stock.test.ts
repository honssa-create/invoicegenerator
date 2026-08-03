import { describe, expect, it } from 'vitest';
import { giftBoxTopUpQty, giftBoxMinStock, GIFT_BOX_MIN_STOCK, GIFT_BOX_MIN_STOCK_HOLIDAY } from './kitchen';
import { expandGiftBoxBom, finishedShortfallsByCapacity, finishedSku } from './kitchen-bom';
import { defaultPrepStatusForCreate } from './kitchen-prep';

describe('giftBoxTopUpQty', () => {
  it('returns 0 when at or above minimum', () => {
    expect(giftBoxTopUpQty(GIFT_BOX_MIN_STOCK)).toBe(0);
    expect(giftBoxTopUpQty(GIFT_BOX_MIN_STOCK + 5)).toBe(0);
  });

  it('returns shortfall when below minimum', () => {
    expect(giftBoxTopUpQty(0)).toBe(10);
    expect(giftBoxTopUpQty(7)).toBe(3);
  });

  it('uses holiday minimum when provided', () => {
    expect(giftBoxMinStock(true)).toBe(GIFT_BOX_MIN_STOCK_HOLIDAY);
    expect(giftBoxTopUpQty(10, giftBoxMinStock(true))).toBe(10);
    expect(giftBoxTopUpQty(20, giftBoxMinStock(true))).toBe(0);
  });
});

describe('defaultPrepStatusForCreate restock', () => {
  it('defaults restock to in_prep', () => {
    expect(defaultPrepStatusForCreate('restock', '2099-01-01')).toBe('in_prep');
    expect(defaultPrepStatusForCreate('restock', '2020-01-01')).toBe('in_prep');
  });
});

describe('finishedShortfallsByCapacity', () => {
  it('groups finished shortfalls by capacity for gift-box BOM', () => {
    const lines = expandGiftBoxBom('star_gold', 4); // 4 × 3 = 12 of 75g_big_belly osmanthus
    const stock = {
      [finishedSku('75g_big_belly', 'osmanthus')]: 5,
    };
    const groups = finishedShortfallsByCapacity(lines, stock);
    expect(groups).toEqual([
      {
        capacity: '75g_big_belly',
        qtys: { osmanthus: 7, red_date: 0, rock_sugar: 0 },
      },
    ]);
  });

  it('returns empty when finished stock covers BOM', () => {
    const lines = expandGiftBoxBom('star_gold', 1);
    const stock = {
      [finishedSku('75g_big_belly', 'osmanthus')]: 10,
    };
    expect(finishedShortfallsByCapacity(lines, stock)).toEqual([]);
  });
});
