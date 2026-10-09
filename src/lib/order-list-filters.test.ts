import { describe, expect, it } from 'vitest';
import { buildOrderListFilterSql } from './order-list-filters';

describe('buildOrderListFilterSql', () => {
  it('adds order type filter for nestiee shortcut', () => {
    const params: (string | number)[] = [];
    const sql = buildOrderListFilterSql({ orderType: 'nestiee' }, params);
    expect(sql).toContain('o.order_type');
    expect(sql).not.toContain("j.fj->>'order_type'");
    expect(params.length).toBe(1);
  });

  it('adds status when set', () => {
    const params: (string | number)[] = [];
    const sql = buildOrderListFilterSql({ status: 'processing' }, params);
    expect(sql).toContain('o.status');
    expect(params).toEqual(['processing']);
  });

  it('adds unshipped dash focus', () => {
    const params: (string | number)[] = [];
    const sql = buildOrderListFilterSql({ dashFocus: 'unshipped', today: '2026-10-05' }, params);
    expect(sql).toContain('NOT');
  });
});
