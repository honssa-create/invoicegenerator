import { describe, expect, it } from 'vitest';
import {
  giftBoxLabelsFromFields,
  kitchenOrderHasGiftBox,
  sortGiftBoxDemandCards,
} from './nestiee-gift-box-search';

describe('nestiee-gift-box-search', () => {
  it('lists gift box labels from hydrated fields', () => {
    expect(
      giftBoxLabelsFromFields({
        nestiee_gift_qty_pink_red_date: '1',
        nestiee_gift_qty_star_gold: 0,
      }),
    ).toEqual(['粉紅心意 - 紅棗味']);
  });

  it('filters kitchen orders by gift box need', () => {
    const order = {
      needs: [
        {
          needKey: 'gift:pink_red_date',
          label: '粉紅心意 - 紅棗味 ×1',
          required: 1,
          remaining: 1,
        },
      ],
    };
    expect(kitchenOrderHasGiftBox(order, 'pink_red_date')).toBe(true);
    expect(kitchenOrderHasGiftBox(order, 'pink_osmanthus')).toBe(false);
  });

  it('sorts gift box cards by Chinese label', () => {
    const input = [
      { id: 'z', label: '花月禮盒' },
      { id: 'a', label: '粉紅心意 - 紅棗味' },
      { id: 'b', label: '粉紅心意 - 桂花味' },
    ];
    const sorted = sortGiftBoxDemandCards(input);
    expect(sorted).not.toEqual(input);
    expect(sorted.map((s) => s.id).sort()).toEqual(['a', 'b', 'z']);
  });
});
