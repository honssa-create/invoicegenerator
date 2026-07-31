import { normalizeWeddingGiftBottleCapacity } from './orders';

export type WeddingGiftConfirmationCore = Partial<{
  name: string;
  phone: string;
  shipping_address: string;
  notes: string;
}>;

export type WeddingGiftConfirmationResult = {
  fields: Record<string, string>;
  core: WeddingGiftConfirmationCore;
  warnings: string[];
};

const FLAVOR_ALIASES: { pattern: RegExp; key: string }[] = [
  { pattern: /紅棗(?:味)?/, key: 'qty_red_date' },
  { pattern: /冰糖(?:味)?/, key: 'qty_rock_sugar' },
  { pattern: /桂花(?:味)?/, key: 'qty_osmanthus' },
];

/** Parse `YYYY年M月D日` → `YYYY-MM-DD`. */
export function parseChineseDate(text: string): string | null {
  const m = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, '0');
  const d = m[3].padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mapCapacity(rawNum: string, _unit: string): string | null {
  const n = Number(rawNum);
  if (!Number.isFinite(n)) return null;
  if (n === 25) return '25g';
  if (n === 45) return '45g';
  if (n === 75) return normalizeWeddingGiftBottleCapacity('75g');
  return null;
}

function extractFlavors(text: string): Record<string, string> | null {
  const flavorLineMatch = text.match(/味道[：:]\s*([^\n]+)/);
  const scope = flavorLineMatch ? flavorLineMatch[1] : text;
  const found: Record<string, string> = {};
  let any = false;
  for (const { pattern, key } of FLAVOR_ALIASES) {
    const re = new RegExp(`${pattern.source}\\s*[xX×＊*]\\s*(\\d+)`);
    const m = scope.match(re);
    if (m) {
      found[key] = m[1];
      any = true;
    }
  }
  if (!any) return null;
  // Missing flavors → "0" so totals stay consistent
  for (const { key } of FLAVOR_ALIASES) {
    if (!(key in found)) found[key] = '0';
  }
  return found;
}

function extractUnitPrice(text: string): string | null {
  const m = text.match(/@?\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\/\s*樽/);
  if (!m) return null;
  return m[1].replace(/,/g, '');
}

function extractCapacity(text: string, warnings: string[]): string | null {
  // Prefer product line near 即食燕窩 / 燕窩回禮
  const productLine =
    text.match(/(\d+)\s*(m[lL]|g)\s*[^\n]*燕窩/) ||
    text.match(/(\d+)\s*(m[lL]|g)\b/);
  if (!productLine) return null;
  const mapped = mapCapacity(productLine[1], productLine[2]);
  if (!mapped) {
    warnings.push(`Unrecognized bottle capacity: ${productLine[1]}${productLine[2]}`);
    return null;
  }
  return mapped;
}

