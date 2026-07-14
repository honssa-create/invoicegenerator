import db from './db';
import type { Expense } from './types';
import { DEFAULT_SUPPLIERS } from './expense-suppliers';
import {
  fundingSourceToCode,
  type FundingSourceId,
} from './expenses';

/** Parent Batch ID: EXP-0000001 (global 7-digit serial, never resets). */
export const EXPENSE_REPORT_ID_RE = /^EXP-\d{7}$/;

/** @deprecated Prior 6-digit parent IDs (EXP-000001). */
export const LEGACY_EXPENSE_REPORT_ID_RE = /^EXP-\d{6}$/;

/** Child Receipt No.: EXP-YYYYMM-{CCS|CCC|AB|PB|CS}001 */
export const EXPENSE_RECEIPT_RE = /^EXP-(\d{6})-(CCS|CCC|AB|PB|CS)(\d{3})$/;

/** @deprecated Legacy batch format kept for old rows. */
export const LEGACY_EXPENSE_BATCH_RE = /^EXP-\d{6}-\d{3}$/;

/** @deprecated Legacy receipt format kept for old rows. */
export const LEGACY_EXPENSE_RECEIPT_RE = /^EXP-\d{6}-\d{3}-(CC|CS|BT|OT)\d{3}$/;

export function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** YYYYMM strictly from paid_date (required for receipt numbering). */
export function expensePaidYearMonth(paidDate: string | null | undefined): string | null {
  if (!paidDate || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate.trim())) return null;
  return paidDate.trim().slice(0, 7).replace('-', '');
}

export function requirePaidYearMonth(paidDate: string | null | undefined): string {
  const ym = expensePaidYearMonth(paidDate);
  if (!ym) {
    throw new Error('Paid date (支出日期) is required and must be YYYY-MM-DD for receipt numbering');
  }
  return ym;
}

function receiptPrefix(ym: string, code: string): string {
  return `EXP-${ym}-${code}`;
}

/** Extract the trailing 3-digit serial from a receipt number string. */
export function parseReceiptSequence(receiptNo: string | null | undefined): number | null {
  if (!receiptNo) return null;
  const m = EXPENSE_RECEIPT_RE.exec(receiptNo);
  if (m) return parseInt(m[3], 10);
  const tail = receiptNo.slice(-3);
  if (/^\d{3}$/.test(tail)) return parseInt(tail, 10);
  return null;
}

function maxReceiptSerialForPrefix(
  userId: number,
  prefix: string,
  excludeExpenseId?: number,
): number {
  const like = `${prefix}%`;
  const rows = (
    excludeExpenseId != null
      ? db
          .prepare(
            'SELECT receipt_no FROM expenses WHERE user_id = ? AND receipt_no LIKE ? AND id != ?',
          )
          .all(userId, like, excludeExpenseId)
      : db.prepare('SELECT receipt_no FROM expenses WHERE user_id = ? AND receipt_no LIKE ?').all(userId, like)
  ) as { receipt_no: string | null }[];

  let max = 0;
  for (const r of rows) {
    const seq = parseReceiptSequence(r.receipt_no);
    if (seq != null) max = Math.max(max, seq);
  }
  return max;
}

function isExpenseReportId(id: string): boolean {
  return EXPENSE_REPORT_ID_RE.test(id) || LEGACY_EXPENSE_REPORT_ID_RE.test(id);
}

/**
 * Allocate the next global Batch ID (EXP-0000001…).
 * Must run inside an IMMEDIATE transaction.
 */
export function allocateExpenseReportIdAtomic(): string {
  const row = db.prepare('SELECT next_serial FROM expense_report_sequence WHERE id = 1').get() as
    | { next_serial: number }
    | undefined;
  if (!row) {
    throw new Error('expense_report_sequence not initialized');
  }
  const allocated = row.next_serial;
  db.prepare('UPDATE expense_report_sequence SET next_serial = next_serial + 1 WHERE id = 1').run();
  return `EXP-${String(allocated).padStart(7, '0')}`;
}

