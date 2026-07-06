import * as XLSX from 'xlsx';
import { saveReceipt } from './receipt';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

export const RECEIPT_COLUMN_ALIASES = [
  'receipts',
  'receipt',
  '付款收據',
  '付款收据',
  '收據',
  '收据',
  'receipt image',
  'payment receipt',
  '收據連結',
  '收据链接',
  '收據链接',
  '圖片連結',
  '图片链接',
  'image link',
  'image url',
  'receipt url',
  'receipt link',
  '付款收據連結',
  '付款收据链接',
];

/** Pull HTTP(S) URLs from a legacy spreadsheet cell (plain text, formulas, or multiple). */
export function extractReceiptUrls(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  const text = String(raw).trim();
  if (!text) return [];

  const urls = new Set<string>();

  const formulaPatterns = [
    /=HYPERLINK\s*\(\s*["']([^"']+)["']/gi,
    /=IMAGE\s*\(\s*["']([^"']+)["']/gi,
  ];
  for (const re of formulaPatterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[1]?.trim()) urls.add(m[1].trim());
    }
  }

  const urlRe = /https?:\/\/[^\s<>"')\]},;|]+/gi;
  for (const m of text.match(urlRe) || []) {
    const cleaned = m.replace(/[.,;:!?)]+$/, '').trim();
    if (cleaned) urls.add(cleaned);
  }

  return Array.from(urls);
}

