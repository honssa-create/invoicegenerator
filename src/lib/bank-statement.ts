import * as XLSX from 'xlsx';

export interface BankStatementRow {
  rowIndex: number;
  transactionDate: string;
  description: string;
  depositAmount: number;
}

export interface ParsedBankStatement {
  rows: BankStatementRow[];
  bankName: string;
}

const DATE_HEADERS = [
  'transaction date',
  '交易日期',
  'date',
  '日期',
  'txn date',
  'value date',
  'posting date',
  '交易日期',
];

const DESC_HEADERS = [
  'description',
  'remarks',
  '摘要備註',
  '摘要',
  '備註',
  'narrative',
  'details',
  'particulars',
  'reference',
  'memo',
];

const DEPOSIT_HEADERS = [
  'deposit amount',
  '入帳金額',
  'deposit',
  '入帳',
  'credit',
  'credit amount',
  'money in',
  'cr',
  '收入',
];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const idx = normalized.findIndex(
      (h) => h === candidate || h.includes(candidate) || candidate.includes(h)
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseAmount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value > 0 ? value : 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? 0 : num;
}

function parseDate(value: unknown): string | null {
  if (!value && value !== 0) return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  const mdy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function sheetToMatrix(buffer: Buffer, filename: string): string[][] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseCsvLine);
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  return raw.map((row) => row.map((cell) => String(cell ?? '').trim()));
}

function detectHeaderRow(matrix: string[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i];
    const joined = row.join(' ').toLowerCase();
    const hasDate = DATE_HEADERS.some((h) => joined.includes(h));
    const hasDeposit = DEPOSIT_HEADERS.some((h) => joined.includes(h));
    if (hasDate && hasDeposit) return i;
  }
  return 0;
}

export function parseBankStatementFile(buffer: Buffer, filename: string): ParsedBankStatement {
  const matrix = sheetToMatrix(buffer, filename);
  if (matrix.length < 2) {
    return { rows: [], bankName: filename };
  }

  const headerRowIdx = detectHeaderRow(matrix);
  const headers = matrix[headerRowIdx];
  const dateCol = findColumnIndex(headers, DATE_HEADERS);
  const descCol = findColumnIndex(headers, DESC_HEADERS);
  const depositCol = findColumnIndex(headers, DEPOSIT_HEADERS);

  if (dateCol < 0 || depositCol < 0) {
    throw new Error(
      'Could not detect required columns. Expected Transaction Date (交易日期) and Deposit Amount (入帳金額).'
    );
  }

  const rows: BankStatementRow[] = [];

  for (let i = headerRowIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || row.every((cell) => !cell)) continue;

    const depositAmount = parseAmount(row[depositCol]);
    if (depositAmount <= 0) continue;

    const transactionDate = parseDate(row[dateCol]);
    if (!transactionDate) continue;

    const description =
      descCol >= 0 ? String(row[descCol] ?? '').trim() : row.filter(Boolean).join(' ');

    rows.push({
      rowIndex: i + 1,
      transactionDate,
      description,
      depositAmount,
    });
  }

  const bankName = filename.replace(/\.(csv|xlsx|xls)$/i, '');
  return { rows, bankName };
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00').getTime();
  const b = new Date(dateB + 'T00:00:00').getTime();
  return Math.abs(Math.round((a - b) / (1000 * 60 * 60 * 24)));
}

export function amountsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}
