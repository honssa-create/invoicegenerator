import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { extractOrderNoFromRemarks, importBankStatementRows, type ReconciliationInput } from '@/lib/reconciliation-server';
import type { PaymentMethod } from '@/lib/reconciliation';
import { PAYMENT_METHODS } from '@/lib/reconciliation';

const MAX_BYTES = 15 * 1024 * 1024;

const ALIASES: Record<string, string[]> = {
  deposit_time: [
    'deposit time',
    '入帳時間',
    '入账时间',
    'transaction date',
    'date',
    '日期',
    'value date',
    'posting date',
    '交易日期',
  ],
  gross_amount: ['gross amount', '銀碼', '银码', 'amount', '金額', '金额', 'credit', 'deposit', '入帳金額', '入账金额'],
  remarks: ['remarks', 'remark', 'description', 'narrative', 'particulars', '備註', '备注', 'details', 'reference'],
  order_no: ['order no', 'order no.', 'order number', '訂單號', '订单号', 'po', 'po#', 'invoice', 'invoice no'],
};

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

const pad = (n: number) => String(n).padStart(2, '0');

function toDateTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  if (typeof v === 'number' && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)} 00:00:00`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
    return `${y}-${pad(+mo)}-${pad(+d)} ${pad(+h)}:${pad(+mi)}:${pad(+se)}`;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    let d = +m[1];
    let mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    const [, , , y, h = '0', mi = '0', se = '0'] = m;
    return `${y}-${pad(mo)}-${pad(d)} ${pad(+h)}:${pad(+mi)}:${pad(+se)}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  }
  return null;
}

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function externalId(paymentMethod: PaymentMethod, depositTime: string, amount: number, remarks: string): string {
  return `bank:${paymentMethod}:${depositTime}:${amount.toFixed(2)}:${remarks.slice(0, 120)}`;
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'reconciliation', request.method);
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }

  const file = formData.get('file');
  const paymentMethodRaw = String(formData.get('payment_method') || '').trim();
  if (!PAYMENT_METHODS.includes(paymentMethodRaw as PaymentMethod) || paymentMethodRaw === 'Yedpay') {
    return NextResponse.json({ error: 'payment_method must be FPS or Payme' }, { status: 400 });
  }
  const paymentMethod = paymentMethodRaw as PaymentMethod;

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
  const isCsv = name.endsWith('.csv');
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = isCsv
      ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
      : XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch {
    return NextResponse.json({ error: 'Could not parse spreadsheet' }, { status: 400 });
  }

  const parsed: ReconciliationInput[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const depositTime = toDateTime(pickField(row, 'deposit_time'));
    const gross = toAmount(pickField(row, 'gross_amount'));
    const remarks = String(pickField(row, 'remarks') || '').trim();
    const explicitOrderNo = String(pickField(row, 'order_no') || '').trim();
    const orderNo = explicitOrderNo || extractOrderNoFromRemarks(remarks);

    if (!depositTime || gross === null || gross <= 0) {
      errors.push(`Row ${idx + 2}: missing deposit time or amount`);
      return;
    }

    parsed.push({
      deposit_time: depositTime,
      gross_amount: gross,
      payment_method: paymentMethod,
      transaction_fee: 0,
      order_no: orderNo,
      remarks: remarks || null,
      source: 'bank_upload',
      external_id: externalId(paymentMethod, depositTime, gross, remarks || `row-${idx + 2}`),
    });
  });

  if (!parsed.length) {
    return NextResponse.json({ error: 'No valid rows found in bank statement', errors }, { status: 400 });
  }

  const ownerId = getDataOwnerId(session.userId);
  const result = importBankStatementRows(ownerId, paymentMethod, parsed);

  return NextResponse.json({ ...result, errors });
}
