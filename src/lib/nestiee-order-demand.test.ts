import { describe, expect, it } from 'vitest';
import { GIFT_BOX_BOMS } from './kitchen-bom';
import { NESTIEE_GIFT_BOX_TYPES, NESTIEE_ORDER_TYPE } from './orders';
import {
  isNestieeOrdersFilter,
  giftCountForOrderShippingBoxes,
  mapShippingBoxesForGiftCount,
  nestieeShipTodayDateRange,
  nestieeStatusesForDemandScope,
  orderMatchesNestieeDateRange,
  orderMatchesNestieeDemandScope,
  orderMatchesNestieeShipToday,
  parseNestieeDateFilterType,
  parseNestieeDemandScope,
  summarizeNestieeProcessingDemand,
  summarizeNestieeOrderStatusCounts,
  summarizeNestieeUsedShippingBoxes,
  orderMatchesNestieeShipWithinDays,
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

describe('summarizeNestieeOrderStatusCounts', () => {
  it('counts processing vs completed Nestiee orders in date range', () => {
    const counts = summarizeNestieeOrderStatusCounts(sampleOrders, {
      dateStart: '2026-01-01',
      dateEnd: '2026-12-31',
      dateFilterType: 'order_date',
      today: '2026-09-06',
    });
    expect(counts.processing).toBe(1);
    expect(counts.completed).toBe(2);
    expect(counts.shipWithinDays).toBe(0);
  });

  it('counts processing orders due to ship within 4 days regardless of date filter', () => {
    const orders = [
      {
        status: 'processing',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-06' },
      },
      {
        status: 'processing',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-08' },
      },
      {
        status: 'processing',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-09' },
      },
      {
        status: 'shipped',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-07' },
      },
    ];
    const counts = summarizeNestieeOrderStatusCounts(orders, {
      dateStart: '2026-08-01',
      dateEnd: '2026-08-31',
      dateFilterType: 'order_date',
      today: '2026-09-06',
    });
    expect(counts.shipWithinDays).toBe(3);
    expect(counts.processing).toBe(0);
    expect(counts.completed).toBe(0);
  });

  it('filters processing/completed by delivery date when dateFilterType is delivery_date', () => {
    const orders = [
      {
        status: 'processing',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-05' },
      },
      {
        status: 'processing',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-09' },
      },
      {
        status: 'completed',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, client_delivery_date: '2026-09-08' },
      },
      {
        status: 'completed',
        created_at: '2026-01-01',
        fields: { order_type: NESTIEE_ORDER_TYPE, client_delivery_date: '2026-09-10' },
      },
    ];
    const counts = summarizeNestieeOrderStatusCounts(orders, {
      dateStart: '2026-09-05',
      dateEnd: '2026-09-08',
      dateFilterType: 'delivery_date',
      today: '2026-09-06',
    });
    expect(counts.processing).toBe(1);
    expect(counts.completed).toBe(1);
  });
});

