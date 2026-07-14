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

/** Dropdown supplier, or one-time free-text supplier when not in the list. */
export function expenseSupplierName(expense: {
  merchant?: string | null;
  supplier_input?: string | null;
}): string {
  return expense.merchant?.trim() || expense.supplier_input?.trim() || '';
}

export const PAYMENT_CHANNELS = [
  { value: 'direct', label: 'Direct (直接商戶支付)' },
  { value: 'alipay', label: 'Alipay' },
  { value: 'paypal', label: 'PayPal' },
] as const;

export type PaymentChannelId = (typeof PAYMENT_CHANNELS)[number]['value'];

export const FUNDING_SOURCES = [
  { value: 'cc_self', label: 'Credit Card - Self (員工私人信用卡)' },
  { value: 'cc_company', label: 'Credit Card - Company (公司信用卡 0860)' },
  { value: 'alipay_balance', label: 'Alipay Balance (支付寶餘額)' },
  { value: 'paypal_balance', label: 'PayPal Balance (PayPal 餘額)' },
  { value: 'cash', label: '現金 (Cash)' },
] as const;

export type FundingSourceId = (typeof FUNDING_SOURCES)[number]['value'];

export const FUNDING_SOURCE_CC_SELF: FundingSourceId = 'cc_self';

/** Receipt No. suffix codes (Funding Source → code). */
export const FUNDING_SOURCE_CODES: Record<FundingSourceId, string> = {
  cc_self: 'CCS',
  cc_company: 'CCC',
  alipay_balance: 'AB',
  paypal_balance: 'PB',
  cash: 'CS',
};

export const FUNDING_SOURCE_CODE_VALUES = ['CCS', 'CCC', 'AB', 'PB', 'CS'] as const;
export type FundingSourceCode = (typeof FUNDING_SOURCE_CODE_VALUES)[number];

export function fundingSourceToCode(source: FundingSourceId | string | null | undefined): FundingSourceCode | null {
  if (!source) return null;
  return (FUNDING_SOURCE_CODES as Record<string, string>)[source] as FundingSourceCode | undefined ?? null;
}

const PAYMENT_CHANNEL_LABELS = Object.fromEntries(PAYMENT_CHANNELS.map((o) => [o.value, o.label]));
const FUNDING_SOURCE_LABELS = Object.fromEntries(FUNDING_SOURCES.map((o) => [o.value, o.label]));

export function paymentChannelLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return PAYMENT_CHANNEL_LABELS[value] || value;
}

export function fundingSourceLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return FUNDING_SOURCE_LABELS[value] || value;
}

/** Display payment info for table/detail — prefers new fields, falls back to legacy payment_method. */
export function expensePaymentDisplay(expense: {
  payment_channel?: string | null;
  funding_source?: string | null;
  card_last4?: string | null;
  payment_method?: string | null;
}): string {
  if (expense.funding_source || expense.payment_channel) {
    const parts = [
      expense.payment_channel ? paymentChannelLabel(expense.payment_channel) : null,
      expense.funding_source ? fundingSourceLabel(expense.funding_source) : null,
      expense.funding_source === FUNDING_SOURCE_CC_SELF && expense.card_last4
        ? `•••• ${expense.card_last4}`
        : null,
    ].filter(Boolean);
    return parts.join(' · ') || '—';
  }
  return expense.payment_method?.trim() || '—';
}

/** Map legacy payment_method values when editing old records. */
export function legacyPaymentToFundingSource(paymentMethod: string | null | undefined): FundingSourceId | '' {
  const m = (paymentMethod || '').toLowerCase();
  if (/0860|company/.test(m)) return 'cc_company';
  if (/credit\s*card|信用卡|credit/.test(m)) return 'cc_self';
  if (/alipay|支付寶|支付宝/.test(m)) return 'alipay_balance';
  if (/paypal/.test(m)) return 'paypal_balance';
  if (/cash|現金|现金|hing/.test(m)) return 'cash';
  return '';
}

export function legacyPaymentToChannel(paymentMethod: string | null | undefined): PaymentChannelId | '' {
  const m = (paymentMethod || '').toLowerCase();
  if (/alipay|支付寶|支付宝|淘寶|拼多多/.test(m)) return 'alipay';
  if (/paypal/.test(m)) return 'paypal';
  if (paymentMethod?.trim()) return 'direct';
  return '';
}

export function isValidCardLast4(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function formatMoney(amount: number | null | undefined, currency: 'HKD' | 'CNY'): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(amount);
}
