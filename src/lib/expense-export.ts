import type { FundingSourceId } from '@/lib/expenses';
import { FUNDING_SOURCES } from '@/lib/expenses';

export type ExpenseExportFilters = {
  paidFrom: string;
  paidTo: string;
  createdFrom: string;
  createdTo: string;
  fundingSource: FundingSourceId | '';
};

export const EMPTY_EXPENSE_EXPORT_FILTERS: ExpenseExportFilters = {
  paidFrom: '',
  paidTo: '',
  createdFrom: '',
  createdTo: '',
  fundingSource: '',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseExpenseExportDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return DATE_RE.test(trimmed) ? trimmed : null;
}

export function parseExpenseExportFundingSource(
  value: string | null
): FundingSourceId | null {
  if (!value?.trim()) return null;
  const id = value.trim() as FundingSourceId;
  return FUNDING_SOURCES.some((o) => o.value === id) ? id : null;
}

export function buildExpenseExportQuery(filters: ExpenseExportFilters): string {
  const params = new URLSearchParams();
  if (filters.paidFrom) params.set('paid_from', filters.paidFrom);
  if (filters.paidTo) params.set('paid_to', filters.paidTo);
  if (filters.createdFrom) params.set('created_from', filters.createdFrom);
  if (filters.createdTo) params.set('created_to', filters.createdTo);
  if (filters.fundingSource) params.set('funding_source', filters.fundingSource);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function expenseExportFilenameSuffix(filters: ExpenseExportFilters): string {
  const parts: string[] = [];
  if (filters.paidFrom || filters.paidTo) {
    parts.push(`paid-${filters.paidFrom || 'start'}-to-${filters.paidTo || 'end'}`);
  }
  if (filters.createdFrom || filters.createdTo) {
    parts.push(`created-${filters.createdFrom || 'start'}-to-${filters.createdTo || 'end'}`);
  }
  if (filters.fundingSource) parts.push(filters.fundingSource);
  return parts.length ? `-${parts.join('_')}` : '';
}