function extractNamePhone(text: string): { name?: string; phone?: string } {
  // After Big Day date line: "Jane Doe (12345678)"
  const afterBigDay = text.match(
    /(?:Big\s*Day|日期)[^\n]*\n+\*?[^\n]*?(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)[^\n]*\*?\s*\n+\s*([^\n(]+?)\s*\((\d{6,})\)/i
  );
  if (afterBigDay) {
    return { name: afterBigDay[2].replace(/\*/g, '').trim(), phone: afterBigDay[3] };
  }
  // Fallback: any Name (phone) early in the message (before 味道 / Special Price)
  const cut = text.split(/味道|Special|專享|收件人/)[0] || text;
  const m = cut.match(/([A-Za-z\u4e00-\u9fff][A-Za-z\u4e00-\u9fff .'-]{0,60}?)\s*\((\d{6,})\)/);
  if (m) return { name: m[1].replace(/\*/g, '').trim(), phone: m[2] };
  return {};
}

function extractDelivery(text: string): { date?: string; time?: string } {
  const section = text.match(/(?:收件人|送貨地址)[^\n]*\n([\s\S]*?)(?=\n\s*(?:💰|付款|FPS|♡|$))/);
  const block = section ? section[1] : text;
  const line = block.match(
    /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)\s*[\/／]?\s*([^\n]*?)\s*送貨/
  );
  if (!line) {
    const dateOnly = parseChineseDate(block);
    return dateOnly ? { date: dateOnly } : {};
  }
  const date = parseChineseDate(line[1]) || undefined;
  let time = line[2].replace(/[\/／,，]/g, ' ').replace(/\s+/g, ' ').trim();
  // Drop trailing commas / "送貨" remnants
  time = time.replace(/^[\s,，/／]+|[\s,，/／]+$/g, '');
  return { date, time: time || undefined };
}

function extractAddress(text: string): string | null {
  const section = text.match(/(?:收件人|送貨地址)[^\n]*\n([\s\S]*?)(?=\n\s*(?:💰|付款資料|FPS|♡|$))/);
  if (!section) return null;
  const lines = section[1]
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // Drop delivery date/time line and empty markdown
    .filter((l) => !/\d{4}\s*年.*送貨/.test(l))
    .filter((l) => !/^[-–—]+$/.test(l));
  const addr = lines.join('\n').trim();
  return addr || null;
}

function extractPricingNotes(text: string): string | null {
  const lines: string[] = [];
  const patterns: RegExp[] = [
    /滿\s*\$?[\d,]+[^\n]*/,
    /(?:原價|專享優惠)[^\n]*/,
    /扣減試飲[：:]\s*-?\s*\$?[\d,]+(?:\.\d+)?/,
    /其他扣減[：:]\s*-?\s*\$?[\d,]+(?:\.\d+)?/,
    /額外費用[：:]\s*\$?[\d,]+(?:\.\d+)?/,
    /總額[：:]\s*\$?[\d,]+(?:\.\d+)?/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) lines.push(m[0].replace(/\*/g, '').trim());
  }
  // Also capture the special price line like *$4,275@$42.75/樽*
  const special = text.match(/\*?\$[\d,]+(?:\.\d+)?\s*@\s*\$?[\d,]+(?:\.\d+)?\s*\/\s*樽\*?(?:\s*[^\n]*)?/);
  if (special) {
    const cleaned = special[0].replace(/\*/g, '').trim();
    if (!lines.includes(cleaned)) lines.unshift(cleaned);
  }
  if (!lines.length) return null;
  return `【從確認訊息】\n${lines.join('\n')}`;
}

/**
 * Parse a pasted Honour 即食燕窩回禮 confirmation message into order core/fields.
 * Only returns keys that were found; never invents empty wipes.
 */
export function parseWeddingGiftConfirmation(text: string): WeddingGiftConfirmationResult {
  const fields: Record<string, string> = {};
  const core: WeddingGiftConfirmationCore = {};
  const warnings: string[] = [];
  const raw = String(text || '').trim();
  if (!raw) return { fields, core, warnings: ['Empty confirmation text'] };

  // Big Day — prefer date near Big Day / 日期 header
  const bigDayBlock = raw.match(
    /(?:Big\s*Day|日期)[^\n]*\n+\*?[^\n]*?(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/i
  );
  const bigDay =
    (bigDayBlock && parseChineseDate(bigDayBlock[1])) ||
    parseChineseDate(raw.split(/味道|Special|專享|收件人/)[0] || raw);
  if (bigDay) {
    fields.big_day = bigDay;
    fields.expiry_date = addDaysIso(bigDay, 28);
  }

  const { name, phone } = extractNamePhone(raw);
  if (name) core.name = name;
  if (phone) core.phone = phone;

  const capacity = extractCapacity(raw, warnings);
  if (capacity) fields.bottle_capacity = capacity;

  const flavors = extractFlavors(raw);
  if (flavors) Object.assign(fields, flavors);

  const unitPrice = extractUnitPrice(raw);
  if (unitPrice) fields.unit_bottle_price = unitPrice;

  const delivery = extractDelivery(raw);
  if (delivery.date) fields.client_delivery_date = delivery.date;
  if (delivery.time) fields.receiving_time = delivery.time;

  const address = extractAddress(raw);
  if (address) core.shipping_address = address;

  const notes = extractPricingNotes(raw);
  if (notes) core.notes = notes;

  if (!Object.keys(fields).length && !Object.keys(core).length) {
    warnings.push('No recognizable confirmation fields found');
  }

  return { fields, core, warnings };
}
