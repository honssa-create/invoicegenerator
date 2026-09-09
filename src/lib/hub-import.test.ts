import { describe, expect, it } from 'vitest';
import {
  parseHubImportDateRange,
  orderCreatedInRange,
  rollingHubImportDateRange,
  subtractDaysFromIsoTimestamp,
  orderCreatedYmdHkt,
  hongKongDateYmd,
  wooOrderCreatedBounds,
} from './hub-import';

describe('parseHubImportDateRange', () => {
  it('requires both dates', () => {
    expect(parseHubImportDateRange({ date_from: '2026-07-01' }).ok).toBe(false);
  });

  it('rejects from after to', () => {
    expect(parseHubImportDateRange({ date_from: '2026-07-10', date_to: '2026-07-01' }).ok).toBe(false);
  });

  it('accepts a valid range', () => {
    const parsed = parseHubImportDateRange({ date_from: '2026-07-01', date_to: '2026-07-19' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.range).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-07-19' });
    }
  });
});

describe('wooOrderCreatedBounds', () => {
  it('uses Hong Kong timezone offsets', () => {
    expect(wooOrderCreatedBounds({ dateFrom: '2026-07-01', dateTo: '2026-07-19' })).toEqual({
      after: '2026-07-01T00:00:00+08:00',
      before: '2026-07-19T23:59:59+08:00',
    });
  });
});

describe('subtractDaysFromIsoTimestamp', () => {
  it('shifts ISO timestamps back by whole days', () => {
    const shifted = subtractDaysFromIsoTimestamp('2026-09-07T12:00:00.000Z', 7);
    expect(shifted).toBe('2026-08-31T12:00:00.000Z');
  });

  it('accepts SQL-style timestamps', () => {
    const shifted = subtractDaysFromIsoTimestamp('2026-09-07 12:00:00', 1);
    expect(shifted).toBe('2026-09-06T12:00:00.000Z');
  });
});

describe('orderCreatedInRange', () => {
  it('uses Hong Kong calendar day, not UTC prefix', () => {
    const range = { dateFrom: '2026-09-09', dateTo: '2026-09-09' };
    // Sep 9 01:30 HKT = Sep 8 17:30 UTC
    expect(orderCreatedYmdHkt('2026-09-08T17:30:00')).toBe('2026-09-09');
    expect(orderCreatedInRange('2026-09-08T17:30:00', range)).toBe(true);
    expect(orderCreatedInRange('2026-09-08T15:59:59Z', range)).toBe(false);
  });
});

describe('rollingHubImportDateRange', () => {
  it('returns an inclusive window ending today in Hong Kong', () => {
    const now = new Date('2026-09-08T20:00:00Z'); // Sep 9 04:00 HKT
    const range = rollingHubImportDateRange(3, now);
    expect(range.dateTo).toBe('2026-09-09');
    expect(range.dateFrom).toBe('2026-09-07');
  });

  it('uses Hong Kong today when UTC is still previous day', () => {
    const now = new Date('2026-09-08T18:00:00Z'); // Sep 9 02:00 HKT
    expect(hongKongDateYmd(now)).toBe('2026-09-09');
    expect(rollingHubImportDateRange(1, now).dateTo).toBe('2026-09-09');
  });
});
