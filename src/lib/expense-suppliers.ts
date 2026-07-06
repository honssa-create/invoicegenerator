/** Built-in supplier master list for expense 供應商 combobox + OCR fuzzy matching. */

export const DEFAULT_SUPPLIERS: string[] = [
  '武汉君诚纸品有限公司 - 包裝廠',
  '金屬襟章-康能',
  '金屬襟章-欣程',
  '金屬襟章-銳趣',
  '金屬襟章-湖北ALEX',
  '金屬襟章-中山ALEX',
  '紙膠帶-Nancy',
  '亞加力-和夫',
  '木匙扣-立世',
  '軟磁石-華韜',
  '頸繩-睿俊织带',
  '馬口鐵-江有為',
  '織嘜-盈美黃生',
  '繡花-金玉',
  '繡花-CHEN',
  '繡花-森衛',
  '印嘜-維依',
  '亞加力-多迪',
  '絨布盒-君林',
  '亞加力-呂楊兵',
  '亞加力-星彩',
  '口罩夾-遠臨文具',
  '口罩夾-風車玩具',
  '口罩夾-華燦',
  '頸繩-宇豐',
  '織嘜-日輝',
  '紙品印刷-安逸夫',
  '馬口鐵-义乌众韵',
  'E-print',
  'HONOUR',
  '金屬襟章 - 康銳黃小姐',
  'Nestiee',
  '雕刻亞加力-利琪',
  '義烏琴云制袋廠',
  '優奕包裝',
  '好運來百貨商品店',
  '食也茗廚家居生活旗艦店',
  '勛昀包裝企業店',
  '潮石旗艦店',
  '順豐',
  '揭陽市興意不銹鋼制品廠',
];

export type SupplierMatchMethod = 'exact' | 'contains' | 'token' | 'fuzzy';

export interface SupplierMatch {
  supplier: string;
  score: number;
  method: SupplierMatchMethod;
}

/** Normalize for comparison — lowercase, strip spaces/punctuation. */
export function normalizeSupplierText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_–—·.，,、()（）[\]【】]/g, '')
    .replace(/有限公司|有限责任公司|公司|厂|廠|店|旗舰|旗艦/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

function fuzzyRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function scorePair(ocrNorm: string, supplier: string): SupplierMatch | null {
  const fullNorm = normalizeSupplierText(supplier);
  if (!fullNorm) return null;

  if (ocrNorm === fullNorm) {
    return { supplier, score: 1, method: 'exact' };
  }
  if (ocrNorm.includes(fullNorm) || fullNorm.includes(ocrNorm)) {
    const ratio = Math.min(ocrNorm.length, fullNorm.length) / Math.max(ocrNorm.length, fullNorm.length);
    return { supplier, score: 0.9 + ratio * 0.08, method: 'contains' };
  }

  const parts = supplier.split(/[-–—]/).map((p) => normalizeSupplierText(p)).filter((p) => p.length >= 2);
  for (const part of parts) {
    if (ocrNorm.includes(part) || part.includes(ocrNorm)) {
      return { supplier, score: 0.88, method: 'token' };
    }
  }

  const fuzzy = fuzzyRatio(ocrNorm, fullNorm);
  if (fuzzy >= 0.62) {
    return { supplier, score: fuzzy, method: 'fuzzy' };
  }
  return null;
}

/** Best supplier match for OCR merchant text or raw receipt text. */
export function matchSupplierFromOcr(ocrText: string, suppliers: string[]): SupplierMatch | null {
  const raw = (ocrText || '').trim();
  if (!raw || !suppliers.length) return null;

  const candidates = new Set<string>();
  for (const line of raw.split(/[\n\r]+/)) {
    const t = line.trim();
    if (t.length >= 2) candidates.add(t);
  }
  candidates.add(raw);

  let best: SupplierMatch | null = null;
  for (const text of Array.from(candidates)) {
    const norm = normalizeSupplierText(text);
    if (norm.length < 2) continue;
    for (const supplier of suppliers) {
      const hit = scorePair(norm, supplier);
      if (!hit) continue;
      if (!best || hit.score > best.score) best = hit;
    }
  }
  return best;
}

export function mergeSupplierLists(...lists: (string | null | undefined)[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const v of list) {
      const key = (v || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

/** Minimum score to auto-fill the supplier field from OCR. */
export const SUPPLIER_OCR_AUTO_FILL_THRESHOLD = 0.72;
