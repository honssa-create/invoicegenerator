import { describe, expect, it } from 'vitest';
import { buildOrderListFilterSql } from './order-list-filters';

describe('buildOrderListFilterSql', () => {
  it('adds order type filter for nestiee shortcut', () => {
    const params: (string | number)[] = [];
    const sql = buildOrderListFilterSql({ orderType: 'nestiee' }, params);
    expect(sql).toContain('order_type');
    expect(params.length).toBe(2);
  });

  it('adds status when set', () => {
    const params: (string | number)[] = [];
    const sql = buildOrderListFilterSql({ status: 'processing' }, params);
    expect(sql).toContain('o.status');
    expect(params).toEqual(['processing']);
  });
});
