import { describe, expect, it } from 'vitest';
import {
  buildExpenseExportQuery,
  expenseExportFilenameSuffix,
  parseExpenseExportDate,
  parseExpenseExportFundingSource,
} from '@/lib/expense-export';

describe('expense-export', () => {
  it('builds export query string from filters', () => {
    const qs = buildExpenseExportQuery({
      paidFrom: '2026-01-01',
      paidTo: '2026-01-31',
      createdFrom: '',
      createdTo: '',
      fundingSource: 'cc_self',
    });
    expect(qs).toBe('?paid_from=2026-01-01&paid_to=2026-01-31&funding_source=cc_self');
  });

  it('validates dates and funding source', () => {
    expect(parseExpenseExportDate('2026-04-01')).toBe('2026-04-01');
    expect(parseExpenseExportDate('bad')).toBeNull();
    expect(parseExpenseExportFundingSource('cash')).toBe('cash');
    expect(parseExpenseExportFundingSource('invalid')).toBeNull();
  });

  it('builds filename suffix for active filters', () => {
    expect(
      expenseExportFilenameSuffix({
        paidFrom: '2026-04-01',
        paidTo: '',
        createdFrom: '',
        createdTo: '',
        fundingSource: '',
      })
    ).toBe('-paid-2026-04-01-to-end');
  });
});
