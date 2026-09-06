import { describe, expect, it } from 'vitest';
import { defaultRentInvoiceBody, defaultRentInvoiceSubject } from './rentals';

describe('defaultRentInvoiceSubject/Body', () => {
  it('builds subject with unit and period', () => {
    expect(defaultRentInvoiceSubject('213A', '2026-08')).toBe('租金單 213A 2026-08');
  });

  it('builds editable plain-text body with line items', () => {
    const body = defaultRentInvoiceBody({
      tenantName: 'Ada',
      unitName: '213A',
      dueDateDay: 1,
      note: 'Please pay promptly.',
      paymentInstructionsText: 'Bank transfer detail:\n123',
      record: {
        billingPeriod: '2026-08',
        baseRent: 10000,
        waterFee: 0,
        electricityFee: 200,
        actualAmount: 10200,
        baseRentPeriodFrom: '2026-08-01',
        baseRentPeriodTo: '2026-08-31',
        waterPeriodFrom: null,
        waterPeriodTo: null,
        electricityPeriodFrom: null,
        electricityPeriodTo: null,
      },
    });
    expect(body).toContain('Dear Ada,');
    expect(body).toContain('Rent invoice for 213A — 2026-08');
    expect(body).toContain('Total:');
    expect(body).toContain('Please pay promptly.');
    expect(body).toContain('Bank transfer detail:');
    expect(body).toContain('Thank you.');
  });
});
