import { describe, expect, it, vi } from 'vitest';

const captured: { sql: string; params: unknown[] }[] = [];

vi.mock('./db', () => ({
  default: {
    prepare(sql: string) {
      return {
        async get(...params: unknown[]) {
          captured.push({ sql, params });
          return { total: 0, unshipped: 0, urgent: 0 };
        },
      };
    },
  },
}));

import { countOrderListDashboard } from './order-list-dashboard';

/** Index (0-based) of the `?` that immediately follows `marker` in the SQL text. */
function placeholderIndexAfter(sql: string, marker: string): number {
  const at = sql.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  return (sql.slice(0, at + marker.length).match(/\?/g) || []).length - 1;
}

describe('countOrderListDashboard placeholder order', () => {
  it('binds user_id and the urgent date to the matching placeholders', async () => {
    captured.length = 0;
    await countOrderListDashboard(42, { orderType: 'honour', search: 'abc' }, {
      today: '2026-10-08',
      withinDays: 2,
    });
    expect(captured).toHaveLength(1);
    const { sql, params } = captured[0];
    expect((sql.match(/\?/g) || []).length).toBe(params.length);
    expect(params[placeholderIndexAfter(sql, 'o.user_id = ?')]).toBe(42);
    expect(params[placeholderIndexAfter(sql, '<= ?')]).toBe('2026-10-10');
  });

  it('works without filters', async () => {
    captured.length = 0;
    await countOrderListDashboard(7, {}, { today: '2026-10-08', withinDays: 2 });
    const { sql, params } = captured[0];
    expect((sql.match(/\?/g) || []).length).toBe(params.length);
    expect(params[placeholderIndexAfter(sql, 'o.user_id = ?')]).toBe(7);
  });
});
