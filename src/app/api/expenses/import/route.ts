import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { assignExpenseNumbers, expensePaidYearMonth, syncOption } from '@/lib/expense-server';
import {
  findReceiptColumnIndex,
  hyperlinkUrlsByDataRow,
  hyperlinkUrlsFromAllColumns,
  resolveImportReceiptPaths,
  type ReceiptFetchWarning,
} from '@/lib/expense-import-receipts';
import { getDataOwnerId } from '@/lib/org-server';

const MAX_BYTES = 15 * 1024 * 1024;

const ALIASES: Record<string, string[]> = {
  date: ['date', '日期', '支出日期', 'expense date', 'paid date', '付款日期', 'transaction date'],
  payment_method: ['payment method', '支付方式', 'payment', '付款方式'],
  category: ['expense reason', '支出原因', 'reason', 'category', '類別', '类别'],
  platform: ['shopping platform', '消費平台', 'platform', '消费平台'],
  amount: ['amount', '金額', '金额', 'amount (hkd)', 'hkd', 'total', '總額', '总额', '金额(hkd)', '支出金額(hkd)', '支出金额(hkd)'],
  amount_rmb: ['amount (rmb)', 'rmb', '支出金額(rmb)', '支出金额(rmb)', '人民币', '人民幣'],
  supplier: ['supplier', '供應商', '供应商', 'merchant', '商戶', '商户', 'vendor'],
  supplier_input: ['supplier input', '供應商(input)', '供应商(input)', '供應商 input', 'one-time supplier', '臨時供應商'],
  notes: ['notes', '注意事項', '注意事项', 'note', '備註', '备注'],
  special_notes: ['special notes', '特別事項', '特别事项', '特別注意', '特别注意', 'special note'],
};

const pad = (n: number) => String(n).padStart(2, '0');

