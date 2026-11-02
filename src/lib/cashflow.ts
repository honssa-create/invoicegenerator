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
  total?: number;
  limit?: number;
  offset?: number;
}

/** `YYYY-MM` in Asia/Hong_Kong. UTC `toISOString` is a different calendar day near midnight. */
export function currentMonth(now: Date = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return day.slice(0, 7);
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' }).format(n || 0);
}
