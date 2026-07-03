import type { ExpenseCategory, PaymentStatus } from './types';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'ingredients', label: 'Ingredients (食材)' },
  { value: 'packaging', label: 'Packaging (包裝)' },
  { value: 'marketing', label: 'Marketing (市場推廣)' },
  { value: 'rent', label: 'Rent (租金)' },
  { value: 'other', label: 'Other (其他)' },
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
];

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
);

export const EXPENSE_STATUS_COLORS: Record<string, string> = {
  unpaid: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
};

export function formatMoney(amount: number | null | undefined, currency: 'HKD' | 'CNY'): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(amount);
}
