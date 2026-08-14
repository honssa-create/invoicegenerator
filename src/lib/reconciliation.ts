/** Client-safe reconciliation types and constants. */

export const PAYMENT_METHODS = ['Yedpay', 'FPS', 'Payme', '現金', '支票', '銀行轉帳'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECONCILIATION_STATUSES = ['Unmatched', 'Pending Approval', 'Matched', 'Discrepancy'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const RECON_CONFIDENCE = ['high', 'medium'] as const;
export type ReconConfidence = (typeof RECON_CONFIDENCE)[number];

export const AMOUNT_TOLERANCE = 0.02;
export const MEDIUM_MATCH_WINDOW_HOURS = 48;

export interface ReconCandidateSummary {
  order_id: number;
  order_no: string;
  invoice_id?: number | null;
  invoice_number?: string | null;
  amount?: number | null;
  customer_name?: string | null;
}

export interface ReconciliationRecord {
  id: number;
  order_no: string | null;
  order_id: number | null;
  invoice_id: number | null;
  invoice_number: string | null;
  deposit_time: string;
  gross_amount: number;
  payment_method: PaymentMethod;
  status: ReconciliationStatus;
  transaction_fee: number;
  net_amount: number;
  remarks: string | null;
  receipt_path: string | null;
  source: 'yedpay' | 'bank_upload' | 'manual';
  external_id: string | null;
  matched_at: string | null;
  confidence: ReconConfidence | null;
  suggested_order_id: number | null;
  suggested_invoice_id: number | null;
  candidates: ReconCandidateSummary[];
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  /** Hydrated for UI when suggested_order_id is set */
  suggested_order_no?: string | null;
  suggested_customer_name?: string | null;
  suggested_invoice_number?: string | null;
  suggested_amount?: number | null;
}

export const RECON_STATUS_COLORS: Record<ReconciliationStatus, string> = {
  Unmatched: 'bg-amber-100 text-amber-800',
  'Pending Approval': 'bg-blue-100 text-blue-800',
  Matched: 'bg-green-100 text-green-800',
  Discrepancy: 'bg-red-100 text-red-800',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  Yedpay: 'Yedpay',
  FPS: 'FPS 轉數快',
  Payme: 'PayMe',
  現金: '現金',
  支票: '支票',
  銀行轉帳: '銀行轉帳',
};

export const METHOD_HINTS: Record<PaymentMethod, string[]> = {
  Yedpay: ['yedpay', 'yed pay'],
  FPS: ['fps', '轉數快', '轉数快', 'faster payment'],
  Payme: ['payme', 'pay me'],
  現金: ['現金', 'cash'],
  支票: ['支票', 'cheque', 'check'],
  銀行轉帳: ['銀行轉帳', '银行转帐', 'bank transfer', 'wire transfer', 'tt'],
};

export function amountsClose(a: number, b: number, tolerance = AMOUNT_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** True when `deposit` is within ±`hours` of `anchor` (both parseable datetimes). */
export function isWithinHours(deposit: Date, anchor: Date, hours: number): boolean {
  const ms = hours * 60 * 60 * 1000;
  return deposit.getTime() >= anchor.getTime() - ms && deposit.getTime() <= anchor.getTime() + ms;
}

export function paymentMethodMatches(
  paymentMethod: PaymentMethod,
  paymentFieldsJoined: string,
  opts?: { allowEmptyForBankMethods?: boolean }
): boolean {
  const text = paymentFieldsJoined.toLowerCase().trim();
  const hints = METHOD_HINTS[paymentMethod];
  if (hints.some((h) => text.includes(h))) return true;
  if (!text && opts?.allowEmptyForBankMethods && (paymentMethod === 'FPS' || paymentMethod === 'Payme')) {
    return true;
  }
  if (!text && paymentMethod === 'Yedpay') return true;
  return false;
}

/** Classify medium-match candidate list: unique suggestion, collision, or none. */
export function classifyMediumCandidates<T>(candidates: T[]): {
  kind: 'unique' | 'collision' | 'none';
  pick: T | null;
} {
  if (candidates.length === 0) return { kind: 'none', pick: null };
  if (candidates.length === 1) return { kind: 'unique', pick: candidates[0] };
  return { kind: 'collision', pick: null };
}
