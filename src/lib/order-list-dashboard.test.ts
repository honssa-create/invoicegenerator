import { describe, expect, it } from 'vitest';
import { buildOrderDueDateSql, buildOrderIsShippedSql } from './order-list-dashboard';

describe('order-list-dashboard SQL', () => {
  it('builds shipped expression with Nestiee and SENT rules', () => {
    const sql = buildOrderIsShippedSql();
    expect(sql).toContain('shipped');
    expect(sql).toContain('completed');
    expect(sql).toContain('SENT');
  });

  it('builds due date from json fields', () => {
    const sql = buildOrderDueDateSql();
    expect(sql).toContain("j.fj->>'due_date'");
    expect(sql).toContain("j.fj->>'client_delivery_date'");
  });
});
