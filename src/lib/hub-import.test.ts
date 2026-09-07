import { describe, expect, it } from 'vitest';
import {
  parseHubImportDateRange,
  rollingHubImportDateRange,
  subtractDaysFromIsoTimestamp,
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

describe('rollingHubImportDateRange', () => {
  it('returns an inclusive window ending today', () => {
    const range = rollingHubImportDateRange(3);
    expect(range.dateTo).toBe(new Date().toISOString().slice(0, 10));
    const from = new Date(`${range.dateFrom}T00:00:00Z`);
    const to = new Date(`${range.dateTo}T00:00:00Z`);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(2);
  });
});
