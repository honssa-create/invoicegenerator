import { describe, expect, it } from 'vitest';
import {
  OSMANTHUS_DAY_PRINT_TABLE_COLUMNS,
  OSMANTHUS_DAY_PRINT_TABLE_TOTAL_LABEL,
} from './osmanthus-table-columns';

/** Locks the post–PR #176 桂花 table header row and footer label. */
describe('osmanthus day-print table contract', () => {
  it('matches production column headers and order', () => {
    expect(OSMANTHUS_DAY_PRINT_TABLE_COLUMNS.map((col) => col.label)).toEqual([
      '容量',
      '今次要燉',
      '燕餅 g',
      '桂花 g',
      '片糖 g',
      '水(煮糖) g',
      '水(冷泡) g',
    ]);
  });

  it('uses 桂花合計 footer label', () => {
    expect(OSMANTHUS_DAY_PRINT_TABLE_TOTAL_LABEL).toBe('桂花合計');
  });
});
