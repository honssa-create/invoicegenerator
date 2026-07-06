import * as XLSX from 'xlsx';
import { saveReceipt } from './receipt';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

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
];

/** Pull HTTP(S) URLs from a legacy spreadsheet cell (plain text, HYPERLINK formula, or multiple). */
export function extractReceiptUrls(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  const text = String(raw).trim();
  if (!text) return [];

  const urls = new Set<string>();

  const hyperlinkFormula = /=HYPERLINK\s*\(\s*["']([^"']+)["']/i.exec(text);
  if (hyperlinkFormula?.[1]) urls.add(hyperlinkFormula[1].trim());

  const urlRe = /https?:\/\/[^\s<>"')\]},;|]+/gi;
  for (const m of text.match(urlRe) || []) {
    const cleaned = m.replace(/[.,;:!?)]+$/, '').trim();
    if (cleaned) urls.add(cleaned);
  }

  return Array.from(urls);
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

/** Download a remote receipt image and store it via saveReceipt (local disk or R2). */
export async function fetchAndStoreReceiptFromUrl(
  url: string,
  rowLabel: string
): Promise<{ path: string } | { warning: ReceiptFetchWarning }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'InvoiceFlow-ExpenseImport/1.0',
        Accept: 'image/*,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      return {
        warning: {
          row: 0,
          url,
          message: `Row ${rowLabel}: receipt link expired or unreachable (HTTP ${res.status})`,
        },
      };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      return {
        warning: { row: 0, url, message: `Row ${rowLabel}: receipt download returned empty data` },
      };
    }
    if (buf.length > MAX_RECEIPT_BYTES) {
      return {
        warning: { row: 0, url, message: `Row ${rowLabel}: receipt image too large (max 10 MB)` },
      };
    }

    const mimeType = normalizeImageMime(res.headers.get('content-type'), url, buf);
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
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'download timed out' : 'download failed';
    return {
      warning: { row: 0, url, message: `Row ${rowLabel}: receipt ${msg} — link may be expired` },
    };
  } finally {
    clearTimeout(timeout);
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

/** Hyperlink targets from an .xlsx sheet keyed by data-row index (0 = first data row). */
export function hyperlinkUrlsByDataRow(
  ws: XLSX.WorkSheet,
  receiptColIndex: number
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (receiptColIndex < 0 || !ws['!ref']) return map;

  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: receiptColIndex });
    const cell = ws[ref] as { l?: { Target?: string } } | undefined;
    const target = cell?.l?.Target;
    if (!target) continue;
    const urls = extractReceiptUrls(target);
    if (urls.length) map.set(r - range.s.r - 1, urls);
  }
  return map;
}

export async function resolveImportReceiptPaths(
  rowNumber: number,
  cellValue: unknown,
  extraUrls: string[] = []
): Promise<{ paths: string[]; warnings: ReceiptFetchWarning[] }> {
  const urls = Array.from(new Set([...extractReceiptUrls(cellValue), ...extraUrls]));
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
