import { describe, expect, it } from 'vitest';
import {
  isOrderShipped,
  isOrderUnshipped,
  isOrderUrgent,
  summarizeOrderDashboard,
} from './orders';

describe('order dashboard helpers', () => {
  it('detects shipped by order-type status', () => {
    expect(isOrderShipped({ status: '已寄出 SENT', fields: { order_type: 'honour訂製' } })).toBe(true);
    expect(isOrderShipped({ status: '可以寄出 READY TO SEND', fields: { order_type: 'honour訂製' } })).toBe(false);
    expect(isOrderShipped({ status: 'shipped', fields: { order_type: 'Nestiee 燕窩訂單' } })).toBe(true);
    expect(isOrderShipped({ status: 'processing', fields: { order_type: 'Nestiee 燕窩訂單' } })).toBe(false);
    expect(isOrderShipped({ status: 'Delivered', fields: { order_type: 'Cupmoka' } })).toBe(true);
    expect(isOrderUnshipped({ status: '處理中', fields: { order_type: 'Cupmoka' } })).toBe(true);
  });

  it('marks urgent when due within 2 days and unshipped', () => {
    const today = '2026-08-19';
    const base = { status: 'OPEN', fields: { order_type: 'honour訂製', due_date: '2026-08-21' } };
    expect(isOrderUrgent(base, { today })).toBe(true);
    expect(isOrderUrgent({ ...base, fields: { ...base.fields, due_date: '2026-08-22' } }, { today })).toBe(false);
    expect(isOrderUrgent({ ...base, fields: { ...base.fields, due_date: '2026-08-18' } }, { today })).toBe(true);
    expect(
      isOrderUrgent(
        { status: '已寄出 SENT', fields: { order_type: 'honour訂製', due_date: '2026-08-19' } },
        { today },
      ),
    ).toBe(false);
    expect(isOrderUrgent({ status: 'OPEN', fields: { order_type: 'honour訂製' } }, { today })).toBe(false);
  });

  it('summarizes dashboard counts', () => {
    const today = '2026-08-19';
    const counts = summarizeOrderDashboard(
      [
        { status: 'OPEN', fields: { order_type: 'honour訂製', due_date: '2026-08-20' } },
        { status: '已寄出 SENT', fields: { order_type: 'honour訂製', due_date: '2026-08-20' } },
        { status: 'processing', fields: { order_type: 'Nestiee 燕窩訂單', due_date: '2026-09-01' } },
      ],
      { today },
    );
    expect(counts).toEqual({ total: 3, unshipped: 2, urgent: 1 });
  });
});
