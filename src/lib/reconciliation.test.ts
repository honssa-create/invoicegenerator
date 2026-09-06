import { describe, expect, it } from 'vitest';
import {
  amountsClose,
  classifyMediumCandidates,
  isWithinHours,
  MEDIUM_MATCH_WINDOW_HOURS,
  paymentMethodMatches,
} from './reconciliation';
import { extractOrderNoFromRemarks, parseDateTime } from './reconciliation-server';
import { extractOrderNoFromYedpay, transactionPaidAt } from './yedpay';

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

describe('transactionPaidAt', () => {
  it('prefers paid_at over settled_at and created_at', () => {
    expect(
      transactionPaidAt({
        id: '1',
        status: 'paid',
        amount: '100',
        charge: 1,
        net: '99',
        paid_at: '2026-04-01T10:00:00Z',
        settled_at: '2026-04-02T10:00:00Z',
        created_at: '2026-03-31T10:00:00Z',
      }),
    ).toBe('2026-04-01T10:00:00Z');
  });

  it('falls back to settled_at then created_at', () => {
    expect(
      transactionPaidAt({
        id: '1',
        status: 'paid',
        amount: '100',
        charge: 1,
        net: '99',
        settled_at: '2026-04-02T10:00:00Z',
      }),
    ).toBe('2026-04-02T10:00:00Z');
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

describe('amountsClose', () => {
  it('treats amounts within 0.02 as exact', () => {
    expect(amountsClose(500, 500)).toBe(true);
    expect(amountsClose(500, 500.01)).toBe(true);
    expect(amountsClose(500, 500.02)).toBe(true);
    expect(amountsClose(500, 500.03)).toBe(false);
  });
});

describe('isWithinHours', () => {
  it('accepts deposits within ±48h of order created_at', () => {
    const created = new Date(2026, 7, 1, 12, 0, 0);
    const within = new Date(2026, 7, 3, 11, 0, 0);
    const outside = new Date(2026, 7, 3, 13, 0, 0);
    expect(isWithinHours(within, created, MEDIUM_MATCH_WINDOW_HOURS)).toBe(true);
    expect(isWithinHours(outside, created, MEDIUM_MATCH_WINDOW_HOURS)).toBe(false);
  });
});

describe('paymentMethodMatches', () => {
  it('matches FPS hints and allows empty fields for bank methods', () => {
    expect(paymentMethodMatches('FPS', 'FPS 轉數快')).toBe(true);
    expect(paymentMethodMatches('FPS', '', { allowEmptyForBankMethods: true })).toBe(true);
    expect(paymentMethodMatches('Payme', 'PayMe transfer')).toBe(true);
    expect(paymentMethodMatches('Yedpay', 'credit card')).toBe(false);
    expect(paymentMethodMatches('Yedpay', '')).toBe(true);
  });
});

describe('classifyMediumCandidates', () => {
  it('returns unique for a single candidate', () => {
    expect(classifyMediumCandidates([{ id: 1 }])).toEqual({ kind: 'unique', pick: { id: 1 } });
  });

  it('returns collision when 2+ candidates share amount/window', () => {
    expect(classifyMediumCandidates([{ id: 1 }, { id: 2 }])).toEqual({ kind: 'collision', pick: null });
  });

  it('returns none when empty', () => {
    expect(classifyMediumCandidates([])).toEqual({ kind: 'none', pick: null });
  });
});

describe('parseDateTime', () => {
  it('parses ISO-like deposit timestamps', () => {
    const dt = parseDateTime('2026-08-01 14:30:00');
    expect(dt).not.toBeNull();
    expect(dt!.getFullYear()).toBe(2026);
    expect(dt!.getMonth()).toBe(7);
    expect(dt!.getDate()).toBe(1);
  });
});
