/** ClickUp 婚宴回禮 field order Vanessa approved (preview + task CAPs). */

export type ClickUpFieldIcon = 'doc' | 'image' | 'date' | 'text' | 'number' | 'dropdown' | 'person';

type Base = { label: string; icon: ClickUpFieldIcon };

export type WeddingClickUpField =
  | (Base & {
      kind:
        | 'po'
        | 'image'
        | 'delivery_date'
        | 'contact'
        | 'address'
        | 'capacity'
        | 'ordered_total'
        | 'gift'
        | 'packaging'
        | 'big_day'
        | 'production_total'
        | 'creator'
        | 'stew'
        | 'source';
    })
  | (Base & { kind: 'text' | 'date'; key: string })
  | (Base & { kind: 'material'; key: string; step?: string })
  | (Base & { kind: 'client_qty'; key: string })
  | (Base & { kind: 'actual_qty'; key: string; clientKey: string })
  | (Base & { kind: 'tag'; tag: 'round' | 'foil'; flavor: 'rock_sugar' | 'osmanthus' | 'red_date' })
  | (Base & { kind: 'pack'; key: string; fallbackKey?: string; step?: string });

export const WEDDING_ORDER_CREATORS = ['Tracy', 'Vanessa', 'Cindy'] as const;
export const WEDDING_STEW_PROGRESS = ['已安排燉製', '燉製完成'] as const;

export const WEDDING_CLICKUP_FIELDS: WeddingClickUpField[] = [
  { label: 'Order #', kind: 'po', icon: 'doc' },
  { label: 'Image preview', kind: 'image', icon: 'image' },
  { label: '客人送貨日期', kind: 'delivery_date', icon: 'date' },
  { label: '客人收件時間', kind: 'text', key: 'receiving_time', icon: 'text' },
  { label: '聯絡方式', kind: 'contact', icon: 'text' },
  { label: '送貨地址', kind: 'address', icon: 'text' },
  { label: '到期日 (Big day後4星期)', kind: 'date', key: 'expiry_date', icon: 'date' },
  { label: '生產日期', kind: 'date', key: 'production_date', icon: 'date' },
  { label: '即食燕窩容量', kind: 'capacity', icon: 'dropdown' },
  { label: '客人訂冰糖味 (樽)', kind: 'client_qty', key: 'qty_rock_sugar', icon: 'number' },
  { label: '客人訂桂花味 (樽)', kind: 'client_qty', key: 'qty_osmanthus', icon: 'number' },
  { label: '客人訂紅棗味 (樽)', kind: 'client_qty', key: 'qty_red_date', icon: 'number' },
  { label: '客人訂總數量', kind: 'ordered_total', icon: 'number' },
  { label: 'Gift', kind: 'gift', icon: 'dropdown' },
  { label: '包裝', kind: 'packaging', icon: 'dropdown' },
  { label: '實際生產樽數-冰糖味', kind: 'actual_qty', key: 'actual_qty_rock_sugar', clientKey: 'qty_rock_sugar', icon: 'number' },
  { label: '實際生產樽數-桂花味', kind: 'actual_qty', key: 'actual_qty_osmanthus', clientKey: 'qty_osmanthus', icon: 'number' },
  { label: '實際生產樽數-紅棗味', kind: 'actual_qty', key: 'actual_qty_red_date', clientKey: 'qty_red_date', icon: 'number' },
  { label: '燕碎 (0.8g)', kind: 'material', key: 'mat_bird_cake', step: '0.01', icon: 'number' },
  { label: '玻璃樽 (25ml)', kind: 'material', key: 'mat_bottle_25ml', icon: 'number' },
  { label: '玻璃樽 (45ml)', kind: 'material', key: 'mat_bottle_45ml', icon: 'number' },
  { label: '桂花 (0.13g)', kind: 'material', key: 'mat_osmanthus', step: '0.01', icon: 'number' },
  { label: '紅棗 (1.8g)', kind: 'material', key: 'mat_red_date', step: '0.01', icon: 'number' },
  { label: '冰糖 (3.57g)', kind: 'material', key: 'mat_rock_sugar', step: '0.01', icon: 'number' },
  { label: '片糖 (5.03g)', kind: 'material', key: 'mat_slab_sugar', step: '0.01', icon: 'number' },
  { label: '圓形tag - 冰糖 (個)', kind: 'tag', tag: 'round', flavor: 'rock_sugar', icon: 'number' },
  { label: '圓形tag - 桂花 (個)', kind: 'tag', tag: 'round', flavor: 'osmanthus', icon: 'number' },
  { label: '圓形tag - 紅棗 (個)', kind: 'tag', tag: 'round', flavor: 'red_date', icon: 'number' },
  { label: '長方形燙金貼紙 - 冰糖 (個)', kind: 'tag', tag: 'foil', flavor: 'rock_sugar', icon: 'number' },
  { label: '長方形燙金貼紙 - 桂花 (個)', kind: 'tag', tag: 'foil', flavor: 'osmanthus', icon: 'number' },
  { label: '長方形燙金貼紙 - 紅棗 (個)', kind: 'tag', tag: 'foil', flavor: 'red_date', icon: 'number' },
  { label: '蝴蝶結絲帶袋 (個)', kind: 'pack', key: 'pack_ribbon_bag_small', fallbackKey: 'pack_bow_qty', icon: 'number' },
  { label: '金繩 (條)', kind: 'pack', key: 'pack_gold_string', icon: 'number' },
  { label: '客人 Wedding Logo Tag (個)', kind: 'pack', key: 'pack_wedding_logo_tag', icon: 'number' },
  { label: '細紙箱 (個) 17x29x9.5cm', kind: 'pack', key: 'pack_carton_small', step: '0.0001', icon: 'number' },
  { label: '大紙箱 (個)', kind: 'pack', key: 'pack_carton_large', icon: 'number' },
  { label: 'Big Day', kind: 'big_day', icon: 'date' },
  { label: '總生產樽數', kind: 'production_total', icon: 'number' },
  { label: 'action', kind: 'text', key: 'wedding_action', icon: 'text' },
  { label: 'Order Creator', kind: 'creator', icon: 'person' },
  { label: '燉製進度', kind: 'stew', icon: 'text' },
  { label: '訂單來源', kind: 'source', icon: 'text' },
];
