/**
 * Inbound waybill field extraction from OCR text / Paddle boxes.
 * SF Express labels use 寄 / 收 region icons more often than "寄件地址:" key rows.
 */

import type { OcrBox } from '@/lib/paddle-ocr';

export type InboundScanFields = {
  waybill_number: string | null;
  sender: string | null;
  sender_address: string | null;
  receiver_address: string | null;
  amount: number | null;
};

const FIELD_START =
  /^(?:寄件|收件|发件|發件|运单|運單|母单|母單|waybill|tracking|sender|receiver|recipient|from|to|电话|電話|手机|手機|联络|聯絡)/i;

const BILLING_STOP =
  /费用合计|費用合計|代收金额|代收金額|增值服务|增值服務|计费重量|計費重量|实际重量|實際重量|^备注$|^備註$|^包$/;

const AMOUNT_LABEL =
  /(?:费用合计|費用合計|代收金额|代收金額|运费|運費|实际运费|實際運費|总费用|總費用|金額|金额|amount)/i;

const HEADER_NOISE =
  /第\s*\d+\s*次打印|打印时间|打印時間|sf-express\.com|顺丰速运|順豐速運|^SF\s*EXPRESS$|NEXT|\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/i;

const PHONE_LIKE = /^(?:\+?\d[\d\s\-()]{7,}\d)$/;
/** Numbers that look like phones, not SF waybills (used to reject false waybill hits). */
const LIKELY_PHONE =
  /^(?:(?:\+?86[\s-]?)?1[3-9]\d{9}|(?:\+?852[\s-]?)?[4569]\d{7}|\d{2,4}[\s\-]\d{2,4}[\s\-]\d{2,4})$/;
const ROUTING_CODE = /^[A-Z]{1,4}-[A-Z0-9-]{4,}$/i;
const PAGE_FRAC = /^\d+\s*\/\s*\d+$/;
const LABEL_ONLY = /^(?:母单号|母單號|运单号|運單號|寄件人|收件人|寄件地址|收件地址)$/i;
const WAYBILL_LABEL = /母单号|母單號|运单号|運單號|waybill|tracking/i;

function strOrNull(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function extractLabeledBlock(
  lines: string[],
  labelRe: RegExp,
  maxExtraLines = 5
): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRe);
    if (!m) continue;
    const parts: string[] = [];
    if (m[1]?.trim()) parts.push(m[1].trim());
    for (let j = i + 1; j < Math.min(i + 1 + maxExtraLines, lines.length); j++) {
      if (FIELD_START.test(lines[j])) break;
      if (lines[j].length < 1) continue;
      parts.push(lines[j]);
    }
    const addr = parts.join('\n').trim();
    if (addr.length >= 4) return addr.slice(0, 240);
  }
  return null;
}

/** Regex fallback on flat OCR text (tesseract or when 寄/收 anchors missing). */
export function ocrExtractFields(text: string): InboundScanFields {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let waybill: string | null = null;
  const sf = text.match(/\bSF\s?\d[\d\s]{8,}\b/i);
  if (sf) waybill = sf[0].replace(/\s+/g, '');
  if (!waybill) {
    const digits = text.match(/\b\d{10,16}\b/);
    if (digits) waybill = digits[0];
  }

  let sender: string | null = null;
  for (const line of lines) {
    const m = line.match(/(?:寄件人(?!地址)|寄件方|sender(?!\s*address)|from)\s*[:：]?\s*(.+)/i);
    if (m && m[1].trim().length >= 2 && !/地址/.test(m[1])) {
      sender = m[1].trim().slice(0, 80);
      break;
    }
  }

  const sender_address = extractLabeledBlock(
    lines,
    /(?:寄件地址|发件地址|發件地址|寄方地址|寄件人地址|sender\s*address|from\s*address)\s*[:：]?\s*(.*)/i
  );
  const receiver_address = extractLabeledBlock(
    lines,
    /(?:收件地址|收方地址|到件地址|收件人地址|receiver\s*address|recipient\s*address|ship\s*to|to\s*address)\s*[:：]?\s*(.*)/i
  );

  let amount: number | null = null;
  for (const line of lines) {
    const m = line.match(
      /(?:费用合计|費用合計|代收金额|代收金額|运费|運費|金額|金额)\s*[:：]?\s*(?:HKD|CNY|RMB|HK\$|\$|¥|￥)?\s*([0-9][0-9,]*\.?\d{0,2})/i
    );
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0 && n <= 999_999) {
        amount = Math.round(n * 100) / 100;
        break;
      }
    }
  }

  return { waybill_number: waybill, sender, sender_address, receiver_address, amount };
}

