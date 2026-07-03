import db from './db';
import type { Expense } from './types';

export function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function generateReceiptNumber(userId: number): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND receipt_no LIKE ?`)
    .get(userId, `EXP-${year}-%`) as { count: number };
  return `EXP-${year}-${String(row.count + 1).padStart(4, '0')}`;
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
