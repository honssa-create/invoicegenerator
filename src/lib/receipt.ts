import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { ReceiptScanResult } from './types';

const RECEIPTS_DIR = path.join(process.cwd(), 'data', 'receipts');

const ALLOWED_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function ensureReceiptsDir() {
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
}

export function saveReceipt(buffer: Buffer, mimeType: string): string {
  ensureReceiptsDir();
  const ext = ALLOWED_EXT[mimeType] || '.png';
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(RECEIPTS_DIR, filename), buffer);
  return filename;
}

export function receiptFilePath(filename: string): string | null {
  // Guard against path traversal — only allow a bare filename.
  const base = path.basename(filename);
  if (base !== filename) return null;
  const full = path.join(RECEIPTS_DIR, base);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function receiptContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[ext] || 'application/octet-stream';
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+/g;

const TOTAL_KEYWORDS =
  /(grand\s*total|total\s*amount|amount\s*due|balance\s*due|\btotal\b|\bamount\b|總數|總計|合計|总计|总额|應付|应付|實付|实付|付款)/i;

const HKD_HINT = /(hk\s*\$|hkd|港幣|港币)/i;
const RMB_HINT = /(rmb|cny|人民币|人民幣|¥|￥|元)/i;

export function extractDate(text: string): string | null {
  const patterns: RegExp[] = [
    /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/, // 2024-01-31 / 2024年01月31
    /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/, // 31/01/2024 or 01/31/24
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let year: number, month: number, day: number;
    if (m[1].length === 4) {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
    } else {
      day = Number(m[1]);
      month = Number(m[2]);
      year = Number(m[3]);
      if (year < 100) year += 2000;
      // If "month" is impossible but "day" is a valid month, swap (US format).
      if (month > 12 && day <= 12) {
        [day, month] = [month, day];
      }
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

export function extractMerchant(text: string): string | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    const letters = line.replace(/[^A-Za-z\u4e00-\u9fff]/g, '');
    // A merchant line should have a few letters and not be dominated by digits.
    if (letters.length >= 3 && !/^\d/.test(line) && !TOTAL_KEYWORDS.test(line)) {
      return line.slice(0, 120);
    }
  }
  return null;
}

function largestNumberInLine(line: string): number | null {
  const matches = line.match(NUMBER_RE);
  if (!matches) return null;
  const nums = matches.map(toNumber).filter((n): n is number => n !== null);
  if (!nums.length) return null;
  return Math.max(...nums);
}

export function extractAmounts(text: string): { hkd: number | null; rmb: number | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const totalLines = lines.filter((l) => TOTAL_KEYWORDS.test(l) && NUMBER_RE.test(l));
  const candidates = totalLines.length ? totalLines : lines;

  let hkd: number | null = null;
  let rmb: number | null = null;

  for (const line of candidates) {
    const value = largestNumberInLine(line);
    if (value === null) continue;
    if (RMB_HINT.test(line)) {
      if (rmb === null) rmb = value;
    } else if (HKD_HINT.test(line) || /\$/.test(line)) {
      if (hkd === null) hkd = value;
    }
  }

  // If we found a total but couldn't attribute a currency, use document-level hints.
  if (hkd === null && rmb === null && totalLines.length) {
    const value = largestNumberInLine(totalLines[0]);
    if (value !== null) {
      if (RMB_HINT.test(text) && !HKD_HINT.test(text)) rmb = value;
      else hkd = value;
    }
  }

  return { hkd, rmb };
}

async function ocrExtract(buffer: Buffer): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const langs = process.env.OCR_LANGS || 'eng';
  const worker = await createWorker(langs);
  try {
    const { data } = await worker.recognize(buffer);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

// Public raw OCR (used by the Scan-to-Table fallback when no AI key is set).
export async function ocrImageText(buffer: Buffer): Promise<string> {
  return ocrExtract(buffer);
}

async function aiExtract(
  buffer: Buffer,
  mimeType: string
): Promise<Partial<ReceiptScanResult> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const base64 = buffer.toString('base64');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract structured data from receipt images. Respond ONLY with JSON: {"merchant": string|null, "date": "YYYY-MM-DD"|null, "amount_hkd": number|null, "amount_rmb": number|null}. Use null when a value is not present. amount_hkd is the total in Hong Kong Dollars, amount_rmb the total in Chinese Yuan / RMB.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the receipt data as JSON.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      merchant: parsed.merchant ?? null,
      date: parsed.date ?? null,
      amount_hkd: typeof parsed.amount_hkd === 'number' ? parsed.amount_hkd : null,
      amount_rmb: typeof parsed.amount_rmb === 'number' ? parsed.amount_rmb : null,
    };
  } catch {
    return null;
  }
}

export async function scanReceipt(buffer: Buffer, mimeType: string): Promise<ReceiptScanResult> {
  const ai = await aiExtract(buffer, mimeType);
  if (ai) {
    return {
      merchant: ai.merchant ?? null,
      date: ai.date ?? null,
      amount_hkd: ai.amount_hkd ?? null,
      amount_rmb: ai.amount_rmb ?? null,
      receipt_path: null,
      raw_text: '',
      source: 'ai',
    };
  }

  let rawText = '';
  try {
    rawText = await ocrExtract(buffer);
  } catch {
    rawText = '';
  }

  const amounts = extractAmounts(rawText);
  return {
    merchant: extractMerchant(rawText),
    date: extractDate(rawText),
    amount_hkd: amounts.hkd,
    amount_rmb: amounts.rmb,
    receipt_path: null,
    raw_text: rawText,
    source: 'ocr',
  };
}