function sortBoxes(boxes: OcrBox[]): OcrBox[] {
  return [...boxes].sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
}

function midY(b: OcrBox): number {
  return (b.y0 + b.y1) / 2;
}

/** True if box text is essentially the 寄 or 收 icon/label. */
function isJiAnchor(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  return t === '寄' || (t.includes('寄') && t.length <= 2);
}

function isShouAnchor(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  return t === '收' || (t.includes('收') && t.length <= 2 && !t.includes('代收'));
}

function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (HEADER_NOISE.test(t)) return true;
  if (BILLING_STOP.test(t)) return true;
  if (isPhoneLike(t)) return true;
  if (ROUTING_CODE.test(t)) return true;
  if (PAGE_FRAC.test(t)) return true;
  if (LABEL_ONLY.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  if (/^HKD$/i.test(t)) return true;
  if (/KG$/i.test(t) && /\d/.test(t)) return true;
  if (/寄付|现结|現結|出口报关|出口報關/.test(t)) return true;
  return false;
}

function isPhoneLike(text: string): boolean {
  const trimmed = text.trim();
  const compact = trimmed.replace(/[\s\-()]/g, '');
  if (!compact) return false;
  // Explicit SF waybills are never phones.
  if (/^SF\d{8,}/i.test(compact)) return false;
  if (LIKELY_PHONE.test(trimmed) || LIKELY_PHONE.test(compact)) return true;
  // CN mobile 11 digits starting with 1
  if (/^1[3-9]\d{9}$/.test(compact)) return true;
  // Formatted phone (has separators) matching broad phone shape
  if (/[\s\-()]/.test(trimmed) && PHONE_LIKE.test(trimmed) && compact.length <= 13) return true;
  return false;
}

function looksLikeWaybill(text: string, { allowBareDigits = true } = {}): string | null {
  const compact = text.replace(/\s+/g, '');
  // "母单号: SF123..." or "母单号 123..." in one box
  const labeled = text.match(
    /(?:母单号|母單號|运单号|運單號)\s*[:：]?\s*([A-Za-z0-9]{8,})/i
  );
  if (labeled) {
    const v = labeled[1].replace(/\s+/g, '');
    if (!isPhoneLike(v)) return v.toUpperCase().startsWith('SF') ? v.toUpperCase() : v;
  }
  const sf = compact.match(/SF\d{10,}/i);
  if (sf) return sf[0].toUpperCase();
  if (!allowBareDigits) return null;
  // Bare digit runs: only if not phone-shaped
  const digits = compact.match(/\d{10,16}/);
  if (digits && !isPhoneLike(digits[0]) && !isPhoneLike(compact)) return digits[0];
  return null;
}

function findBillingY(sorted: OcrBox[]): number {
  for (const b of sorted) {
    if (BILLING_STOP.test(b.text.trim())) return midY(b);
  }
  return Number.POSITIVE_INFINITY;
}

function bandBoxes(sorted: OcrBox[], yStart: number, yEnd: number, excludeLeftIcon = true): OcrBox[] {
  return sorted.filter((b) => {
    const y = midY(b);
    if (y < yStart - 2 || y >= yEnd - 2) return false;
    const t = b.text.trim();
    if (isJiAnchor(t) || isShouAnchor(t)) return false;
    // Skip far-left icon column roughly (寄/收 sit on the left).
    if (excludeLeftIcon && b.x1 < 40 && t.length <= 2) return false;
    return true;
  });
}

function sfTokenFromText(text: string): string | null {
  // Real waybills are SF + digits (ignore logo text like "SF EXPRESS").
  const m = text.replace(/\s+/g, '').match(/SF\d{8,}/i);
  return m ? m[0].toUpperCase() : null;
}

/**
 * Waybill can sit anywhere on the label (often outside the 寄 band).
 * Search all boxes top→bottom for the first SF+digits token.
 */
function extractWaybillSf(boxes: OcrBox[]): { waybill: string | null; box: OcrBox | null } {
  for (const b of sortBoxes(boxes)) {
    const w = sfTokenFromText(b.text);
    if (w) return { waybill: w, box: b };
  }
  return { waybill: null, box: null };
}

