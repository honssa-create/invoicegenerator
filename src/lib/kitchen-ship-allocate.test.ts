import { describe, expect, it } from 'vitest';
import {
  formatKitchenShortageConfirm,
  kitchenShortagesFromNeeds,
  parseKitchenShortageResponse,
} from './kitchen-ship-allocate';

describe('kitchenShortagesFromNeeds', () => {
  it('returns empty when there is nothing remaining', () => {
    expect(
      kitchenShortagesFromNeeds(
        [{ needKey: 'gift:star_gold', remaining: 0, label: 'Star Gold' }],
        { giftBoxes: { star_gold: 0 }, finished: {} },
      ),
    ).toEqual([]);
  });

  it('returns empty when gift-box and bottle stock cover remaining', () => {
    expect(
      kitchenShortagesFromNeeds(
        [
          { needKey: 'gift:star_gold', remaining: 2, label: 'Star Gold' },
          { needKey: 'bottle:45g_rock_sugar', remaining: 3, label: '冰糖 (45g)' },
        ],
        {
          giftBoxes: { star_gold: 2 },
          finished: { '45g_rock_sugar': 10 },
        },
      ),
    ).toEqual([]);
  });

  it('lists gift-box and bottle shortfalls', () => {
    expect(
      kitchenShortagesFromNeeds(
        [
          { needKey: 'gift:star_gold', remaining: 5, label: 'Star Gold' },
          { needKey: 'bottle:45g_rock_sugar', remaining: 3, label: '冰糖 (45g)' },
        ],
        {
          giftBoxes: { star_gold: 1 },
          finished: { '45g_rock_sugar': 0 },
        },
      ),
    ).toEqual([
      { label: 'Star Gold', need: 5, have: 1 },
      { label: '冰糖 (45g)', need: 3, have: 0 },
    ]);
  });
});

describe('parseKitchenShortageResponse', () => {
  it('reads kitchen_shortage payloads', () => {
    expect(parseKitchenShortageResponse({ kitchen_shortage: true, shortages: [{ label: 'A', need: 2, have: 0 }] })).toEqual([
      { label: 'A', need: 2, have: 0 },
    ]);
    expect(parseKitchenShortageResponse({ conflict: true })).toBeNull();
  });
});

describe('formatKitchenShortageConfirm', () => {
  it('includes bilingual warning and shortfalls', () => {
    const text = formatKitchenShortageConfirm([{ label: 'Star Gold', need: 2, have: 0 }]);
    expect(text).toMatch(/Ship anyway/);
    expect(text).toMatch(/不扣庫存/);
    expect(text).toMatch(/Star Gold/);
  });
});
