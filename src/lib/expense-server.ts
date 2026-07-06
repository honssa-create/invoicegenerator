import db from './db';
import type { Expense } from './types';
import { DEFAULT_SUPPLIERS } from './expense-suppliers';

export function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Build EXP-YYYYMM-XXX. YYYYMM comes from the expense date (not today), and XXX is
// the next serial after the current maximum for that month — so delayed/backfilled
// entries slot into their real month rather than the upload month.
export function generateReceiptNumber(userId: number, expenseDate?: string | null): string {
  const src = expenseDate && /^\d{4}-\d{2}/.test(expenseDate) ? expenseDate : new Date().toISOString();
  const ym = src.slice(0, 7).replace('-', '');
  const rows = db
    .prepare(`SELECT receipt_no FROM expenses WHERE user_id = ? AND receipt_no LIKE ?`)
    .all(userId, `EXP-${ym}-%`) as { receipt_no: string }[];
  let max = 0;
  for (const r of rows) {
    const m = /^EXP-\d{6}-(\d{3,})$/.exec(r.receipt_no || '');
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `EXP-${ym}-${String(max + 1).padStart(3, '0')}`;
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
  for (const e of expenses) e.receipts = map.get(e.id) || [];
  return expenses;
}