/** Convert share links (Google Drive, Dropbox) to direct-download URLs when possible. */
export function normalizeReceiptDownloadUrl(url: string): string {
  const trimmed = url.trim();
  const driveFile = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFile?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveFile[1]}`;
  }
  const driveOpen = trimmed.match(/drive\.google\.com\/open\?id=([^&]+)/i);
  if (driveOpen?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
  }
  if (/dropbox\.com/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      u.searchParams.set('dl', '1');
      return u.toString();
    } catch {
      return trimmed.replace('dl=0', 'dl=1');
    }
  }
  return trimmed;
}

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function mimeFromUrl(url: string): string | null {
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return ext ? map[ext] || null : null;
  } catch {
    return null;
  }
}

function normalizeImageMime(contentType: string | null, url: string, buf: Buffer): string | null {
  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  if (IMAGE_MIMES.has(ct)) return ct === 'image/jpg' ? 'image/jpeg' : ct;
  if (ct === 'application/octet-stream' || ct === 'binary/octet-stream') {
    const sniffed = sniffImageMime(buf);
    if (sniffed) return sniffed;
  }
  const sniffed = sniffImageMime(buf);
  if (sniffed) return sniffed;
  const fromUrl = mimeFromUrl(url);
  if (fromUrl) return fromUrl;
  return null;
}

export interface ReceiptFetchWarning {
  row: number;
  url: string;
  message: string;
}

async function downloadImageBuffer(url: string): Promise<{ buf: Buffer; contentType: string | null } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(normalizeReceiptDownloadUrl(url), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'InvoiceFlow-ExpenseImport/1.0',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return { buf, contentType: res.headers.get('content-type') };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Download a remote receipt image and store it via saveReceipt (local disk or R2). */
export async function fetchAndStoreReceiptFromUrl(
  url: string,
  rowLabel: string
): Promise<{ path: string } | { warning: ReceiptFetchWarning }> {
  try {
    const downloaded = await downloadImageBuffer(url);
    if (!downloaded) {
      return {
        warning: {
          row: 0,
          url,
          message: `Row ${rowLabel}: receipt link expired or unreachable`,
        },
      };
    }

    const { buf, contentType } = downloaded;
    if (buf.length > MAX_RECEIPT_BYTES) {
      return {
        warning: { row: 0, url, message: `Row ${rowLabel}: receipt image too large (max 10 MB)` },
      };
    }

    const mimeType = normalizeImageMime(contentType, url, buf);
    if (!mimeType) {
      return {
        warning: { row: 0, url, message: `Row ${rowLabel}: URL did not return a supported image` },
      };
    }

    let filename = 'imported-receipt';
    try {
      const part = new URL(url).pathname.split('/').pop();
      if (part) filename = decodeURIComponent(part);
    } catch {
      /* ignore */
    }

    const path = await saveReceipt(buf, mimeType, filename);
    return { path };
  } catch {
    return {
      warning: { row: 0, url, message: `Row ${rowLabel}: receipt download failed — link may be expired` },
    };
  }
}

export function pickReceiptCell(row: Record<string, unknown>): unknown {
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase();
    if (RECEIPT_COLUMN_ALIASES.some((a) => a.toLowerCase() === norm)) return row[key];
  }
  for (const key of Object.keys(row)) {
    const norm = key.trim().toLowerCase();
    if (RECEIPT_COLUMN_ALIASES.some((a) => norm.includes(a.toLowerCase()))) return row[key];
  }
  return undefined;
}

/** Collect receipt URLs from the receipt column, or any cell in the row that contains image links. */
export function collectReceiptUrlsFromRow(
  row: Record<string, unknown>,
  extraUrls: string[] = []
): string[] {
  const urls = new Set<string>(extraUrls.map((u) => u.trim()).filter(Boolean));
  const receiptCell = pickReceiptCell(row);
  for (const u of extractReceiptUrls(receiptCell)) urls.add(u);

  if (!urls.size) {
    for (const val of Object.values(row)) {
      for (const u of extractReceiptUrls(val)) urls.add(u);
    }
  }

  return Array.from(urls);
}

/** Find receipt column index in the first header row (for Excel hyperlink targets). */
export function findReceiptColumnIndex(headerRow: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    const norm = String(headerRow[i] || '').trim().toLowerCase();
    if (RECEIPT_COLUMN_ALIASES.some((a) => norm === a.toLowerCase() || norm.includes(a.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

type SheetCell = { l?: { Target?: string }; v?: unknown; w?: string };

function cellUrls(cell: SheetCell | undefined): string[] {
  if (!cell) return [];
  const urls = new Set<string>();
  if (cell.l?.Target) {
    for (const u of extractReceiptUrls(cell.l.Target)) urls.add(u);
  }
  for (const u of extractReceiptUrls(cell.v)) urls.add(u);
  for (const u of extractReceiptUrls(cell.w)) urls.add(u);
  return Array.from(urls);
}

/** Hyperlink targets from the receipt column keyed by data-row index (0 = first data row). */
export function hyperlinkUrlsByDataRow(
  ws: XLSX.WorkSheet,
  receiptColIndex: number
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (receiptColIndex < 0 || !ws['!ref']) return map;

  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: receiptColIndex });
    const urls = cellUrls(ws[ref] as SheetCell | undefined);
    if (urls.length) map.set(r - range.s.r - 1, urls);
  }
  return map;
}

/** Scan every column for Excel hyperlinks / embedded URLs (fallback when header does not match). */
export function hyperlinkUrlsFromAllColumns(ws: XLSX.WorkSheet): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!ws['!ref']) return map;

  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const urls = new Set<string>();
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      for (const u of cellUrls(ws[ref] as SheetCell | undefined)) urls.add(u);
    }
    if (urls.size) map.set(r - range.s.r - 1, Array.from(urls));
  }
  return map;
}

export async function resolveImportReceiptPaths(
  rowNumber: number,
  row: Record<string, unknown>,
  extraUrls: string[] = []
): Promise<{ paths: string[]; warnings: ReceiptFetchWarning[] }> {
  const urls = collectReceiptUrlsFromRow(row, extraUrls);
  const paths: string[] = [];
  const warnings: ReceiptFetchWarning[] = [];
  const rowLabel = String(rowNumber);

  for (const url of urls) {
    const result = await fetchAndStoreReceiptFromUrl(url, rowLabel);
    if ('path' in result) paths.push(result.path);
    else warnings.push({ ...result.warning, row: rowNumber });
  }

  return { paths, warnings };
}
