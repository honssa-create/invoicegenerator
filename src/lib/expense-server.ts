import db from './db';
import type { Expense } from './types';
import { DEFAULT_SUPPLIERS } from './expense-suppliers';

export type ExpensePaymentCode = 'CC' | 'CS' | 'BT' | 'OT';

export const EXPENSE_BATCH_RE = /^EXP-\d{6}-\d{3}$/;
export const EXPENSE_RECEIPT_RE = /^EXP-\d{6}-\d{3}-(CC|CS|BT|OT)\d{3}$/;

export function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function expenseYm(expenseDate?: string | null): string {
  const src = expenseDate && /^\d{4}-\d{2}/.test(expenseDate) ? expenseDate : new Date().toISOString();
  return src.slice(0, 7).replace('-', '');
}

/** Map payment method label → CC / CS / BT / OT. */
export function paymentMethodCode(method: string | null | undefined): ExpensePaymentCode {
  const m = (method || '').toLowerCase();
  if (/credit\s*card|信用卡|credit|0860/.test(m)) return 'CC';
  if (/cash|現金|现金|hing現金/.test(m)) return 'CS';
  if (/bank|transfer|轉帳|转账|fps|payme|wire|cheque|check/.test(m)) return 'BT';
  return 'OT';
}

function maxBatchSerial(userId: number, ym: string): number {
  const prefix = `EXP-${ym}-`;
  let max = 0;
  const bump = (value: string | null | undefined) => {
    if (!value?.startsWith(prefix)) return;
    const m = /^EXP-\d{6}-(\d{3})(?:-|$)/.exec(value);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  };
  const batchRows = db
    .prepare('SELECT batch_id FROM expenses WHERE user_id = ? AND batch_id LIKE ?')
    .all(userId, `${prefix}%`) as { batch_id: string | null }[];
  for (const r of batchRows) bump(r.batch_id);
  const receiptRows = db
    .prepare('SELECT receipt_no FROM expenses WHERE user_id = ? AND receipt_no LIKE ?')
    .all(userId, `${prefix}%`) as { receipt_no: string | null }[];
  for (const r of receiptRows) bump(r.receipt_no);
  return max;
}

/** Batch ID: EXP-YYYYMM-XXX (month from expense date, serial per user+month). */
export function generateBatchId(userId: number, expenseDate?: string | null): string {
  const ym = expenseYm(expenseDate);
  const next = maxBatchSerial(userId, ym) + 1;
  return `EXP-${ym}-${String(next).padStart(3, '0')}`;
}

/** Latest batch ID for user+month (highest EXP-YYYYMM-XXX serial), or null. */
export function getLatestBatchId(userId: number, expenseDate?: string | null): string | null {
  const ym = expenseYm(expenseDate);
  const prefix = `EXP-${ym}-`;
  const maxSerial = maxBatchSerial(userId, ym);
  if (maxSerial < 1) return null;
  return `${prefix}${String(maxSerial).padStart(3, '0')}`;
}

/** Parse trailing 3-digit serial from a full receipt number. */
export function parseReceiptSerial(receiptNo: string | null | undefined): number | null {
  const m = EXPENSE_RECEIPT_RE.exec(receiptNo || '');
  if (!m) return null;
  return parseInt(receiptNo!.slice(-3), 10);
}

