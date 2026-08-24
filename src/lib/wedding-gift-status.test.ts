import { describe, expect, it } from 'vitest';
import {
  STATUS_COLORS,
  STATUS_COLUMN_ACCENT,
  STATUS_COLUMN_BG,
  STATUS_DOT_COLORS,
  WEDDING_GIFT_ORDER_STATUSES,
  WEDDING_GIFT_ORDER_TYPE,
  WEDDING_GIFT_SHIPPED_STATUSES,
  isOrderShipped,
  orderStatusFamily,
  statusesForOrderType,
} from './orders';

describe('回禮 order statuses', () => {
  it('exposes wedding gift status list for 燕窩回禮燉製', () => {
    expect(statusesForOrderType(WEDDING_GIFT_ORDER_TYPE)).toEqual([...WEDDING_GIFT_ORDER_STATUSES]);
  });

  it('uses wedding status family for 燕窩回禮燉製', () => {
    expect(orderStatusFamily(WEDDING_GIFT_ORDER_TYPE)).toBe('wedding');
  });

  it('contains no duplicate statuses', () => {
    expect(new Set(WEDDING_GIFT_ORDER_STATUSES).size).toBe(WEDDING_GIFT_ORDER_STATUSES.length);
  });

  it('defines colors for every wedding gift status', () => {
    for (const status of WEDDING_GIFT_ORDER_STATUSES) {
      expect(STATUS_COLORS[status], status).toBeTruthy();
      expect(STATUS_COLUMN_BG[status], status).toBeTruthy();
      expect(STATUS_COLUMN_ACCENT[status], status).toBeTruthy();
      expect(STATUS_DOT_COLORS[status], status).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('detects shipped 回禮 statuses', () => {
    const fields = { order_type: WEDDING_GIFT_ORDER_TYPE };
    for (const status of WEDDING_GIFT_SHIPPED_STATUSES) {
      expect(isOrderShipped({ status, fields })).toBe(true);
    }
    expect(isOrderShipped({ status: '已封箱待寄出', fields })).toBe(false);
    expect(isOrderShipped({ status: '已燉製 (HING - 2.5星期前)', fields })).toBe(false);
    expect(isOrderShipped({ status: 'OPEN', fields })).toBe(false);
  });
});