function toISODate(v: unknown): string | null {
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

function mergeUrlMaps(primary: Map<number, string[]>, fallback: Map<number, string[]>): Map<number, string[]> {
  const merged = new Map(primary);
  fallback.forEach((urls, idx) => {
    if (!merged.has(idx) || !merged.get(idx)?.length) {
      merged.set(idx, urls);
    }
  });
  return merged;
}

interface PreparedRow {
  sheetRow: number;
  date: string | null;
  amountHkd: number | null;
  amountRmb: number | null;
  merchant: string | null;
  supplierInput: string | null;
  paymentMethod: string | null;
  reason: string | null;
  platform: string | null;
  notes: string | null;
  specialNotes: string | null;
  receiptPaths: string[];
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 15 MB)' }, { status: 400 });
  }
  const name = file.name.toLowerCase();
  if (!/\.(csv|xlsx|xls)$/.test(name)) {
    return NextResponse.json({ error: 'Unsupported file. Use .csv, .xlsx or .xls' }, { status: 400 });
  }

  let rows: Record<string, unknown>[];
  let hyperlinkByRow = new Map<number, string[]>();
  let worksheet: XLSX.WorkSheet | undefined;
  const isCsv = name.endsWith('.csv');
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = isCsv
      ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
      : XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: true });
    worksheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!isCsv && worksheet['!ref']) {
      const headerAoA = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
      const headerRow = (headerAoA[0] || []).map((c) => String(c ?? ''));
      const receiptCol = findReceiptColumnIndex(headerRow);
      const byReceiptCol = hyperlinkUrlsByDataRow(worksheet, receiptCol);
      const byAllCols = hyperlinkUrlsFromAllColumns(worksheet);
      hyperlinkByRow = mergeUrlMaps(byReceiptCol, byAllCols);
    }
  } catch {
    return NextResponse.json({ error: 'Could not parse the file' }, { status: 400 });
  }

  const ownerId = getDataOwnerId(session.userId);
  const errors: string[] = [];
  const receiptWarnings: ReceiptFetchWarning[] = [];
  const seenInBatch = new Set<string>();
  let skipped = 0;
  let receiptFetched = 0;
  let receiptFailed = 0;

  const candidates: PreparedRow[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const sheetRow = idx + 2;
    const date = toISODate(pickField(row, 'date'));
    const amountHkd = toAmount(pickField(row, 'amount'));
    const amountRmb = toAmount(pickField(row, 'amount_rmb'));
    const merchant = String(pickField(row, 'supplier') ?? '').trim() || null;
    const supplierInput = String(pickField(row, 'supplier_input') ?? '').trim() || null;
    const paymentMethod = String(pickField(row, 'payment_method') ?? '').trim() || null;
    const reason = String(pickField(row, 'category') ?? '').trim() || null;
    const platform = String(pickField(row, 'platform') ?? '').trim() || null;
    const notes = String(pickField(row, 'notes') ?? '').trim() || null;
    const specialNotes = String(pickField(row, 'special_notes') ?? '').trim() || null;
    const supplierLabel = merchant || supplierInput;

    if (!date && amountHkd === null && amountRmb === null && !supplierLabel && !paymentMethod && !reason && !platform) {
      continue;
    }

    if (amountHkd === null && amountRmb === null) {
      skipped++;
      errors.push(`Row ${sheetRow}: missing amount`);
      continue;
    }

    const dupKey = `${date || ''}|${amountHkd ?? ''}|${amountRmb ?? ''}|${supplierLabel || ''}`;
    if (seenInBatch.has(dupKey)) {
      skipped++;
      continue;
    }
    const existing = db
      .prepare(
        `SELECT 1 FROM expenses
         WHERE user_id = ? AND IFNULL(paid_date, '') = ?
           AND IFNULL(amount_hkd, -1) = IFNULL(?, -1)
           AND IFNULL(amount_rmb, -1) = IFNULL(?, -1)
           AND IFNULL(merchant, '') = ?
           AND IFNULL(supplier_input, '') = ?`
      )
      .get(ownerId, date || '', amountHkd, amountRmb, merchant || '', supplierInput || '');
    if (existing) {
      skipped++;
      continue;
    }
    seenInBatch.add(dupKey);

    const { paths, warnings } = await resolveImportReceiptPaths(
      sheetRow,
      row,
      hyperlinkByRow.get(idx) || [],
      isCsv ? undefined : worksheet,
      isCsv ? undefined : idx,
    );
    receiptWarnings.push(...warnings);
    receiptFetched += paths.length;
    receiptFailed += warnings.length;

    candidates.push({
      sheetRow,
      date,
      amountHkd,
      amountRmb,
      merchant,
      supplierInput,
      paymentMethod,
      reason,
      platform,
      notes,
      specialNotes,
      receiptPaths: paths,
    });
  }

  const tagsAdded: string[] = [];
  let imported = 0;

  const insertExpense = db.prepare(
    `INSERT INTO expenses
       (user_id, created_by_user_id, receipt_no, batch_id, category, merchant, supplier_input, amount_hkd, amount_rmb, paid_date, order_no, platform, payment_method, notes, special_notes, payment_status, receipt_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertReceipt = db.prepare(
    'INSERT INTO expense_receipts (expense_id, user_id, path) VALUES (?, ?, ?)'
  );

  const persist = db.transaction(() => {
    for (const row of candidates) {
      if (syncOption(ownerId, 'payment_method', row.paymentMethod)) tagsAdded.push(row.paymentMethod!);
      if (syncOption(ownerId, 'category', row.reason)) tagsAdded.push(row.reason!);
      if (syncOption(ownerId, 'platform', row.platform)) tagsAdded.push(row.platform!);
      if (row.merchant && syncOption(ownerId, 'supplier', row.merchant)) tagsAdded.push(row.merchant);

      const { batchId, receiptNo } = assignExpenseNumbers(ownerId, row.date, row.paymentMethod);
      const primaryPath = row.receiptPaths[0] || null;
      const result = insertExpense.run(
        ownerId,
        session.userId,
        receiptNo,
        batchId,
        row.reason || 'other',
        row.merchant,
        row.supplierInput,
        row.amountHkd,
        row.amountRmb,
        row.date,
        null,
        row.platform,
        row.paymentMethod,
        row.notes,
        row.specialNotes,
        'paid',
        primaryPath
      );
      const expenseId = result.lastInsertRowid as number;
      for (const p of row.receiptPaths) {
        insertReceipt.run(expenseId, ownerId, p);
      }
      imported++;
    }
  });

  try {
    persist();
  } catch {
    return NextResponse.json({ error: 'Import failed while saving rows' }, { status: 500 });
  }

  return NextResponse.json({
    imported,
    skipped,
    tagsAdded: Array.from(new Set(tagsAdded)),
    errors: errors.slice(0, 10),
    receipt_fetched: receiptFetched,
    receipt_failed: receiptFailed,
    receipt_warnings: receiptWarnings.slice(0, 20).map((w) => w.message),
  });
}
