/** Client-safe reconciliation types and constants. */

export const PAYMENT_METHODS = ['Yedpay', 'FPS', 'Payme'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECONCILIATION_STATUSES = ['Unmatched', 'Matched', 'Discrepancy'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

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
  source: 'yedpay' | 'bank_upload';
  external_id: string | null;
  matched_at: string | null;
  created_at: string;
}

export const RECON_STATUS_COLORS: Record<ReconciliationStatus, string> = {
  Unmatched: 'bg-amber-100 text-amber-800',
  Matched: 'bg-green-100 text-green-800',
  Discrepancy: 'bg-red-100 text-red-800',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  Yedpay: 'Yedpay',
  FPS: 'FPS 轉數快',
  Payme: 'PayMe',
};