describe('orderMatchesNestieeShipWithinDays', () => {
  it('matches processing orders with delivery date within 4 calendar days', () => {
    const today = '2026-09-06';
    expect(
      orderMatchesNestieeShipWithinDays(
        {
          status: 'processing',
          fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-06' },
        },
        today,
      ),
    ).toBe(true);
    expect(
      orderMatchesNestieeShipWithinDays(
        {
          status: 'processing',
          fields: { order_type: NESTIEE_ORDER_TYPE, client_delivery_date: '2026-09-08' },
        },
        today,
      ),
    ).toBe(true);
    expect(
      orderMatchesNestieeShipWithinDays(
        {
          status: 'processing',
          fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-09' },
        },
        today,
      ),
    ).toBe(true);
    expect(
      orderMatchesNestieeShipWithinDays(
        {
          status: 'processing',
          fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-10' },
        },
        today,
      ),
    ).toBe(false);
    expect(
      orderMatchesNestieeShipWithinDays(
        {
          status: 'shipped',
          fields: { order_type: NESTIEE_ORDER_TYPE, due_date: '2026-09-07' },
        },
        today,
      ),
    ).toBe(false);
    expect(
      orderMatchesNestieeShipWithinDays(
        {
          status: 'processing',
          fields: { order_type: NESTIEE_ORDER_TYPE },
        },
        today,
      ),
    ).toBe(false);
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

describe('giftCountForOrderShippingBoxes', () => {
  it('uses the order gift total when positive and defaults to 1 when empty', () => {
    expect(giftCountForOrderShippingBoxes(0)).toBe(1);
    expect(giftCountForOrderShippingBoxes(3)).toBe(3);
    expect(giftCountForOrderShippingBoxes(2.9)).toBe(2);
  });
});

describe('mapShippingBoxesForGiftCount', () => {
  it('maps 1–10 gift boxes to shipping outer boxes', () => {
    expect(mapShippingBoxesForGiftCount(0)).toEqual({ small: 0, single: 0, double: 0, triple: 0 });
    expect(mapShippingBoxesForGiftCount(1)).toEqual({ small: 0, single: 1, double: 0, triple: 0 });
    expect(mapShippingBoxesForGiftCount(2)).toEqual({ small: 0, single: 1, double: 0, triple: 0 });
    expect(mapShippingBoxesForGiftCount(3)).toEqual({ small: 0, single: 0, double: 1, triple: 0 });
    expect(mapShippingBoxesForGiftCount(4)).toEqual({ small: 0, single: 0, double: 0, triple: 1 });
    expect(mapShippingBoxesForGiftCount(5)).toEqual({ small: 0, single: 1, double: 1, triple: 0 });
    expect(mapShippingBoxesForGiftCount(6)).toEqual({ small: 0, single: 1, double: 1, triple: 0 });
    expect(mapShippingBoxesForGiftCount(7)).toEqual({ small: 0, single: 0, double: 2, triple: 0 });
    expect(mapShippingBoxesForGiftCount(8)).toEqual({ small: 0, single: 0, double: 2, triple: 0 });
    expect(mapShippingBoxesForGiftCount(9)).toEqual({ small: 0, single: 0, double: 1, triple: 1 });
    expect(mapShippingBoxesForGiftCount(10)).toEqual({ small: 0, single: 0, double: 1, triple: 1 });
  });

  it('recursively applies mapping for counts above 10', () => {
    expect(mapShippingBoxesForGiftCount(11)).toEqual({ small: 0, single: 1, double: 1, triple: 1 });
    expect(mapShippingBoxesForGiftCount(12)).toEqual({ small: 0, single: 1, double: 1, triple: 1 });
    expect(mapShippingBoxesForGiftCount(20)).toEqual({ small: 0, single: 0, double: 2, triple: 2 });
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

  it('aggregates shipping outer boxes per order from total gift box count', () => {
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
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_star_gold: 5,
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS,
    );

    // Order 1: 3 gift boxes → 1 雙套; order 2: 5 gift boxes → 1 雙套 + 1 單套
    expect(demand.shippingBoxes.find((b) => b.id === 'small')?.qty).toBe(0);
    expect(demand.shippingBoxes.find((b) => b.id === 'single')?.qty).toBe(1);
    expect(demand.shippingBoxes.find((b) => b.id === 'double')?.qty).toBe(2);
    expect(demand.shippingBoxes.find((b) => b.id === 'triple')?.qty).toBe(0);
    expect(demand.shippingBoxes.find((b) => b.id === 'single')?.label).toBe('單套');
    expect(demand.shippingBoxes.find((b) => b.id === 'single')?.size).toBe('25x25x12.5cm');
  });

  it('counts at least one outer box per included order even when 所需禮盒 is empty', () => {
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
          status: 'processing',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
          },
        },
      ],
      giftBoxTypes,
      GIFT_BOX_BOMS,
    );

    // Order 1: 3 gift boxes → 1 雙套; order 2: no qty → minimum 1 單套
    expect(demand.orderCount).toBe(2);
    expect(demand.shippingBoxes.find((b) => b.id === 'small')?.qty).toBe(0);
    expect(demand.shippingBoxes.find((b) => b.id === 'single')?.qty).toBe(1);
    expect(demand.shippingBoxes.find((b) => b.id === 'double')?.qty).toBe(1);
    expect(
      demand.shippingBoxes.reduce((sum, box) => sum + box.qty, 0),
    ).toBe(2);
  });
});

describe('summarizeNestieeUsedShippingBoxes', () => {
  const giftBoxTypes = [
    { id: 'star_gold', label: '星空', qtyKey: 'nestiee_gift_qty_star_gold', active: true },
    { id: 'hua_yue', label: '花月', qtyKey: 'nestiee_gift_qty_hua_yue', active: true },
  ];

  it('only counts shipped/completed Nestiee orders in the date range', () => {
    const summary = summarizeNestieeUsedShippingBoxes(
      [
        {
          status: 'shipped',
          created_at: '2026-09-01',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_hua_yue: 3,
          },
        },
        {
          status: 'processing',
          created_at: '2026-09-02',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_hua_yue: 10,
          },
        },
        {
          status: 'shipped',
          created_at: '2026-09-02',
          fields: {
            order_type: 'honour訂製',
            nestiee_gift_qty_hua_yue: 5,
          },
        },
        {
          status: 'completed',
          created_at: '2026-08-01',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_hua_yue: 1,
          },
        },
      ],
      giftBoxTypes,
      { dateStart: '2026-09-01', dateEnd: '2026-09-30', dateFilterType: 'order_date' },
    );

    expect(summary.orderCount).toBe(1);
    expect(summary.shippingBoxes.find((b) => b.id === 'double')?.qty).toBe(1);
  });

  it('maps gift boxes to outer boxes per shipped order', () => {
    const summary = summarizeNestieeUsedShippingBoxes(
      [
        {
          status: 'shipped',
          created_at: '2026-09-05',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_star_gold: 2,
            nestiee_gift_qty_hua_yue: 1,
          },
        },
        {
          status: 'completed',
          created_at: '2026-09-06',
          fields: {
            order_type: NESTIEE_ORDER_TYPE,
            nestiee_gift_qty_star_gold: 5,
          },
        },
      ],
      giftBoxTypes,
      { dateStart: '2026-09-01', dateEnd: '2026-09-30' },
    );

    expect(summary.orderCount).toBe(2);
    expect(summary.shippingBoxes.find((b) => b.id === 'small')?.qty).toBe(0);
    expect(summary.shippingBoxes.find((b) => b.id === 'single')?.qty).toBe(1);
    expect(summary.shippingBoxes.find((b) => b.id === 'double')?.qty).toBe(2);
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