function looksLikeAddress(text: string): boolean {
  return /[省市区縣县路街道號号栋廈厦室樓楼座]|公司|有限公司|Ltd\.?|Co\.?/i.test(text) || text.length >= 12;
}

function looksLikeName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 24) return false;
  if (looksLikeAddress(t) || isPhoneLike(t) || isNoise(t)) return false;
  if (/^SF/i.test(t.replace(/\s+/g, '')) || /^\d+$/.test(t)) return false;
  if (WAYBILL_LABEL.test(t) || LABEL_ONLY.test(t)) return false;
  if (/^1\/1$|^母单|^母單/.test(t)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(t);
}

function amountOrNull(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n) || n <= 0 || n > 999_999) return null;
  return Math.round(n * 100) / 100;
}

/** Parse a currency/decimal token; rejects weights, waybills, and phones. */
function parseAmountToken(text: string): number | null {
  const t = text.trim();
  if (!t || /KG|kg|重量|计费重量|計費重量|实际重量|實際重量/.test(t)) return null;
  if (isPhoneLike(t) || sfTokenFromText(t) || looksLikeWaybill(t, { allowBareDigits: false })) return null;

  const inline = t.match(
    /(?:费用合计|費用合計|代收金额|代收金額|运费|運費|金額|金额|amount)\s*[:：]?\s*(?:HKD|CNY|RMB|HK\$|\$|¥|￥)?\s*([0-9][0-9,]*\.?\d{0,2})/i
  );
  if (inline) return amountOrNull(parseFloat(inline[1].replace(/,/g, '')));

  const bare = t.match(/^(?:HKD|CNY|RMB|HK\$|\$|¥|￥)?\s*([0-9][0-9,]*\.?\d{0,2})\s*(?:HKD|CNY|RMB|元)?$/i);
  if (bare) return amountOrNull(parseFloat(bare[1].replace(/,/g, '')));

  return null;
}

function yOverlap(a: OcrBox, b: OcrBox, tolerance = 14): boolean {
  return Math.abs(midY(a) - midY(b)) <= tolerance;
}

/** Extract 金額 from SF billing rows (费用合计 / 代收金额 and neighbors). */
function extractAmountFromBoxes(boxes: OcrBox[]): number | null {
  const sorted = sortBoxes(boxes);

  for (const b of sorted) {
    const amt = parseAmountToken(b.text);
    if (amt != null && AMOUNT_LABEL.test(b.text)) return amt;
  }

  for (const b of sorted) {
    const t = b.text.trim();
    if (!AMOUNT_LABEL.test(t)) continue;

    const right = sorted
      .filter((other) => other !== b && yOverlap(b, other) && other.x0 >= b.x0 - 4)
      .sort((a, c) => a.x0 - c.x0 || a.y0 - c.y0);
    for (const c of right) {
      const amt = parseAmountToken(c.text);
      if (amt != null) return amt;
    }

    const below = sorted
      .filter((other) => {
        if (other === b) return false;
        const dy = other.y0 - b.y1;
        return dy >= -2 && dy <= 28 && other.x0 >= b.x0 - 20 && other.x0 <= b.x1 + 40;
      })
      .sort((a, c) => a.y0 - c.y0 || a.x0 - c.x0);
    for (const c of below) {
      const amt = parseAmountToken(c.text);
      if (amt != null) return amt;
    }
  }

  return null;
}

/** Sender name sits slightly above the 寄 glyph (smaller Y). */
const SENDER_ABOVE_JI_MIN = 2;
const SENDER_ABOVE_JI_MAX = 55;

