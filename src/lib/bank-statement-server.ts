import * as XLSX from 'xlsx';
import db from './db';
import { listOrders } from './order-server';
import { orderTitle } from './orders';
import type {
  BankImportResponse,
  BankStatementRow,
  ConfirmMatchPayload,
  ReconcileMatch,
  ReconcileRowResult,
  UnclaimedDeposit,
} from './bank-statement';

const MAX_BYTES = 15 * 1024 * 1024;

const ALIASES: Record<string, string[]> = {
  date: ['transaction date', '交易日期', 'date', '日期', 'txn date', 'value date', '起息日'],
  description: ['description', 'remarks', '摘要備註', '摘要', '備註', 'remark', 'narrative', 'details', '交易摘要'],
  deposit: ['deposit amount', '入帳金額', 'deposit', 'credit', '入帳', '存入', 'credit amount', '收入', 'deposit (hkd)'],
};

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number' && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s);
  if (m) {
    let d = +m[1];
    let mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return `${m[3]}-${pad(mo)}-${pad(d)}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  return null;
}

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pickField(row: Record<string, unknown>, field: string): unknown {
  const aliases = ALIASES[field];
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase();
    if (aliases.some((a) => a.toLowerCase() === norm)) return row[key];
  }
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase();
    if (aliases.some((a) => norm.includes(a.toLowerCase()))) return row[key];
  }
  return undefined;
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T12:00:00');
  const db_ = new Date(b + 'T12:00:00');
  if (isNaN(da.getTime()) || isNaN(db_.getTime())) return Infinity;
  return Math.abs(Math.round((da.getTime() - db_.getTime()) / 86400000));
}

export function parseBankStatementFile(buffer: Buffer, filename: string): BankStatementRow[] {
  const name = filename.toLowerCase();
  const wb = name.endsWith('.csv')
    ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
    : XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];

  const parsed: BankStatementRow[] = [];
  for (const row of rawRows) {
    const txn_date = toISODate(pickField(row, 'date'));
    const description = String(pickField(row, 'description') ?? '').trim();
    let deposit = toAmount(pickField(row, 'deposit'));

    // Fallback: a generic "amount" column with positive values treated as deposits.
    if (deposit === null || deposit <= 0) {
      const generic = toAmount(
        row['amount'] ?? row['Amount'] ?? row['金額'] ?? row['AMOUNT']
      );
      if (generic !== null && generic > 0) deposit = generic;
    }

    if (!txn_date || deposit === null || deposit <= 0) continue;
    parsed.push({ txn_date, description, deposit_amount: deposit });
  }
  return parsed;
}

interface PaymentCandidate {
  type: 'order' | 'income';
  id: number;
  ref: string;
  reference: string;
  amount: number;
  date: string;
  bankCleared: boolean;
}

function loadPaymentCandidates(userId: number): PaymentCandidate[] {
  const candidates: PaymentCandidate[] = [];

  for (const o of listOrders(userId)) {
    const amt = Number(o.fields.payment_amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const date = (o.fields.payment_date as string) || o.created_at.slice(0, 10);
    const reference = String(o.fields.payment_reference || '').trim();
    const bankCleared =
      o.fields.payment_bank_cleared === true || o.fields.payment_bank_cleared === 'true';
    candidates.push({
      type: 'order',
      id: o.id,
      ref: o.po_number || orderTitle(o),
      reference,
      amount: amt,
      date,
      bankCleared,
    });
  }

  const incomes = db
    .prepare('SELECT id, txn_date, amount, remarks, bank_cleared, created_at FROM other_income WHERE user_id = ?')
    .all(userId) as {
    id: number;
    txn_date: string | null;
    amount: number;
    remarks: string | null;
    bank_cleared: number;
    created_at: string;
  }[];

  for (const r of incomes) {
    if (!r.amount || r.amount <= 0) continue;
    candidates.push({
      type: 'income',
      id: r.id,
      ref: r.remarks || `Income #${r.id}`,
      reference: String(r.remarks || '').trim(),
      amount: r.amount,
      date: r.txn_date || r.created_at.slice(0, 10),
      bankCleared: r.bank_cleared === 1,
    });
  }

  return candidates;
}

function findExactMatch(
  row: BankStatementRow,
  candidates: PaymentCandidate[],
  used: Set<string>
): ReconcileMatch | null {
  const desc = row.description.toUpperCase();
  for (const c of candidates) {
    if (c.bankCleared) continue;
    const key = `${c.type}-${c.id}`;
    if (used.has(key)) continue;
    if (!c.reference || c.reference.length < 3) continue;
    if (desc.includes(c.reference.toUpperCase())) {
      return {
        type: c.type,
        id: c.id,
        ref: c.ref,
        amount: c.amount,
        date: c.date,
        rule: 'exact',
      };
    }
  }
  return null;
}

