import { describe, expect, it } from 'vitest';
import { hydrateNestieeGiftBoxQtys, NESTIEE_ORDER_TYPE } from './orders';
import { NESTIEE_PROCESSING_STATUS } from './nestiee-order-demand';
import {
  nestieeOrderCountsForKitchenDemand,
  orderFieldsFromRow,
} from './kitchen-server';
import type { KitchenOpenOrder } from './kitchen';

function openOrder(partial: Partial<KitchenOpenOrder> & Pick<KitchenOpenOrder, 'type' | 'status'>): KitchenOpenOrder {
  return {
    id: 1,
    referenceNumber: 'ORD-0000001',
    poNumber: '',
    typeLabel: 'Nestiee',
    needs: [],
    fullyFulfilled: false,
    ...partial,
  };
}

describe('orderFieldsFromRow', () => {
  it('uses denormalized order_type when fields_json is missing order_type', () => {
    const fields = orderFieldsFromRow({
      order_type: NESTIEE_ORDER_TYPE,
      fields_json: JSON.stringify({ nestiee_gift_qty_hua_yue: 2 }),
    });
    expect(fields.order_type).toBe(NESTIEE_ORDER_TYPE);
    expect(fields.nestiee_gift_qty_hua_yue).toBe(2);
  });

  it('keeps fields_json order_type when already set', () => {
    const fields = orderFieldsFromRow({
      order_type: 'other',
      fields_json: JSON.stringify({ order_type: NESTIEE_ORDER_TYPE }),
    });
    expect(fields.order_type).toBe(NESTIEE_ORDER_TYPE);
  });
});

describe('nestiee gift-box demand hydration', () => {
  it('derives 秋燕飛躍 qty from nestiee_lines when manual qty fields are empty', () => {
    const fields = hydrateNestieeGiftBoxQtys({
      order_type: NESTIEE_ORDER_TYPE,
      nestiee_lines: [
        {
          name: '金燕秋曜',
          quantity: 1,
          unit_price: 0,
          line_total: 0,
          options: [{ label: '盒數', value: '兩盒', price: 0 }],
        },
      ],
    });
    expect(fields.nestiee_gift_qty_qiu_yan_fei_yue).toBe('2');
  });
});

describe('nestieeOrderCountsForKitchenDemand', () => {
  it('includes processing Nestiee orders in gift-box demand rollup', () => {
    expect(
      nestieeOrderCountsForKitchenDemand(
        openOrder({ type: 'nestiee', status: NESTIEE_PROCESSING_STATUS }),
      ),
    ).toBe(true);
  });

  it('excludes non-processing Nestiee orders from gift-box demand rollup', () => {
    expect(nestieeOrderCountsForKitchenDemand(openOrder({ type: 'nestiee', status: 'on-hold' }))).toBe(
      false,
    );
    expect(nestieeOrderCountsForKitchenDemand(openOrder({ type: 'nestiee', status: 'shipped' }))).toBe(
      false,
    );
  });

  it('still includes 回禮 orders regardless of status', () => {
    expect(nestieeOrderCountsForKitchenDemand(openOrder({ type: 'return_gift', status: '安排中' }))).toBe(
      true,
    );
  });
});
