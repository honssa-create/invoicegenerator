export const INCOME_CATEGORIES = ['租金收入', '寄售分賬', '其他'];
export const RECEIVED_ACCOUNTS = ['HSBC', 'BOC', 'PayMe', 'FPS'];

export interface LedgerEntry {
  key: string;
  kind: 'product' | 'other';
  date: string;
  category: string; // "Product Sale" or the income category
  ref: string; // order # / title or remarks
  account: string;
  amount: number;
  receiptUrl: string | null;
  verified: boolean;
  orderId?: number;
  incomeId?: number;
}

export interface CashflowTotals {
  productSales: number;
  otherIncome: number;
  gross: number;
}

export interface CashflowResponse {
  month: string; // YYYY-MM
  totals: CashflowTotals;
  entries: LedgerEntry[];
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' }).format(n || 0);
}
