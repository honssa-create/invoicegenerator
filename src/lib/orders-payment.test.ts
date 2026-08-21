import { describe, expect, it } from 'vitest';
import {
  computeOrderPaidTotal,
  derivePaymentStatusLabel,
  expandOrderToPaymentEntries,
  orderHasPaymentSlotData,
  parsePaymentAmount,
  paymentSlotFields,
} from './orders';

describe('parsePaymentAmount', () => {
  it('parses numbers and currency-ish strings', () => {
    expect(parsePaymentAmount(12.5)).toBe(12.5);
    expect(parsePaymentAmount('1,280.00')).toBe(1280);
    expect(parsePaymentAmount('HK$ 99.5')).toBe(99.5);
    expect(parsePaymentAmount('')).toBe(0);
    expect(parsePaymentAmount(undefined)).toBe(0);
  });
});

describe('computeOrderPaidTotal', () => {
  it('sums three installments without double-counting payment1', () => {
    expect(
      computeOrderPaidTotal({
        payment_amount: '100',
        payment1_amount: '100',
        payment2_amount: '50',
        payment3_amount: '25.5',
      })
    ).toBe(175.5);
  });

  it('falls back to payment1_amount when payment_amount empty', () => {
    expect(computeOrderPaidTotal({ payment1_amount: '80', payment2_amount: '20' })).toBe(100);
  });
});

describe('derivePaymentStatusLabel', () => {
  it('returns Unpaid / Partly Paid / Full Paid from paid vs due', () => {
    expect(derivePaymentStatusLabel(0)).toBe('Unpaid');
    expect(derivePaymentStatusLabel(50)).toBe('部分付款 Partly Paid');
    expect(derivePaymentStatusLabel(50, 100)).toBe('部分付款 Partly Paid');
    expect(derivePaymentStatusLabel(100, 100)).toBe('Full Paid');
    expect(derivePaymentStatusLabel(100.005, 100)).toBe('Full Paid');
  });
});

describe('paymentSlotFields', () => {
  it('maps slots to the correct field keys', () => {
    expect(paymentSlotFields(1).verified).toBe('payment_verified');
    expect(paymentSlotFields(2).amount).toBe('payment2_amount');
    expect(paymentSlotFields(3).receipt).toBe('payment3_receipt_path');
  });
});

describe('orderHasPaymentSlotData', () => {
  it('detects populated slots', () => {
    expect(orderHasPaymentSlotData({ payment_amount: '100' }, 1)).toBe(true);
    expect(orderHasPaymentSlotData({ payment2_date: '2026-01-01' }, 2)).toBe(true);
    expect(orderHasPaymentSlotData({}, 3)).toBe(false);
  });
});

describe('expandOrderToPaymentEntries', () => {
  it('emits one row per populated installment', () => {
    const linked = new Map<string, number>([['42-2', 99]]);
    const entries = expandOrderToPaymentEntries(
      {
        id: 42,
        reference_number: 'ORD-42',
        name: 'Alice',
        fields: {
          order_type: 'honour訂製',
          payment_amount: '500',
          payment_date: '2026-01-01',
          payment_verified: true,
          payment2_amount: '300',
          payment2_date: '2026-02-01',
        },
      },
      { title: 'Badge order', linkedByOrderSlot: linked }
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      payment_slot: 1,
      amount: '500',
      verified: true,
      linked_reconciliation_id: null,
    });
    expect(entries[1]).toMatchObject({
      payment_slot: 2,
      amount: '300',
      verified: false,
      linked_reconciliation_id: 99,
    });
  });
});

describe('normalizeOrderPaymentMethod', () => {
  it('maps known OCR strings and falls back to 其他', async () => {
    const { normalizeOrderPaymentMethod } = await import('./orders');
    expect(normalizeOrderPaymentMethod('FPS 轉數快').method).toBe('FPS');
    expect(normalizeOrderPaymentMethod('PayMe').method).toBe('Payme');
    expect(normalizeOrderPaymentMethod('Yedpay 信用卡').method).toBe('Yedpay 信用卡');
    expect(normalizeOrderPaymentMethod('現金').method).toBe('現金');
    expect(normalizeOrderPaymentMethod('Cheque')).toEqual({
      method: '其他(請備註)',
      note: 'Cheque',
    });
  });
});
