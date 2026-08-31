import { describe, expect, it } from 'vitest';
import { GIFT_BOX_BOMS } from './kitchen-bom';
import { NESTIEE_GIFT_BOX_TYPES, NESTIEE_ORDER_TYPE } from './orders';
import {
  isNestieeOrdersFilter,
  nestieeShipTodayDateRange,
  nestieeStatusesForDemandScope,
  orderMatchesNestieeDateRange,
  orderMatchesNestieeDemandScope,
  orderMatchesNestieeShipToday,
  parseNestieeDateFilterType,
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
  it('defaults to processing and accepts shipped/all/ship_today', () => {
    expect(parseNestieeDemandScope(null)).toBe('processing');
    expect(parseNestieeDemandScope('shipped')).toBe('shipped');
    expect(parseNestieeDemandScope('all')).toBe('all');
    expect(parseNestieeDemandScope('ship_today')).toBe('ship_today');
    expect(parseNestieeDemandScope('invalid')).toBe('processing');
  });
});

describe('nestieeStatusesForDemandScope', () => {
  it('maps scopes to status sets', () => {
    expect(nestieeStatusesForDemandScope('processing')).toEqual(['processing']);
    expect(nestieeStatusesForDemandScope('ship_today')).toEqual(['processing']);
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

describe('parseNestieeDateFilterType', () => {
  it('defaults to order_date', () => {
    expect(parseNestieeDateFilterType(null)).toBe('order_date');
    expect(parseNestieeDateFilterType('delivery_date')).toBe('delivery_date');
    expect(parseNestieeDateFilterType('invalid')).toBe('order_date');
  });
});

describe('orderMatchesNestieeDateRange', () => {
  it('ignores dates when the FilterBar range is empty', () => {
    expect(orderMatchesNestieeDateRange({ created_at: '2026-01-01' })).toBe(true);
    expect(
      orderMatchesNestieeDateRange(
        { created_at: '2026-01-01', fields: { due_date: '2026-09-01' } },
        { dateFilterType: 'delivery_date' },
      ),
    ).toBe(true);
  });

  it('filters by created_at for order_date', () => {
    const range = { dateStart: '2026-08-01', dateEnd: '2026-08-31', dateFilterType: 'order_date' as const };
    expect(orderMatchesNestieeDateRange({ created_at: '2026-08-14T09:40:02' }, range)).toBe(true);
    expect(orderMatchesNestieeDateRange({ created_at: '2026-07-31' }, range)).toBe(false);
    expect(orderMatchesNestieeDateRange({ created_at: '' }, range)).toBe(true);
  });

  it('filters by due_date / client_delivery_date for delivery_date', () => {
    const range = { dateStart: '2026-08-01', dateEnd: '2026-08-31', dateFilterType: 'delivery_date' as const };
    expect(
      orderMatchesNestieeDateRange(
        { created_at: '2026-07-01', fields: { due_date: '2026-08-20' } },
        range,
      ),
    ).toBe(true);
    expect(
      orderMatchesNestieeDateRange(
        { created_at: '2026-08-10', fields: { client_delivery_date: '2026-09-01' } },
        range,
      ),
    ).toBe(false);
    expect(
      orderMatchesNestieeDateRange(
        { created_at: '2026-08-10', fields: {} },
        range,
      ),
    ).toBe(false);
  });

  it('prefers due_date over client_delivery_date', () => {
    const range = { dateStart: '2026-08-01', dateEnd: '2026-08-31', dateFilterType: 'delivery_date' as const };
    expect(
      orderMatchesNestieeDateRange(
        {
          created_at: '2026-07-01',
          fields: { due_date: '2026-08-15', client_delivery_date: '2026-09-01' },
        },
        range,
      ),
    ).toBe(true);
  });
});

describe('orderMatchesNestieeShipToday', () => {
  it('uses today through today+4 on delivery date and only processing', () => {
    expect(nestieeShipTodayDateRange('2026-08-28')).toEqual({
      dateStart: '2026-08-28',
      dateEnd: '2026-09-01',
    });
    const today = '2026-08-28';
    const nestiee = (status: string, due: string) => ({
      status,
      fields: { order_type: NESTIEE_ORDER_TYPE, due_date: due },
    });
    expect(orderMatchesNestieeShipToday(nestiee('processing', '2026-08-28'), today)).toBe(true);
    expect(orderMatchesNestieeShipToday(nestiee('processing', '2026-09-01'), today)).toBe(true);
    expect(orderMatchesNestieeShipToday(nestiee('processing', '2026-09-02'), today)).toBe(false);
    expect(orderMatchesNestieeShipToday(nestiee('processing', '2026-08-27'), today)).toBe(false);
    expect(orderMatchesNestieeShipToday(nestiee('shipped', '2026-08-28'), today)).toBe(false);
    expect(orderMatchesNestieeShipToday(nestiee('completed', '2026-08-28'), today)).toBe(false);
    expect(orderMatchesNestieeShipToday(nestiee('pending payment', '2026-08-28'), today)).toBe(false);
    expect(orderMatchesNestieeShipToday(nestiee('checkout-draft', '2026-08-28'), today)).toBe(false);
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

  it('counts only processing orders due today through today+4 for ship_today', () => {
    const today = '2026-08-28';
    const demand = summarizeNestieeProcessingDemand(
      [
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            due_date: '2026-08-28',
            nestiee_gift_qty_star_gold: 1,
          },
        },
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            due_date: '2026-09-01',
            nestiee_gift_qty_star_gold: 2,
          },
        },
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            due_date: '2026-09-02',
            nestiee_gift_qty_star_gold: 99,
          },
        },
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            due_date: '2026-08-27',
            nestiee_gift_qty_star_gold: 99,
          },
        },
        {
          status: 'shipped',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            due_date: '2026-08-28',
            nestiee_gift_qty_star_gold: 99,
          },
        },
        {
          status: 'pending payment',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            due_date: '2026-08-28',
            nestiee_gift_qty_star_gold: 99,
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS,
      'ship_today',
      { today },
    );

    expect(demand.scope).toBe('ship_today');
    expect(demand.orderCount).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(3);
  });

  it('counts 所需禮盒 from nestiee_lines when stored gift qtys are empty', () => {
    const demand = summarizeNestieeProcessingDemand(
      [
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_lines: JSON.stringify([
              { name: '星空金', quantity: 2, unit_price: 344, line_total: 688 },
              { name: '紅色銀', quantity: 3, unit_price: 10, line_total: 30 },
            ]),
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS
    );

    expect(demand.orderCount).toBe(1);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'red_silver')?.qty).toBe(3);
  });

  it('adds Mid-Autumn bundle line items as 花月 + 星空金 + 星空銀', () => {
    const demand = summarizeNestieeProcessingDemand(
      [
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_lines: JSON.stringify([
              {
                name: '中秋 ‧ 花好月圓燕窩禮盒套裝 - 一套-‧-嚐月之禮-花好月圓套裝-星空金銀花月禮盒',
                quantity: 2,
                unit_price: 1,
                line_total: 2,
              },
            ]),
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS
    );

    expect(demand.giftBoxes.find((g) => g.id === 'hua_yue')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'star_silver')?.qty).toBe(2);
  });

  it('adds 星空金銀花月禮盒-only variation lines as 花月 + 星空金 + 星空銀', () => {
    const demand = summarizeNestieeProcessingDemand(
      [
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_lines: JSON.stringify([
              {
                name: '嚐月之禮-花好月圓套裝-星空金銀花月禮盒',
                quantity: 2,
                unit_price: 1,
                line_total: 2,
              },
            ]),
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS
    );

    expect(demand.giftBoxes.find((g) => g.id === 'hua_yue')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'star_silver')?.qty).toBe(2);
  });

  it('adds 限時加購 星空禮盒桂花味 on top of Mid-Autumn bundle 星空金', () => {
    const demand = summarizeNestieeProcessingDemand(
      [
        {
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_lines: JSON.stringify([
              {
                name: '中秋 ‧ 花好月圓燕窩禮盒套裝 - 一套-‧-嚐月之禮-花好月圓套裝-星空金銀花月禮盒',
                quantity: 1,
                unit_price: 1,
                line_total: 1,
                options: [
                  {
                    label: '讓這份驚喜更圓滿？ (限時加購 ‧ 2選1)',
                    value: '星空禮盒桂花味',
                    price: 88,
                  },
                ],
              },
            ]),
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS
    );

    expect(demand.giftBoxes.find((g) => g.id === 'hua_yue')?.qty).toBe(1);
    expect(demand.giftBoxes.find((g) => g.id === 'star_gold')?.qty).toBe(2);
    expect(demand.giftBoxes.find((g) => g.id === 'star_silver')?.qty).toBe(1);
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