function maxReceiptSerialInBatch(
  userId: number,
  batchId: string,
  excludeExpenseId?: number,
): number {
  const escaped = batchId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}-(CC|CS|BT|OT)(\\d{3})$`);
  const rows = db
    .prepare(
      excludeExpenseId != null
        ? 'SELECT receipt_no FROM expenses WHERE user_id = ? AND batch_id = ? AND id != ?'
        : 'SELECT receipt_no FROM expenses WHERE user_id = ? AND batch_id = ?',
    )
    .all(
      ...(excludeExpenseId != null
        ? [userId, batchId, excludeExpenseId]
        : [userId, batchId]),
    ) as { receipt_no: string | null }[];
  let max = 0;
  for (const r of rows) {
    const m = re.exec(r.receipt_no || '');
    if (m) max = Math.max(max, parseInt(m[2], 10));
  }
  return max;
}

/** Receipt no: {batchId}-{CC|CS|BT|OT}NNN — last 3 digits serial per batch (all payment codes). */
export function generateReceiptNumber(
  userId: number,
  batchId: string,
  paymentMethod: string | null | undefined,
  excludeExpenseId?: number,
): string {
  const code = paymentMethodCode(paymentMethod);
  const next = maxReceiptSerialInBatch(userId, batchId, excludeExpenseId) + 1;
  return `${batchId}-${code}${String(next).padStart(3, '0')}`;
}

export interface AssignExpenseNumbersOptions {
  /** Reuse this batch (e.g. explicit batch from caller). */
  batchId?: string | null;
  /** Continue the latest month batch instead of starting EXP-YYYYMM-XXX+1. */
  reuseBatch?: boolean;
}

/** Assign batch + receipt numbers on create (upload / manual save / import). */
export function assignExpenseNumbers(
  userId: number,
  expenseDate: string | null | undefined,
  paymentMethod: string | null | undefined,
  options?: AssignExpenseNumbersOptions,
): { batchId: string; receiptNo: string } {
  let batchId = options?.batchId?.trim() || '';
  if (batchId && !EXPENSE_BATCH_RE.test(batchId)) batchId = '';
  if (!batchId) {
    batchId = options?.reuseBatch
      ? (getLatestBatchId(userId, expenseDate) || generateBatchId(userId, expenseDate))
      : generateBatchId(userId, expenseDate);
  }
  const receiptNo = generateReceiptNumber(userId, batchId, paymentMethod);
  return { batchId, receiptNo };
}

/** Re-issue receipt when payment method changes — keeps the same 3-digit serial. */
export function reissueReceiptNumber(
  userId: number,
  expenseId: number,
  batchId: string,
  paymentMethod: string | null | undefined,
): string {
  const row = db
    .prepare('SELECT receipt_no FROM expenses WHERE id = ? AND user_id = ?')
    .get(expenseId, userId) as { receipt_no: string | null } | undefined;
  const code = paymentMethodCode(paymentMethod);
  const serial = parseReceiptSerial(row?.receipt_no);
  if (serial != null) {
    return `${batchId}-${code}${String(serial).padStart(3, '0')}`;
  }
  return generateReceiptNumber(userId, batchId, paymentMethod, expenseId);
}

// Insert a custom dropdown option if it is not already a default or existing value.
// Used by both the options API and batch import "tag sync".
const DEFAULTS: Record<string, string[]> = {
  payment_method: ['Credit Card 0860', '現金', '淘寶', '拼多多', '其他，請註明', 'Hing現金'],
  category: ['包裝用品', '公司用品', '快遞費用', '燕南豐包裝物資', 'Honour打版', 'Honour貨款月結', 'Honour貨款(單次)'],
  platform: ['淘寶', '拼多多', '支付寶', 'e-print', '其他，見收據', '其他'],
  supplier: [...DEFAULT_SUPPLIERS],
};

export function syncOption(userId: number, type: string, value: string | null | undefined): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed || !DEFAULTS[type]) return false;
  if (DEFAULTS[type].includes(trimmed)) return false;
  const existing = db
    .prepare('SELECT 1 FROM expense_options WHERE user_id = ? AND type = ? AND value = ?')
    .get(userId, type, trimmed);
  if (existing) return false;
  db.prepare('INSERT OR IGNORE INTO expense_options (user_id, type, value) VALUES (?, ?, ?)').run(
    userId,
    type,
    trimmed
  );
  return true;
}

// Supports both the new receipt_paths array and the legacy single receipt_path field.
export function receiptPathsFromBody(body: Record<string, unknown>): string[] {
  const list = Array.isArray(body.receipt_paths) ? body.receipt_paths : [];
  const paths = list.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  if (!paths.length && typeof body.receipt_path === 'string' && body.receipt_path.trim()) {
    paths.push(body.receipt_path.trim());
  }
  return Array.from(new Set(paths));
}

export function attachReceipts(expenses: Expense[]): Expense[] {
  if (!expenses.length) return expenses;
  const ids = expenses.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, expense_id, path FROM expense_receipts WHERE expense_id IN (${placeholders}) ORDER BY id`
    )
    .all(...ids) as { id: number; expense_id: number; path: string }[];
  const map = new Map<number, { id: number; path: string }[]>();
  for (const r of rows) {
    if (!map.has(r.expense_id)) map.set(r.expense_id, []);
    map.get(r.expense_id)!.push({ id: r.id, path: r.path });
  }
  for (const e of expenses) {
    const attached = map.get(e.id) || [];
    if (attached.length > 0) {
      e.receipts = attached;
    } else if (e.receipt_path?.trim()) {
      // Legacy single receipt_path — PrintView resolves id 0 to /api/expenses/[id]/receipt
      e.receipts = [{ id: 0, path: e.receipt_path.trim() }];
    } else {
      e.receipts = [];
    }
  }
  return expenses;
}
