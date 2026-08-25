import { describe, expect, it } from 'vitest';
import { GIFT_BOX_BOMS } from './kitchen-bom';
import { NESTIEE_GIFT_BOX_TYPES, NESTIEE_ORDER_TYPE } from './orders';
import {
  isNestieeOrdersFilter,
  summarizeNestieeProcessingDemand,
} from './nestiee-order-demand';

const giftBoxTypes = NESTIEE_GIFT_BOX_TYPES.map((g, i) => ({
  ...g,
  sortOrder: i,
  active: true,
}));

describe('summarizeNestieeProcessingDemand', () => {
  it('only counts Nestiee orders in processing status', () => {
    const demand = summarizeNestieeProcessingDemand(
      [
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_star_gold: 2,
            nestiee_gift_qty_trial_set: 1,
          },
        },
        {
          status: 'shipped',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_star_gold: 99,
          },
        },
        {
          status: 'processing',
          fields: {
            order_type: 'honour訂製',
            nestiee_gift_qty_star_gold: 99,
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS
    );

    expect(demand.processingOrderCount).toBe(1);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'trial_set')?.qty).toBe(1);
    expect(demand.giftBoxes.find((g) => g.id === 'star_silver')?.qty).toBe(0);
  });

  it('rolls up finished bottles from gift-box BOMs', () => {
    const demand = summarizeNestieeProcessingDemand(
      [
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_qiu_yan_fei_yue: 1,
            nestiee_gift_qty_trial_set: 2,
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS
    );

    expect(demand.bottles.find((b) => b.label.includes('75g高身') && b.label.includes('冰糖'))?.qty).toBe(2);
    expect(demand.bottles.find((b) => b.label.includes('75g高身') && b.label.includes('桂花'))?.qty).toBe(3);
    expect(demand.bottles.find((b) => b.label.includes('75g高身') && b.label.includes('紅棗'))?.qty).toBe(3);
    expect(demand.bottles.find((b) => b.label === '冰糖 (45g)')?.qty).toBe(2);
    expect(demand.bottles.find((b) => b.label === '桂花 (45g)')?.qty).toBe(2);
    expect(demand.bottles.find((b) => b.label === '紅棗 (45g)')?.qty).toBe(2);
  });
});

describe('isNestieeOrdersFilter', () => {
  it('matches nav param and exact order type', () => {
    expect(isNestieeOrdersFilter('nestiee')).toBe(true);
    expect(isNestieeOrdersFilter(NESTIEE_ORDER_TYPE)).toBe(true);
    expect(isNestieeOrdersFilter('honour')).toBe(false);
    expect(isNestieeOrdersFilter('')).toBe(false);
  });
});
