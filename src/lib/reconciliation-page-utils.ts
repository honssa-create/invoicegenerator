import {
  AMOUNT_TOLERANCE,
  amountsClose,
  isWithinHours,
  MEDIUM_MATCH_WINDOW_HOURS,
  type PaymentMethod,
  type ReconciliationRecord,
} from '@/lib/reconciliation';

export interface MatchCandidate {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_total: number | null;
  invoice_status: string | null;
  customer_name: string | null;
  phone: string | null;
}

export interface ReconciliationSummary {
  total: number;
  matched: number;
  unmatched: number;
  discrepancy: number;
  pendingApproval: number;
  pendingHigh: number;
  pendingMedium: number;
  grossTotal: number;
  netTotal: number;
  feeTotal: number;
}

export type ZoneFilter = 'high' | 'medium' | 'attention' | 'matched';
export type ReconciliationSortKey =
  | 'deposit_time'
  | 'gross_amount'
  | 'transaction_fee'
  | 'net_amount'
  | 'status'
  | 'created_at'
  | 'created_by';
export type ReconciliationView = 'reconciliation' | 'accounting';

export const RECONCILIATION_TABLE_COL_COUNT = 7;
export const RECONCILIATION_PAGE_SIZE = 50;

export const EMPTY_MANUAL_PAYMENT = {
  amount: '',
  payment_method: 'FPS' as PaymentMethod,
  transaction_id: '',
  invoice_no: '',
  order_no: '',
  remarks: '',
};

export const RECONCILIATION_ZONE_META: Record<
  ZoneFilter,
  { title: string; icon: string; color: string; ring: string }
> = {
  high: {
    title: 'Pending High 高信心',
    icon: '🎯',
    color: 'bg-blue-50 text-blue-700',
    ring: 'ring-blue-500',
  },
  medium: {
    title: 'Pending Medium 中信心',
    icon: '🔍',
    color: 'bg-indigo-50 text-indigo-700',
    ring: 'ring-indigo-500',
  },
  attention: {
    title: 'Needs Attention 待處理',
    icon: '⚠️',
    color: 'bg-amber-50 text-amber-700',
    ring: 'ring-amber-500',
  },
  matched: {
    title: 'Matched 已對帳',
    icon: '✅',
    color: 'bg-green-50 text-green-700',
    ring: 'ring-green-500',
  },
};

export const RECONCILIATION_SELECT_CLS =
  'w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

export function depositDateKey(v: string): string {
  return v.replace('T', ' ').slice(0, 10);
}

export function parseReconciliationAmountHint(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseDepositDate(v: string): Date | null {
  const s = v.replace('T', ' ').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '12', mi = '0', se = '0'] = m;
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +se);
  return isNaN(dt.getTime()) ? null : dt;
}

export function isRelatedPendingRecord(
  r: ReconciliationRecord,
  linkOrderId: number,
  amountHint: number | null,
  dateHint: string | null,
): boolean {
  if (r.status === 'Matched') return false;
  if (r.suggested_order_id === linkOrderId) return true;
  if (r.candidates?.some((c) => c.order_id === linkOrderId)) return true;
  if (amountHint != null && amountsClose(r.gross_amount, amountHint, AMOUNT_TOLERANCE)) {
    if (!dateHint) return true;
    const deposit = parseDepositDate(r.deposit_time);
    const anchor = parseDepositDate(dateHint);
    if (deposit && anchor && isWithinHours(deposit, anchor, MEDIUM_MATCH_WINDOW_HOURS)) return true;
  }
  return false;
}

export function reconciliationRecordInZone(r: ReconciliationRecord, zone: ZoneFilter): boolean {
  if (zone === 'high') return r.status === 'Pending Approval' && r.confidence === 'high';
  if (zone === 'medium') return r.status === 'Pending Approval' && r.confidence === 'medium';
  if (zone === 'attention') return r.status === 'Unmatched' || r.status === 'Discrepancy';
  return r.status === 'Matched';
}

export function formatReconciliationDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  return v.replace('T', ' ').slice(0, 16);
}
