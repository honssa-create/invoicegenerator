import { describe, expect, it } from 'vitest';
import { extractOrderNoFromRemarks } from './reconciliation-server';
import { extractOrderNoFromYedpay } from './yedpay';

describe('extractOrderNoFromRemarks', () => {
  it('extracts invoice numbers', () => {
    expect(extractOrderNoFromRemarks('Payment for INV-2026-0042 thank you')).toBe('INV-2026-0042');
  });

  it('extracts PO-style order numbers', () => {
    expect(extractOrderNoFromRemarks('FPS ref PO H3219 deposit')).toBe('H3219');
  });

  it('returns null when no token found', () => {
    expect(extractOrderNoFromRemarks('general transfer')).toBeNull();
  });
});

describe('extractOrderNoFromYedpay', () => {
  it('uses custom_id when present', () => {
    expect(extractOrderNoFromYedpay({ id: '1', status: 'paid', amount: '100', charge: 1, net: '99', custom_id: 'H3219' })).toBe(
      'H3219'
    );
  });

  it('parses extra_parameters JSON', () => {
    expect(
      extractOrderNoFromYedpay({
        id: '1',
        status: 'paid',
        amount: '100',
        charge: 1,
        net: '99',
        extra_parameters: '{"order_no":"INV-2026-0001"}',
      })
    ).toBe('INV-2026-0001');
  });
});
