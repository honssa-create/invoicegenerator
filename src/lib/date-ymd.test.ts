import { describe, expect, it } from 'vitest';
import { daysInMonth, defaultYmdParts, formatYmd, parseYmd } from './date-ymd';

describe('date-ymd', () => {
  it('parses and rejects invalid dates', () => {
    expect(parseYmd('2026-09-05')).toEqual({ year: 2026, month: 9, day: 5 });
    expect(parseYmd('2026-02-30')).toBeNull();
    expect(parseYmd('')).toBeNull();
  });

  it('clamps day when formatting', () => {
    expect(formatYmd(2026, 2, 31)).toBe('2026-02-28');
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('defaults empty value to today', () => {
    expect(defaultYmdParts('', new Date(2026, 8, 2))).toEqual({ year: 2026, month: 9, day: 2 });
    expect(defaultYmdParts('2025-01-03')).toEqual({ year: 2025, month: 1, day: 3 });
  });
});
