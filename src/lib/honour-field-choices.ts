/** Honour / honour en supplier-card choice catalogs (client-safe). */

export const HONOUR_INTERNAL_PACK_OPTIONS = ['需要', '不需要'] as const;
export type HonourInternalPackOption = (typeof HONOUR_INTERNAL_PACK_OPTIONS)[number];

export const HONOUR_PACK_REQUIRED_OPTIONS = [
  '絨布袋',
  '頸繩+證件套獨立包裝',
  '紙盒包裝',
  '泡泡袋',
  'OPP獨立包裝',
  '90*54mm紙卡+opp袋包裝',
  '108*90mm紙卡+opp袋包裝',
  '其他尺寸紙卡+opp袋包裝',
  '泡沫板',
  '一定數量大包裝',
  '紙卡 + OPP獨立包裝',
  '圓膠盒',
  '半透明膠盒',
  '厚PVC袋',
  '絨布盒包裝',
  '托盤',
] as const;

export const HONOUR_CRAFT_OPTIONS = [
  '金屬襟章-蝕刻+滴膠',
  '金屬襟章-鐳射切割',
  '金屬襟章-鐳射鏤空',
  '單面純金屬色紀念幣',
  '雙面純金屬色紀念幣',
  '雙面填色紀念幣',
  '獎牌-單面填色',
  '獎牌-雙面填色',
  '獎牌-單面純金屬色',
  '獎牌-雙面純金屬色',
  '織嘜-End Fold 兩邊摺',
  '織嘜-Center Fold 中折',
  '金屬襟章-烤漆(Soft Enamel)',
  '金屬襟章-烤漆+滴膠(Soft Enamel + Epoxy)',
  '金屬襟章-烤漆+印刷',
  '金屬襟章-烤漆+滴膠+印刷',
  '金屬襟章-珐瑯(Hard Enamel)',
  '金屬襟章-珐瑯+印刷',
  '金屬襟章-印刷+滴膠',
  '金屬襟章-拉絲金屬牌',
  '金屬襟章-蝕刻',
  '金屬襟章-貼片',
  '金屬襟章-色膏+印刷',
  '金屬襟章-色膏',
  '織嘜-Hem tags 三折',
  '織嘜-Flat 熱切',
  '亞加力-單面',
  '亞加力-雙面',
  '亞加力-彩虹單面',
  '亞加力-立牌',
  '亞加力-彩虹雙面',
  '馬口鐵-光面',
  '馬口鐵-啞面/磨砂',
  '馬口鐵-玻璃碎面',
  '馬口鐵-布紋',
  '布章-滿繡',
  '布章-絨布繡',
  '布章-斜紋繡',
  '布章-Iron On 熱溶膠',
  '布章-車邊+底熱溶膠',
  '布章-扣針底',
  '布匙扣-雙面',
  '布章-車邊+紙朴底',
  '布章-車邊+單面勾面魔術貼',
  '布章-車邊+雙面魔術貼',
  '紙膠帶-壓縮膜',
  '紙膠帶-單面圓標壓縮膜',
  '紙膠帶-雙面圓標壓縮膜',
  'A4 file-20絲磨砂面',
  '軟磁石',
  '口罩1-磨砂半透明',
  '口罩1-磨砂不透明(白底)',
  '口罩2/3-28絲磨砂半透明',
  '口罩2/3-28絲磨砂不透明(白底)',
  '口罩2/3-28絲光面半透明',
  '口罩4-磨砂白色料',
  '紙膠帶-單面圓標摺皺膜',
  '木-鐳射單面匙扣',
  '木-鐳射雙面匙扣',
  '木-鐳射襟章',
  '木-單面印刷',
  '木-雙面印刷',
  '頸繩-熱轉印',
  '頸繩-絲印',
  '棉印唆 - 漂白',
  '棉印唆 - 胚色',
  '膠帶印唆',
  'A4 file-20絲光面',
] as const;

export const HONOUR_PLATING_OPTIONS = [
  '金色 Gold',
  '染黑 Dye Black',
  '黑鎳',
  '銀色 Silver',
  '玫瑰金(鍍紅銅)',
  '鍍古金',
  '噴色',
  '霧鎳',
  '古紅銅',
  '拉絲',
  '鍍古銀',
  '霧金',
] as const;

export const HONOUR_CLASP_OPTIONS = [
  '蝴蝶扣',
  '磁石',
  '普通扣針',
  '安全扣針',
  '異形扣針 (德式別針)',
  '黑膠扣',
  '平頂扣',
  '耳針',
  '四節圓圈',
  'D字扣',
  '鎖形扣',
  '龍蝦扣',
  '小龍蝦扣',
  '熱溶膠底',
  '沒有',
  '布章匙圈',
  '馬口鐵-白膠底扣針',
  '馬口鐵-銀鐵底扣針',
  '馬口鐵-别卡后盖',
  '雙磁石',
  '單面勾面魔術貼',
  '蛋扣',
  '頸後安全扣',
  '可調節帶扣',
  '夾+扣針',
  '銀色貓扣',
  '金色星星扣',
  '金色鎖形扣',
  '金色心形扣',
  '金色龍蝦扣',
  '金色貓扣',
  '金色貓耳扣',
  '彈簧扣',
  '25mm銀色按壓扣',
  '亞加力立牌',
  '圓扣+透明帶',
  '夾扣',
  '不干膠',
  '雙面魔術貼',
  '波珠鍊',
  '熱轉印繩',
  '直身拉鍊証件套',
  '橫身拉鍊証件套',
  '8字扣',
  '袖扣',
  '馬口鐵-鏡底',
  '無底座扣針',
  '插扣',
  '鋼絲',
  '易拉扣+夾扣',
  '易拉扣+透明帶',
  '雙龍蝦扣',
  '銀色調節扣',
  'U型扣',
  '埋磁石',
  '不用配件',
  '呔夾',
  '單面毛面魔術貼',
  '馬口鐵-書簽扣',
  '軟磁石',
  '銀色龍蝦扣',
] as const;

export const HONOUR_MULTI_VALUE_SEP = ' · ';

/** Split stored multi-value string; legacy single values become a one-item array. */
export function parseHonourMultiValue(raw: string): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.includes(HONOUR_MULTI_VALUE_SEP)) {
    return s.split(HONOUR_MULTI_VALUE_SEP).map((v) => v.trim()).filter(Boolean);
  }
  return [s];
}

/** Join selections; when catalog given, sort in catalog order then append unknowns. */
export function joinHonourMultiValue(values: string[], catalog?: readonly string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }
  if (!unique.length) return '';

  if (catalog?.length) {
    const order = new Map(catalog.map((v, i) => [v, i]));
    const inCatalog = unique.filter((v) => order.has(v));
    const orphans = unique.filter((v) => !order.has(v));
    inCatalog.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return [...inCatalog, ...orphans].join(HONOUR_MULTI_VALUE_SEP);
  }

  return unique.join(HONOUR_MULTI_VALUE_SEP);
}

export function normalizeHonourInternalPack(raw: string): '' | HonourInternalPackOption {
  const s = String(raw ?? '').trim();
  if (s === '需要' || s === '不需要') return s;
  if (/不需要|不用/.test(s)) return '不需要';
  if (/需要/.test(s)) return '需要';
  return '';
}
