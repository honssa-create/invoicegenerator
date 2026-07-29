import { describe, expect, it } from 'vitest';
import {
  computeOrderPaidTotal,
  derivePaymentStatusLabel,
  parsePaymentAmount,
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