function findFuzzyMatch(
  row: BankStatementRow,
  candidates: PaymentCandidate[],
  used: Set<string>
): ReconcileMatch | null {
  for (const c of candidates) {
    if (c.bankCleared) continue;
    const key = `${c.type}-${c.id}`;
    if (used.has(key)) continue;
    if (!amountsEqual(row.deposit_amount, c.amount)) continue;
    if (daysBetween(row.txn_date, c.date) > 3) continue;
    return {
      type: c.type,
      id: c.id,
      ref: c.ref,
      amount: c.amount,
      date: c.date,
      rule: 'fuzzy',
    };
  }
  return null;
}

function markOrderBankCleared(orderId: number, userId: number) {
  const existing = db
    .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(orderId, userId) as { fields_json: string } | undefined;
  if (!existing) return;
  let fields: Record<string, unknown> = {};
  try {
    fields = existing.fields_json ? JSON.parse(existing.fields_json) : {};
  } catch {
    fields = {};
  }
  fields.payment_bank_cleared = true;
  fields.payment_verified = true;
  db.prepare("UPDATE orders SET fields_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(
    JSON.stringify(fields),
    orderId,
    userId
  );
}

function markIncomeBankCleared(incomeId: number, userId: number) {
  db.prepare('UPDATE other_income SET bank_cleared = 1, verified = 1 WHERE id = ? AND user_id = ?').run(
    incomeId,
    userId
  );
}

export function markBankCleared(type: 'order' | 'income', id: number, userId: number) {
  if (type === 'order') markOrderBankCleared(id, userId);
  else markIncomeBankCleared(id, userId);
}

export function reconcileBankStatement(userId: number, rows: BankStatementRow[]): BankImportResponse {
  const candidates = loadPaymentCandidates(userId);
  const used = new Set<string>();
  const results: ReconcileRowResult[] = [];
  let autoCleared = 0;
  let suggested = 0;
  let unclaimed = 0;
  let skipped = 0;

  const insertUnclaimed = db.prepare(
    'INSERT INTO unclaimed_bank_deposits (user_id, txn_date, amount, description) VALUES (?, ?, ?, ?)'
  );

  const run = db.transaction(() => {
    for (const row of rows) {
      const exact = findExactMatch(row, candidates, used);
      if (exact) {
        markBankCleared(exact.type, exact.id, userId);
        used.add(`${exact.type}-${exact.id}`);
        results.push({ row, status: 'auto_cleared', match: exact });
        autoCleared++;
        continue;
      }

      const fuzzy = findFuzzyMatch(row, candidates, used);
      if (fuzzy) {
        results.push({ row, status: 'suggested', match: fuzzy });
        suggested++;
        continue;
      }

      const res = insertUnclaimed.run(userId, row.txn_date, row.deposit_amount, row.description || null);
      results.push({
        row,
        status: 'unclaimed',
        unclaimedId: Number(res.lastInsertRowid),
      });
      unclaimed++;
    }
  });

  if (rows.length === 0) skipped = 0;
  run();

  return {
    summary: { total: rows.length, autoCleared, suggested, unclaimed, skipped },
    results,
  };
}

export function confirmSuggestedMatches(userId: number, matches: ConfirmMatchPayload[]): number {
  let confirmed = 0;
  const run = db.transaction(() => {
    for (const m of matches) {
      markBankCleared(m.type, m.id, userId);
      confirmed++;
    }
  });
  run();
  return confirmed;
}

export function listUnclaimedDeposits(userId: number): UnclaimedDeposit[] {
  return db
    .prepare(
      'SELECT id, txn_date, amount, description, created_at FROM unclaimed_bank_deposits WHERE user_id = ? ORDER BY txn_date DESC, id DESC'
    )
    .all(userId) as UnclaimedDeposit[];
}

export function parseAndReconcileUpload(buffer: Buffer, filename: string, userId: number): BankImportResponse {
  if (buffer.length > MAX_BYTES) throw new Error('File too large (max 15 MB)');
  const lower = filename.toLowerCase();
  if (!/\.(csv|xlsx|xls)$/.test(lower)) throw new Error('Unsupported file. Use .csv, .xlsx or .xls');
  const rows = parseBankStatementFile(buffer, filename);
  return reconcileBankStatement(userId, rows);
}
