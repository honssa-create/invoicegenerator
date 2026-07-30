import { describe, expect, it } from 'vitest';
import { computeBalanceDueAmount } from './invoice-print';

describe('computeBalanceDueAmount', () => {
  it('defaults to half total when not linked to an order', () => {
    expect(computeBalanceDueAmount(1000)).toBe(500);
    expect(computeBalanceDueAmount(1000, null)).toBe(500);
  });

  it('uses remaining unpaid when order payment fields are present', () => {
    expect(
      computeBalanceDueAmount(1000, {
        payment_amount: '400',
        payment2_amount: '100',
      }),
    ).toBe(500);
    expect(
      computeBalanceDueAmount(1000, {
        payment_amount: '1000',
      }),
    ).toBe(0);
    expect(
      computeBalanceDueAmount(1000, {
        payment_amount: '1200',
      }),
    ).toBe(0);
  });
});