/** Latest parent Batch ID for a user (EXP-0000001 format, or legacy 6-digit). */
export function getLatestExpenseReportId(userId: number): string | null {
  const rows = db
    .prepare(
      `SELECT batch_id FROM expenses
       WHERE user_id = ? AND batch_id LIKE 'EXP-%' AND batch_id NOT LIKE '%-%-%'
       ORDER BY id DESC`,
    )
    .all(userId) as { batch_id: string | null }[];
  for (const row of rows) {
    const id = row.batch_id?.trim();
    if (id && isExpenseReportId(id)) return id;
  }
  return null;
}

/**
 * Generate the next Receipt No. for YYYYMM + funding source code.
 * Must run inside an IMMEDIATE transaction.
 */
export function generateReceiptNumberAtomic(
  userId: number,
  paidDate: string,
  fundingSource: FundingSourceId,
  excludeExpenseId?: number,
): string {
  const ym = requirePaidYearMonth(paidDate);
  const code = fundingSourceToCode(fundingSource);
  if (!code) {
    throw new Error('Invalid funding source for receipt numbering');
  }
  const prefix = receiptPrefix(ym, code);
  const next = maxReceiptSerialForPrefix(userId, prefix, excludeExpenseId) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export interface AssignExpenseNumbersOptions {
  /** Reuse this parent Batch ID (e.g. import batch or explicit). */
  batchId?: string | null;
  /** Continue the user's latest Batch ID instead of allocating a new one. */
  reuseBatch?: boolean;
  fundingSource: FundingSourceId;
}

export interface AssignedExpenseNumbers {
  /** Parent Batch ID (stored in batch_id). */
  batchId: string;
  /** Child Receipt No. */
  receiptNo: string;
}

/**
 * Assign parent Batch ID + child Receipt No.
 * Call only inside db.transaction(...).immediate().
 */
export function assignExpenseNumbersAtomic(
  userId: number,
  paidDate: string,
  options: AssignExpenseNumbersOptions,
): AssignedExpenseNumbers {
  let batchId = options.batchId?.trim() || '';
  if (batchId && !isExpenseReportId(batchId)) {
    batchId = '';
  }
  if (!batchId) {
    if (options.reuseBatch) {
      batchId = getLatestExpenseReportId(userId) || allocateExpenseReportIdAtomic();
    } else {
      batchId = allocateExpenseReportIdAtomic();
    }
  }

  const receiptNo = generateReceiptNumberAtomic(userId, paidDate, options.fundingSource);
  return { batchId, receiptNo };
}

/** Re-issue receipt when paid_date or funding source changes on update. */
export function reissueReceiptNumberAtomic(
  userId: number,
  expenseId: number,
  paidDate: string,
  fundingSource: FundingSourceId,
): string {
  return generateReceiptNumberAtomic(userId, paidDate, fundingSource, expenseId);
}

export function receiptNumberPrefix(
  paidDate: string,
  fundingSource: FundingSourceId,
): string {
  const ym = requirePaidYearMonth(paidDate);
  const code = fundingSourceToCode(fundingSource);
  if (!code) throw new Error('Invalid funding source');
  return receiptPrefix(ym, code);
}

// ---------------------------------------------------------------------------
// Legacy helpers (import / old payment_method rows)
// ---------------------------------------------------------------------------

export type ExpensePaymentCode = 'CC' | 'CS' | 'BT' | 'OT';

/** @deprecated Use fundingSourceToCode for new receipt numbers. */
export function paymentMethodCode(
  method: string | null | undefined,
  fundingSource?: string | null | undefined,
): ExpensePaymentCode {
  if (fundingSource) {
    const code = fundingSourceToCode(fundingSource);
    if (code === 'CCS' || code === 'CCC') return 'CC';
    if (code === 'CS') return 'CS';
    return 'OT';
  }
  const m = (method || '').toLowerCase();
  if (/credit\s*card|信用卡|credit|0860/.test(m)) return 'CC';
  if (/cash|現金|现金|hing現金/.test(m)) return 'CS';
  if (/bank|transfer|轉帳|转账|fps|payme|wire|cheque|check/.test(m)) return 'BT';
  return 'OT';
}

// Insert a custom dropdown option if it is not already a default or existing value.
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
    trimmed,
  );
  return true;
}

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
      `SELECT id, expense_id, path FROM expense_receipts WHERE expense_id IN (${placeholders}) ORDER BY id`,
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
      e.receipts = [{ id: 0, path: e.receipt_path.trim() }];
    } else {
      e.receipts = [];
    }
  }
  return expenses;
}
