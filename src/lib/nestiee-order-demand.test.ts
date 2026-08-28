import { describe, expect, it } from 'vitest';
import { GIFT_BOX_BOMS } from './kitchen-bom';
import { NESTIEE_GIFT_BOX_TYPES, NESTIEE_ORDER_TYPE } from './orders';
import {
  isNestieeOrdersFilter,
  nestieeStatusesForDemandScope,
  orderMatchesNestieeDemandScope,
  parseNestieeDemandScope,
  summarizeNestieeProcessingDemand,
} from './nestiee-order-demand';

const giftBoxTypes = NESTIEE_GIFT_BOX_TYPES.map((g, i) => ({
  ...g,
  sortOrder: i,
  active: true,
}));

const sampleOrders = [
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
      nestiee_gift_qty_star_gold: 5,
    },
  },
  {
    status: 'completed',
    fields: {
      order_type: NESTIEE_ORDER_TYPE,
      nestiee_gift_qty_star_silver: 3,
    },
  },
  {
    status: 'pending payment',
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
];

describe('parseNestieeDemandScope', () => {
  it('defaults to processing and accepts shipped/all', () => {
    expect(parseNestieeDemandScope(null)).toBe('processing');
    expect(parseNestieeDemandScope('shipped')).toBe('shipped');
    expect(parseNestieeDemandScope('all')).toBe('all');
    expect(parseNestieeDemandScope('invalid')).toBe('processing');
  });
});

describe('nestieeStatusesForDemandScope', () => {
  it('maps scopes to status sets', () => {
    expect(nestieeStatusesForDemandScope('processing')).toEqual(['processing']);
    expect(nestieeStatusesForDemandScope('shipped')).toEqual(['shipped', 'completed']);
    expect(nestieeStatusesForDemandScope('all')).toEqual(['processing', 'shipped', 'completed']);
  });
});

describe('orderMatchesNestieeDemandScope', () => {
  it('excludes draft/pending payment for all scopes', () => {
    expect(orderMatchesNestieeDemandScope('pending payment', 'all')).toBe(false);
    expect(orderMatchesNestieeDemandScope('checkout-draft', 'all')).toBe(false);
    expect(orderMatchesNestieeDemandScope('completed', 'shipped')).toBe(true);
  });
});

describe('summarizeNestieeProcessingDemand', () => {
  it('only counts Nestiee orders in processing status by default', () => {
    const demand = summarizeNestieeProcessingDemand(sampleOrders, giftBoxTypes, GIFT_BOX_BOMS);

    expect(demand.scope).toBe('processing');
    expect(demand.orderCount).toBe(1);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'trial_set')?.qty).toBe(1);
    expect(demand.giftBoxes.find((g) => g.id === 'star_silver')?.qty).toBe(0);
  });

  it('counts shipped and completed orders when scope is shipped', () => {
    const demand = summarizeNestieeProcessingDemand(
      sampleOrders,
      giftBoxTypes,
      GIFT_BOX_BOMS,
      'shipped',
    );

    expect(demand.scope).toBe('shipped');
    expect(demand.orderCount).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(5);
    expect(demand.giftBoxes.find((g) => g.id === 'star_silver')?.qty).toBe(3);
  });

  it('counts processing, shipped, and completed when scope is all', () => {
    const demand = summarizeNestieeProcessingDemand(
      sampleOrders,
      giftBoxTypes,
      GIFT_BOX_BOMS,
      'all',
    );

    expect(demand.scope).toBe('all');
    expect(demand.orderCount).toBe(3);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(7);
    expect(demand.giftBoxes.find((g) => g.id === 'star_silver')?.qty).toBe(3);
    expect(demand.giftBoxes.find((g) => g.id === 'trial_set')?.qty).toBe(1);
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
