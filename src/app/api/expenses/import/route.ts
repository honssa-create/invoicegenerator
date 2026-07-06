import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { generateReceiptNumber, syncOption } from '@/lib/expense-server';
import { getDataOwnerId } from '@/lib/org-server';

const MAX_BYTES = 15 * 1024 * 1024;

const ALIASES: Record<string, string[]> = {
  date: ['date', '日期', '支出日期', 'expense date', 'paid date', '付款日期', 'transaction date'],
  payment_method: ['payment method', '支付方式', 'payment', '付款方式'],
  category: ['expense reason', '支出原因', 'reason', 'category', '類別', '类别'],
  platform: ['shopping platform', '消費平台', 'platform', '消费平台'],
  amount: ['amount', '金額', '金额', 'amount (hkd)', 'hkd', 'total', '總額', '总额', '金额(hkd)'],
  supplier: ['supplier', '供應商', '供应商', 'merchant', '商戶', '商户', 'vendor'],
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
  // Looser contains match as a fallback.
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase();
    if (aliases.some((a) => norm.includes(a.toLowerCase()))) return row[key];
  }
  return undefined;
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
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // CSVs must be decoded as UTF-8 so Chinese headers (日期, 支付方式…) survive; the
    // binary reader can otherwise mis-detect the codepage and garble the headers.
    const wb = name.endsWith('.csv')
      ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
      : XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } catch {
    return NextResponse.json({ error: 'Could not parse the file' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const tagsAdded: string[] = [];
  const errors: string[] = [];
  const seenInBatch = new Set<string>();

  const ownerId = getDataOwnerId(session.userId);

  const insert = db.prepare(
    `INSERT INTO expenses
       (user_id, created_by_user_id, receipt_no, category, merchant, amount_hkd, amount_rmb, paid_date, order_no, platform, payment_method, notes, special_notes, payment_status, receipt_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const run = db.transaction(() => {
    rows.forEach((row, idx) => {
      const date = toISODate(pickField(row, 'date'));
      const amount = toAmount(pickField(row, 'amount'));
      const supplier = String(pickField(row, 'supplier') ?? '').trim() || null;
      const paymentMethod = String(pickField(row, 'payment_method') ?? '').trim() || null;
      const reason = String(pickField(row, 'category') ?? '').trim() || null;
      const platform = String(pickField(row, 'platform') ?? '').trim() || null;
      const notes = String(pickField(row, 'notes') ?? '').trim() || null;
      const specialNotes = String(pickField(row, 'special_notes') ?? '').trim() || null;

      // Ignore completely blank rows silently.
      if (!date && amount === null && !supplier && !paymentMethod && !reason && !platform) {
        return;
      }

      if (amount === null) {
        skipped++;
        errors.push(`Row ${idx + 2}: missing amount`);
        return;
      }

      // Tag sync — add any new payment method / reason / platform to custom options.
      if (syncOption(ownerId, 'payment_method', paymentMethod)) tagsAdded.push(paymentMethod!);
      if (syncOption(ownerId, 'category', reason)) tagsAdded.push(reason!);
      if (syncOption(ownerId, 'platform', platform)) tagsAdded.push(platform!);
      if (supplier && syncOption(ownerId, 'supplier', supplier)) tagsAdded.push(supplier);

      // Duplicate guard (Date + Amount + Supplier), both against DB and within this batch.
      const dupKey = `${date || ''}|${amount}|${supplier || ''}`;
      if (seenInBatch.has(dupKey)) {
        skipped++;
        return;
      }
      const existing = db
        .prepare(
          `SELECT 1 FROM expenses
           WHERE user_id = ? AND IFNULL(paid_date, '') = ? AND IFNULL(amount_hkd, -1) = ? AND IFNULL(merchant, '') = ?`
        )
        .get(ownerId, date || '', amount, supplier || '');
      if (existing) {
        skipped++;
        return;
      }
      seenInBatch.add(dupKey);

      const receiptNo = generateReceiptNumber(ownerId, date);
      insert.run(
        ownerId,
        session.userId,
        receiptNo,
        reason || 'other',
        supplier,
        amount,
        null,
        date,
        null,
        platform,
        paymentMethod,
        notes,
        specialNotes,
        'unpaid',
        null
      );
      imported++;
    });
  });

  try {
    run();
  } catch {
    return NextResponse.json({ error: 'Import failed while saving rows' }, { status: 500 });
  }

  return NextResponse.json({
    imported,
    skipped,
    tagsAdded: Array.from(new Set(tagsAdded)),
    errors: errors.slice(0, 10),
  });
}