function extractFromSfRegions(boxes: OcrBox[]): InboundScanFields | null {
  const sorted = sortBoxes(boxes);
  let ji: OcrBox | null = null;
  let shou: OcrBox | null = null;
  for (const b of sorted) {
    const t = b.text.trim();
    if (!ji && isJiAnchor(t)) ji = b;
    else if (!shou && isShouAnchor(t)) shou = b;
  }
  if (!ji || !shou) return null;

  const jiY = ji.y0;
  const jiRefY = midY(ji);
  const shouY = shou.y0;
  if (!(jiY < shouY)) return null;

  const billingY = findBillingY(sorted);
  // Include a strip above 寄 so the sender name (slightly above 寄) is in range.
  const jiBand = bandBoxes(sorted, jiY - SENDER_ABOVE_JI_MAX, shouY);
  const shouBandEnd = Number.isFinite(billingY) ? billingY : Number.POSITIVE_INFINITY;
  const shouBand = bandBoxes(sorted, shouY - 5, shouBandEnd);

  const { waybill, box: waybillBox } = extractWaybillSf(sorted);

  const jiUseful = jiBand.filter((b) => {
    if (waybillBox && b === waybillBox) return false;
    if (isNoise(b.text)) return false;
    if (sfTokenFromText(b.text)) return false;
    if (looksLikeWaybill(b.text) && b.text.replace(/\s/g, '').length >= 10) return false;
    return true;
  });

  // Prefer first name-like box whose Y is slightly above 寄.
  let sender: string | null = null;
  let senderBox: OcrBox | null = null;
  const aboveJi = jiUseful
    .filter((b) => {
      const dy = jiRefY - midY(b);
      return dy >= SENDER_ABOVE_JI_MIN && dy <= SENDER_ABOVE_JI_MAX && looksLikeName(b.text);
    })
    .sort((a, b) => midY(a) - midY(b) || a.x0 - b.x0);

  if (aboveJi.length) {
    senderBox = aboveJi[0];
    sender = senderBox.text.trim().slice(0, 80);
  } else {
    // Fallback: first name-like line in the 寄 band (top → bottom).
    const fallback = jiUseful.find((b) => looksLikeName(b.text));
    if (fallback) {
      senderBox = fallback;
      sender = fallback.text.trim().slice(0, 80);
    }
  }

  const senderAddrParts: string[] = [];
  for (const b of jiUseful) {
    if (senderBox && b === senderBox) continue;
    const t = b.text.trim();
    if (t.length < 2 || isNoise(t) || isPhoneLike(t)) continue;
    if (LABEL_ONLY.test(t) || WAYBILL_LABEL.test(t) || sfTokenFromText(t)) continue;
    // Keep company / address lines; skip other short name-like junk.
    if (t.includes('公司') || looksLikeAddress(t)) {
      senderAddrParts.push(t);
      continue;
    }
    if (looksLikeName(t)) continue;
    senderAddrParts.push(t);
  }

  const recvParts: string[] = [];
  for (const b of shouBand) {
    const t = b.text.trim();
    if (t.length < 2 || isNoise(t) || isPhoneLike(t)) continue;
    if (LABEL_ONLY.test(t) || WAYBILL_LABEL.test(t) || sfTokenFromText(t)) continue;
    // Receiver address field includes unlabeled name + address; always keep 公司 lines.
    if (t.includes('公司') || looksLikeAddress(t) || looksLikeName(t) || t.length >= 4) {
      recvParts.push(t);
    }
  }

  return {
    waybill_number: strOrNull(waybill, 64),
    sender: strOrNull(sender, 80),
    sender_address: strOrNull(senderAddrParts.join('\n'), 240),
    receiver_address: strOrNull(recvParts.join('\n'), 240),
    amount: null,
  };
}

function flattenBoxesText(boxes: OcrBox[]): string {
  return sortBoxes(boxes)
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n');
}

export function hasAnyInboundField(fields: InboundScanFields): boolean {
  return !!(fields.waybill_number || fields.sender || fields.sender_address || fields.receiver_address || fields.amount != null);
}

/** Primary entry: SF 寄/收 regions, then label-regex fallback on box text. */
export function extractFieldsFromBoxes(boxes: OcrBox[]): InboundScanFields {
  const amount = boxes.length ? extractAmountFromBoxes(boxes) : null;
  if (!boxes.length) {
    return { waybill_number: null, sender: null, sender_address: null, receiver_address: null, amount: null };
  }
  const regional = extractFromSfRegions(boxes);
  if (regional && hasAnyInboundField({ ...regional, amount })) {
    // Always prefer a page-wide SF… token for waybill when present.
    const { waybill } = extractWaybillSf(boxes);
    if (waybill) return { ...regional, waybill_number: waybill, amount };
    return { ...regional, amount };
  }
  const fallback = ocrExtractFields(flattenBoxesText(boxes));
  const { waybill } = extractWaybillSf(boxes);
  const mergedAmount = amount ?? fallback.amount;
  if (waybill) return { ...fallback, waybill_number: waybill, amount: mergedAmount };
  return { ...fallback, amount: mergedAmount };
}
