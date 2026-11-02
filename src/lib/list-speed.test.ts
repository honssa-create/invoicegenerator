import { describe, expect, it } from 'vitest';
import { parseAccountingListQuery } from './accounting-server';
import { currentMonth } from './cashflow';
import { parseCashflowListQuery } from './cashflow-server';
import { containsLike, isoDateParam, yearMonthParam } from './list-query';
import { parsePaymentLedgerListQuery } from './payment-ledger';
import { linkDepositAnchor } from './reconciliation-page-utils';

describe('currentMonth', () => {
  it('uses the Asia/Hong_Kong calendar, not UTC', () => {
    expect(currentMonth(new Date('2026-03-31T16:30:00.000Z'))).toBe('2026-04');
    expect(currentMonth(new Date('2026-03-31T15:30:00.000Z'))).toBe('2026-03');
  });
});

describe('payment ledger list query', () => {
  it('keeps a valid date range, category, and page', () => {
    expect(
      parsePaymentLedgerListQuery({
        dateStart: '2026-04-01',
        dateEnd: '2026-04-30',
        category: '燕窩',
        q: '  12104  ',
        limit: '80',
        offset: '80',
      }),
    ).toEqual({
      dateStart: '2026-04-01',
      dateEnd: '2026-04-30',
      category: '燕窩',
      q: '12104',
      limit: 80,
      offset: 80,
    });
  });

  it('drops unknown categories and bad dates, and clamps the page', () => {
    expect(
      parsePaymentLedgerListQuery({
        dateStart: 'April',
        dateEnd: '2026-4-1',
        category: 'rent',
        limit: '9999',
        offset: '-4',
      }),
    ).toMatchObject({
      dateStart: '',
      dateEnd: '',
      category: '',
      limit: 200,
      offset: 0,
    });
  });
});

describe('accounting and cashflow list query', () => {
  it('treats month=all as every month and defaults a blank month on the API side separately', () => {
    expect(parseAccountingListQuery({ month: 'all', pending: '1', limit: '50', offset: '100' })).toEqual({
      month: '',
      pendingOnly: true,
      limit: 50,
      offset: 100,
    });
    expect(parseAccountingListQuery({ month: '2026-04' })).toMatchObject({ month: '2026-04', limit: 50, offset: 0 });
    expect(parseCashflowListQuery({}).limit).toBe(100);
    expect(yearMonthParam('2026-4')).toBe('');
    expect(isoDateParam('2026-04-01')).toBe('2026-04-01');
  });

  it('defaults cashflow to the Hong Kong month', () => {
    const month = currentMonth(new Date('2026-03-31T16:30:00.000Z'));
    expect(parseCashflowListQuery({ month: 'nope' }).month).toBe(currentMonth());
    expect(parseCashflowListQuery({ month: '2026-04' }).month).toBe('2026-04');
    expect(month).toBe('2026-04');
  });
});

describe('containsLike', () => {
  it('escapes LIKE wildcards with !', () => {
    expect(containsLike('50%_off!')).toBe('%50!%!_off!!%');
  });
});

describe('linkDepositAnchor', () => {
  it('uses noon for a date-only hint and rejects junk', () => {
    expect(linkDepositAnchor('')).toEqual({ mode: 'none', anchor: '1970-01-01 00:00:00' });
    expect(linkDepositAnchor('2026-04-02')).toEqual({ mode: 'window', anchor: '2026-04-02 12:00:00' });
    expect(linkDepositAnchor('2026-04-02 09:30')).toEqual({ mode: 'window', anchor: '2026-04-02 09:30:00' });
    expect(linkDepositAnchor('not-a-date').mode).toBe('reject');
  });
});
