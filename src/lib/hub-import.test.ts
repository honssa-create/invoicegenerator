import { describe, expect, it } from 'vitest';
import { parseHubImportDateRange, wooOrderCreatedBounds } from './hub-import';

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
  it('extends before to the start of the next day', () => {
    expect(wooOrderCreatedBounds({ dateFrom: '2026-07-01', dateTo: '2026-07-19' })).toEqual({
      after: '2026-07-01T00:00:00',
      before: '2026-07-20T00:00:00',
    });
  });
});
