import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, STATUS_COLORS } from './orders';

const EXPECTED_ORDER_STATUSES = [
  'OPEN',
  '快遞到件',
  'IN PROGRESS 安排中',
  '需長時間處理',
  '起版中 SAMPLE',
  'PRODUCTION 生產中',
  '有問題',
  '已到公司 BACK TO OFFICE',
  '已到公司 - 請安排包裝/PACK箱',
  '已到公司 - 已完成包裝',
  '可以寄出 READY TO SEND',
  '已寄出 SENT',
  '客退貨/客原版',
  '已處理',
  'FAIL',
] as const;

describe('order status workflow', () => {
  it('keeps the exact workflow order from the status board', () => {
    expect(ORDER_STATUSES).toEqual(EXPECTED_ORDER_STATUSES);
  });

  it('contains no duplicate statuses', () => {
    expect(new Set(ORDER_STATUSES).size).toBe(ORDER_STATUSES.length);
  });

  it('defines a badge color for every status', () => {
    for (const status of ORDER_STATUSES) {
      expect(STATUS_COLORS[status], status).toBeTruthy();
    }
  });
});
