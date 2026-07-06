import type { PaymentStatus } from './types';
import { DEFAULT_SUPPLIERS } from './expense-suppliers';

// Legacy category values (kept so older records still display a friendly label).
export const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
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

// Dynamic dropdown option types + their built-in defaults. Users can add more
// (stored in the expense_options table) and they merge with these.
export type OptionType = 'payment_method' | 'category' | 'platform' | 'supplier';

export const OPTION_TYPES: OptionType[] = ['payment_method', 'category', 'platform', 'supplier'];

export const DEFAULT_OPTIONS: Record<OptionType, string[]> = {
  payment_method: ['Credit Card 0860', '現金', '淘寶', '拼多多', '其他，請註明', 'Hing現金'],
  category: [
    '包裝用品',
    '公司用品',
    '快遞費用',
    '燕南豐包裝物資',
    'Honour打版',
    'Honour貨款月結',
    'Honour貨款(單次)',
  ],
  platform: ['淘寶', '拼多多', '支付寶', 'e-print', '其他，見收據', '其他'],
  supplier: [...DEFAULT_SUPPLIERS],
};

export const OPTION_LABELS: Record<OptionType, string> = {
  payment_method: 'Payment Method 支付方式',
  category: 'Expense Reason 支出原因',
  platform: 'Shopping Platform 消費平台',
  supplier: 'Supplier 供應商',
};

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CATEGORY_LABELS[value] || value;
}

export function formatMoney(amount: number | null | undefined, currency: 'HKD' | 'CNY'): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(amount);
}
